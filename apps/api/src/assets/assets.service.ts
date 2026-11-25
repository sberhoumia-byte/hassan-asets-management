import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DEFAULT_INVENTORY_PATTERN, formatNumber, matchesQuery } from "@hassan/shared";
import { LOGO_MAX_BYTES, LOGO_TYPES, type AssetInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { CatalogService } from "../catalog/catalog.service";
import { SpacesService } from "../spaces/spaces.service";
import { StaffService } from "../staff/staff.service";
import { decodeDataUrl, StorageService } from "../files/storage.service";
import { nextSequence } from "../common/sequences";
import { E } from "../common/errors";
import { compact, nullify, UUID_RE } from "../common/util";
import type { AppRequest, AuthUser } from "../common/context";

export interface AssetQuery {
  q?: string;
  categoryId?: string;
  status?: string;
  archived?: boolean;
  roomId?: string;
  responsibleStaffId?: string;
  page: number;
  pageSize: number;
}

const include = {
  category: { select: { id: true, code: true, nameAr: true, nameFr: true } },
  supplier: { select: { id: true, name: true } },
  room: { select: { id: true, code: true, name: true } },
  facility: { select: { id: true, code: true, name: true } },
  responsible: { select: { id: true, fullNameAr: true } },
} as const;
type Row = Prisma.AssetGetPayload<{ include: typeof include }>;

const dateOnly = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);

@Injectable()
export class AssetsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private catalog: CatalogService,
    private storage: StorageService,
    private spaces: SpacesService,
    private staff: StaffService,
  ) {}

  private dto(a: Row) {
    return compact({
      id: a.id,
      inventoryNumber: a.inventoryNumber,
      name: a.name,
      categoryId: a.categoryId,
      category: a.category,
      assetTypeId: a.assetTypeId,
      description: a.description,
      trackingMode: a.trackingMode,
      quantity: a.quantity,
      serialNumber: a.serialNumber,
      acquisitionDate: a.acquisitionDate?.toISOString().slice(0, 10),
      fundingSourceId: a.fundingSourceId,
      acquisitionValue: a.acquisitionValue === null ? null : Number(a.acquisitionValue),
      supplierId: a.supplierId,
      supplier: a.supplier,
      status: a.status,
      roomId: a.roomId,
      room: a.room?.name,
      facilityId: a.facilityId,
      facility: a.facility?.name,
      responsibleStaffId: a.responsibleStaffId,
      responsible: a.responsible?.fullNameAr,
      qrToken: a.qrToken,
      hasPhoto: !!a.photoFileId,
      archivedAt: a.archivedAt?.toISOString(),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    });
  }

  /** البحث بالاسم أو رقم الجرد أو الرقم التسلسلي يطبّع العربية (نفس منطق الواجهة). */
  async list(schoolId: string, f: AssetQuery) {
    const where: Prisma.AssetWhereInput = {
      schoolId,
      archivedAt: f.archived ? { not: null } : null,
      ...(f.categoryId && UUID_RE.test(f.categoryId) ? { categoryId: f.categoryId } : {}),
      ...(f.roomId && UUID_RE.test(f.roomId) ? { roomId: f.roomId } : {}),
      ...(f.responsibleStaffId && UUID_RE.test(f.responsibleStaffId) ? { responsibleStaffId: f.responsibleStaffId } : {}),
      ...(f.status && ["AVAILABLE", "DAMAGED", "UNDER_REPAIR", "DISPOSED"].includes(f.status) ? { status: f.status as never } : {}),
    };
    let rows = await this.prisma.asset.findMany({ where, include, orderBy: { inventoryNumber: "asc" } });
    if (f.q) rows = rows.filter((a) => matchesQuery(f.q!, a.name, a.inventoryNumber, a.serialNumber ?? undefined));
    const total = rows.length;
    const items = rows.slice((f.page - 1) * f.pageSize, f.page * f.pageSize).map((a) => this.dto(a));
    return { items, total, page: f.page, pageSize: f.pageSize };
  }

  async get(schoolId: string, id: string) {
    const a = await this.prisma.asset.findFirst({ where: { id, schoolId }, include: { ...include, photoFile: true } });
    if (!a) throw E.notFound(); // كيان مؤسسة أخرى = غير موجود
    return { ...this.dto(a), photoDataUrl: await this.storage.dataUrl(a.photoFile) };
  }

  private async refs(schoolId: string, input: AssetInput) {
    await this.catalog.assertCategory(schoolId, input.categoryId);
    await this.catalog.assertLookup(schoolId, "ASSET_TYPE", input.assetTypeId, "assetTypeId");
    await this.catalog.assertLookup(schoolId, "FUNDING_SOURCE", input.fundingSourceId, "fundingSourceId");
    await this.catalog.assertSupplier(schoolId, input.supplierId);
    await this.spaces.assertRoom(schoolId, input.roomId);
    await this.spaces.assertFacility(schoolId, input.facilityId);
    await this.staff.assertStaff(schoolId, input.responsibleStaffId, "responsibleStaffId");
  }

  private data(input: AssetInput) {
    const t = nullify({
      description: input.description,
      serialNumber: input.serialNumber,
      assetTypeId: input.assetTypeId ?? "",
      fundingSourceId: input.fundingSourceId ?? "",
      supplierId: input.supplierId ?? "",
      roomId: input.roomId ?? "",
      facilityId: input.facilityId ?? "",
      responsibleStaffId: input.responsibleStaffId ?? "",
    });
    return {
      name: input.name.trim(),
      categoryId: input.categoryId,
      trackingMode: input.trackingMode,
      quantity: input.trackingMode === "INDIVIDUAL" ? 1 : input.quantity,
      acquisitionDate: dateOnly(input.acquisitionDate),
      acquisitionValue: input.acquisitionValue ?? null,
      status: input.status,
      ...t,
    };
  }

  /** رقم جرد جديد حسب صيغة المؤسسة (يُستعمل أيضاً عند إدخال ممتلكات من الاقتناء). */
  async generateNumber(tx: Prisma.TransactionClient, schoolId: string) {
    const [settings, school] = await Promise.all([
      tx.schoolSettings.findUnique({ where: { schoolId } }),
      tx.school.findUniqueOrThrow({ where: { id: schoolId }, select: { adminCode: true } }),
    ]);
    const pattern = settings?.inventoryNumberPattern || DEFAULT_INVENTORY_PATTERN;
    const year = new Date().getFullYear();
    // رقم أدخله المستخدم يدوياً قد يصادف رقماً مولداً: نتجاوزه
    for (let i = 0; i < 20; i++) {
      const n = formatNumber(pattern, { school: school.adminCode, year, seq: await nextSequence(tx, schoolId, "ASSET", year) });
      if (!(await tx.asset.count({ where: { schoolId, inventoryNumber: n } }))) return n;
    }
    throw E.rule("NUMBER_GENERATION_FAILED");
  }

  private photo(input: AssetInput) {
    return input.photoDataUrl ? decodeDataUrl(input.photoDataUrl, LOGO_TYPES, LOGO_MAX_BYTES, "photo") : null;
  }

  async create(schoolId: string, input: AssetInput, user: AuthUser, req: AppRequest) {
    await this.refs(schoolId, input);
    const photo = this.photo(input);
    const manual = input.inventoryNumber?.trim();
    if (manual && (await this.prisma.asset.count({ where: { schoolId, inventoryNumber: manual } }))) throw E.conflict("DUPLICATE_INVENTORY_NUMBER");
    try {
      const a = await this.prisma.$transaction(async (tx) => {
        const inventoryNumber = manual || (await this.generateNumber(tx, schoolId));
        const photoFileId = photo
          ? (await this.storage.save(tx, { schoolId, buf: photo.buf, mime: photo.mime, originalName: "asset-photo", uploadedById: user.id })).id
          : null;
        const a = await tx.asset.create({ data: { schoolId, inventoryNumber, photoFileId, createdById: user.id, ...this.data(input) }, include });
        if (a.roomId) await tx.assetLocation.create({ data: { assetId: a.id, roomId: a.roomId } });
        await this.audit.log({ action: "ASSET_CREATE", entityType: "Asset", entityId: a.id, after: { ...this.dto(a), nameAr: a.name } }, req, tx);
        return a;
      });
      return this.dto(a);
    } catch (e) {
      // طلبان متزامنان بنفس الرقم اليدوي: القيد الفريد في القاعدة يحسم
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw E.conflict("DUPLICATE_INVENTORY_NUMBER");
      throw e;
    }
  }

  async update(schoolId: string, id: string, input: AssetInput, user: AuthUser, req: AppRequest) {
    const before = await this.prisma.asset.findFirst({ where: { id, schoolId }, include: { ...include, photoFile: true } });
    if (!before) throw E.notFound();
    if (before.archivedAt) throw E.rule("ASSET_ARCHIVED");
    await this.refs(schoolId, input);
    const manual = input.inventoryNumber?.trim();
    if (manual && manual !== before.inventoryNumber && (await this.prisma.asset.count({ where: { schoolId, inventoryNumber: manual } })))
      throw E.conflict("DUPLICATE_INVENTORY_NUMBER");
    // photoDataUrl: undefined = بلا تغيير، null = حذف، نص = صورة (جديدة أو نفسها)
    const photo = input.photoDataUrl === undefined ? undefined : this.photo(input);
    try {
      const a = await this.prisma.$transaction(async (tx) => {
        let photoFileId = before.photoFileId;
        if (photo === null) photoFileId = null;
        else if (photo && (!before.photoFile || (await this.storage.sha(photo.buf)) !== before.photoFile.sha256))
          photoFileId = (await this.storage.save(tx, { schoolId, buf: photo.buf, mime: photo.mime, originalName: "asset-photo", uploadedById: user.id })).id;
        const a = await tx.asset.update({
          where: { id },
          data: { ...this.data(input), inventoryNumber: manual || before.inventoryNumber, photoFileId },
          include,
        });
        // سجل المواقع: إغلاق الموقع السابق وفتح الجديد عند تغيير الفضاء
        if (a.roomId !== before.roomId) {
          await tx.assetLocation.updateMany({ where: { assetId: id, toDate: null }, data: { toDate: new Date() } });
          if (a.roomId) await tx.assetLocation.create({ data: { assetId: id, roomId: a.roomId } });
        }
        await this.audit.log({ action: "ASSET_UPDATE", entityType: "Asset", entityId: id, before: this.dto(before), after: { ...this.dto(a), nameAr: a.name } }, req, tx);
        return a;
      });
      return this.dto(a);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw E.conflict("DUPLICATE_INVENTORY_NUMBER");
      throw e;
    }
  }

  /** الاستبعاد: لا حذف فعلي. الحالة DISPOSED + تاريخ + سبب في سجل التدقيق. */
  async archive(schoolId: string, id: string, reason: string, req: AppRequest) {
    const before = await this.prisma.asset.findFirst({ where: { id, schoolId }, include });
    if (!before) throw E.notFound();
    if (before.archivedAt) throw E.rule("ASSET_ARCHIVED");
    const a = await this.prisma.$transaction(async (tx) => {
      const a = await tx.asset.update({ where: { id }, data: { status: "DISPOSED", archivedAt: new Date() }, include });
      await this.audit.log(
        { action: "ASSET_ARCHIVE", entityType: "Asset", entityId: id, before: { status: before.status }, after: { status: "DISPOSED", reason, nameAr: a.name } },
        req,
        tx,
      );
      return a;
    });
    return this.dto(a);
  }

  async history(schoolId: string, id: string) {
    if (!(await this.prisma.asset.count({ where: { id, schoolId } }))) throw E.notFound();
    const rows = await this.prisma.auditLog.findMany({
      where: { schoolId, entityType: "Asset", entityId: id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { fullNameAr: true } } },
    });
    return rows.map((r) => ({
      at: r.createdAt.toISOString(),
      by: r.user?.fullNameAr ?? "",
      action: r.action,
      reason: ((r.after ?? {}) as { reason?: string }).reason,
      changes: diff(r.before, r.after),
    }));
  }

  /** حل رمز QR: يعيد المؤسسة والكيان فقط، والوصول يُتحقق منه بعدها بالصلاحيات العادية. */
  async scan(qrToken: string) {
    if (!UUID_RE.test(qrToken)) throw E.notFound();
    const a = await this.prisma.asset.findUnique({ where: { qrToken }, select: { id: true, schoolId: true } });
    if (a) return { kind: "asset" as const, id: a.id, schoolId: a.schoolId };
    throw E.notFound();
  }
}

const TRACKED = ["inventoryNumber", "name", "categoryId", "status", "quantity", "serialNumber", "acquisitionDate", "acquisitionValue", "supplierId", "description", "roomId", "facilityId", "responsibleStaffId"];
function diff(before: unknown, after: unknown) {
  if (!before || !after) return undefined;
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const out = TRACKED.filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null)).map((k) => ({ field: k, from: b[k] ?? null, to: a[k] ?? null }));
  return out.length ? out : undefined;
}
