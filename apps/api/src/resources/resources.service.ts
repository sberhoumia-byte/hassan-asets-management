import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { matchesQuery } from "@hassan/shared";
import { LOGO_MAX_BYTES, LOGO_TYPES, type ResourceInput, type ResourceUnitInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { CatalogService } from "../catalog/catalog.service";
import { SpacesService } from "../spaces/spaces.service";
import { decodeDataUrl, StorageService } from "../files/storage.service";
import { E } from "../common/errors";
import { compact, nullify, UUID_RE } from "../common/util";
import type { AppRequest, AuthUser } from "../common/context";

type Tx = Prisma.TransactionClient | PrismaService;
const dateOnly = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
const OPEN = ["ACTIVE", "PARTIALLY_RETURNED"] as const;

/** الكمية المعارة حالياً من صنف كمي = مجموع الإعارات المفتوحة − ما أُرجع منها. */
export async function onLoanQuantity(tx: Tx, resourceIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!resourceIds.length) return out;
  const rows = await tx.resourceLoan.findMany({
    where: { resourceId: { in: resourceIds }, unitId: null, status: { in: [...OPEN] } },
    select: { resourceId: true, quantity: true, returns: { select: { quantity: true } } },
  });
  for (const r of rows) out.set(r.resourceId, (out.get(r.resourceId) ?? 0) + r.quantity - r.returns.reduce((s, x) => s + x.quantity, 0));
  return out;
}

/** الوسائل التعليمية: أصناف فردية (وحدات برقم جرد و QR) أو كمية (إجمالي/معطوب/معار). */
@Injectable()
export class ResourcesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private catalog: CatalogService,
    private spaces: SpacesService,
    private storage: StorageService,
  ) {}

  async list(schoolId: string, f: { q?: string; resourceTypeId?: string; archived?: boolean; lendable?: boolean }) {
    const rows = await this.prisma.educationalResource.findMany({
      where: {
        schoolId,
        archivedAt: f.archived ? { not: null } : null,
        ...(f.resourceTypeId && UUID_RE.test(f.resourceTypeId) ? { resourceTypeId: f.resourceTypeId } : {}),
        ...(f.lendable ? { isLendable: true } : {}),
      },
      include: { units: { select: { status: true } }, room: { select: { name: true } } },
      orderBy: { code: "asc" },
    });
    const filtered = rows.filter((r) => matchesQuery(f.q ?? "", r.name, r.code));
    const lent = await onLoanQuantity(this.prisma, filtered.filter((r) => r.trackingMode === "QUANTITY").map((r) => r.id));
    return filtered.map((r) => compact({ ...this.base(r), room: r.room?.name, ...this.availability(r, lent.get(r.id) ?? 0) }));
  }

  private base(r: { id: string; code: string; name: string; resourceTypeId: string | null; categoryId: string | null; trackingMode: string; roomId: string | null; acquisitionDate: Date | null; isLendable: boolean; archivedAt: Date | null; photoFileId: string | null }) {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      resourceTypeId: r.resourceTypeId,
      categoryId: r.categoryId,
      trackingMode: r.trackingMode,
      roomId: r.roomId,
      acquisitionDate: r.acquisitionDate?.toISOString().slice(0, 10),
      isLendable: r.isLendable,
      hasPhoto: !!r.photoFileId,
      archivedAt: r.archivedAt?.toISOString(),
    };
  }

  /** الأعداد المعروضة: إجمالي، متاح، معار، معطوب (وقيد الصيانة للوحدات). */
  private availability(r: { trackingMode: string; quantityTotal: number; quantityDamaged: number; units: { status: string }[] }, lent: number) {
    if (r.trackingMode === "QUANTITY")
      return { total: r.quantityTotal, damaged: r.quantityDamaged, onLoan: lent, maintenance: 0, available: Math.max(0, r.quantityTotal - r.quantityDamaged - lent) };
    const live = r.units.filter((u) => u.status !== "DISPOSED");
    const c = (s: string) => live.filter((u) => u.status === s).length;
    return { total: live.length, damaged: c("DAMAGED"), onLoan: c("ON_LOAN"), maintenance: c("UNDER_MAINTENANCE"), available: c("AVAILABLE") };
  }

  async get(schoolId: string, id: string) {
    const r = await this.prisma.educationalResource.findFirst({
      where: { id, schoolId },
      include: {
        photoFile: true,
        room: { select: { name: true } },
        units: { include: { room: { select: { name: true } }, loans: { where: { status: { in: [...OPEN] } }, include: { borrower: { select: { fullNameAr: true } } } } }, orderBy: { inventoryNumber: "asc" } },
      },
    });
    if (!r) throw E.notFound();
    const lent = (await onLoanQuantity(this.prisma, [r.id])).get(r.id) ?? 0;
    return compact({
      ...this.base(r),
      room: r.room?.name,
      ...this.availability(r, lent),
      photoDataUrl: await this.storage.dataUrl(r.photoFile),
      units: r.units.map((u) =>
        compact({
          id: u.id,
          inventoryNumber: u.inventoryNumber,
          serialNumber: u.serialNumber,
          status: u.status,
          roomId: u.roomId,
          room: u.room?.name,
          qrToken: u.qrToken,
          loan: u.loans[0] ? { id: u.loans[0].id, number: u.loans[0].number, borrower: u.loans[0].borrower.fullNameAr, dueAt: u.loans[0].dueAt.toISOString() } : undefined,
        }),
      ),
    });
  }

  private async refs(schoolId: string, i: ResourceInput) {
    await this.catalog.assertLookup(schoolId, "RESOURCE_TYPE", i.resourceTypeId || null, "resourceTypeId");
    await this.catalog.assertCategory(schoolId, i.categoryId || null);
    await this.spaces.assertRoom(schoolId, i.roomId);
  }

  private data(i: ResourceInput) {
    return {
      code: i.code,
      name: i.name.trim(),
      trackingMode: i.trackingMode,
      quantityTotal: i.trackingMode === "QUANTITY" ? i.quantityTotal : 0,
      acquisitionDate: dateOnly(i.acquisitionDate),
      isLendable: i.isLendable,
      ...nullify({ resourceTypeId: i.resourceTypeId ?? "", categoryId: i.categoryId ?? "", roomId: i.roomId ?? "" }),
    };
  }

  private photo(i: ResourceInput) {
    return i.photoDataUrl ? decodeDataUrl(i.photoDataUrl, LOGO_TYPES, LOGO_MAX_BYTES, "photo") : null;
  }

  async create(schoolId: string, i: ResourceInput, user: AuthUser, req: AppRequest) {
    await this.refs(schoolId, i);
    if (await this.prisma.educationalResource.count({ where: { schoolId, code: i.code } })) throw E.conflict("DUPLICATE_CODE");
    const photo = this.photo(i);
    return this.prisma.$transaction(async (tx) => {
      const photoFileId = photo ? (await this.storage.save(tx, { schoolId, buf: photo.buf, mime: photo.mime, originalName: "resource-photo", uploadedById: user.id })).id : null;
      const r = await tx.educationalResource.create({ data: { schoolId, photoFileId, ...this.data(i) } });
      await this.audit.log({ action: "RESOURCE_CREATE", entityType: "EducationalResource", entityId: r.id, after: { ...r, nameAr: r.name } }, req, tx);
      return { id: r.id };
    });
  }

  async update(schoolId: string, id: string, i: ResourceInput, user: AuthUser, req: AppRequest) {
    const before = await this.prisma.educationalResource.findFirst({ where: { id, schoolId }, include: { photoFile: true } });
    if (!before) throw E.notFound();
    if (before.archivedAt) throw E.rule("ARCHIVED");
    await this.refs(schoolId, i);
    if (i.code !== before.code && (await this.prisma.educationalResource.count({ where: { schoolId, code: i.code } }))) throw E.conflict("DUPLICATE_CODE");
    if (i.trackingMode !== before.trackingMode) {
      const used = (await this.prisma.educationalResourceUnit.count({ where: { resourceId: id } })) + (await this.prisma.resourceLoan.count({ where: { resourceId: id } }));
      if (used || before.quantityTotal > 0) throw E.rule("TRACKING_LOCKED");
    }
    const photo = i.photoDataUrl === undefined ? undefined : this.photo(i);
    return this.prisma.$transaction(async (tx) => {
      // قفل الصنف: الإجمالي لا ينزل تحت المعطوب + المعار حتى مع إعارة متزامنة
      await tx.$queryRaw`SELECT id FROM educational_resources WHERE id = ${id}::uuid FOR UPDATE`;
      if (i.trackingMode === "QUANTITY") {
        const lent = (await onLoanQuantity(tx, [id])).get(id) ?? 0;
        const cur = await tx.educationalResource.findUniqueOrThrow({ where: { id } });
        if (i.quantityTotal < cur.quantityDamaged + lent) throw E.rule("QUANTITY_BELOW_USED", { minimum: cur.quantityDamaged + lent });
      }
      let photoFileId = before.photoFileId;
      if (photo === null) photoFileId = null;
      else if (photo && (!before.photoFile || (await this.storage.sha(photo.buf)) !== before.photoFile.sha256))
        photoFileId = (await this.storage.save(tx, { schoolId, buf: photo.buf, mime: photo.mime, originalName: "resource-photo", uploadedById: user.id })).id;
      const r = await tx.educationalResource.update({ where: { id }, data: { ...this.data(i), photoFileId } });
      await this.audit.log({ action: "RESOURCE_UPDATE", entityType: "EducationalResource", entityId: id, before, after: { ...r, nameAr: r.name } }, req, tx);
      return { id };
    });
  }

  /** معطوب الصنف الكمي يتغير خارج الإعارة (إصلاح أو تلف في القسم) بسبب إلزامي. */
  async setDamaged(schoolId: string, id: string, quantityDamaged: number, reason: string, req: AppRequest) {
    const r0 = await this.prisma.educationalResource.findFirst({ where: { id, schoolId } });
    if (!r0) throw E.notFound();
    if (r0.trackingMode !== "QUANTITY") throw E.rule("NOT_QUANTITY_RESOURCE");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM educational_resources WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.educationalResource.findUniqueOrThrow({ where: { id } });
      const lent = (await onLoanQuantity(tx, [id])).get(id) ?? 0;
      if (quantityDamaged > r.quantityTotal - lent) throw E.rule("QUANTITY_BELOW_USED", { maximum: r.quantityTotal - lent });
      await tx.educationalResource.update({ where: { id }, data: { quantityDamaged } });
      await this.audit.log(
        { action: "RESOURCE_DAMAGE_SET", entityType: "EducationalResource", entityId: id, before: { quantityDamaged: r.quantityDamaged }, after: { quantityDamaged, reason, nameAr: r.name } },
        req,
        tx,
      );
      return { id };
    });
  }

  async archive(schoolId: string, id: string, archived: boolean, req: AppRequest) {
    const r = await this.prisma.educationalResource.findFirst({ where: { id, schoolId } });
    if (!r) throw E.notFound();
    if (archived && (await this.prisma.resourceLoan.count({ where: { resourceId: id, status: { in: [...OPEN] } } }))) throw E.rule("RESOURCE_ON_LOAN");
    return this.prisma.$transaction(async (tx) => {
      await tx.educationalResource.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await this.audit.log({ action: archived ? "RESOURCE_ARCHIVE" : "RESOURCE_RESTORE", entityType: "EducationalResource", entityId: id, after: { nameAr: r.name } }, req, tx);
      return { id };
    });
  }

  // ---------------- الوحدات الفردية ----------------
  private async individual(schoolId: string, resourceId: string) {
    const r = await this.prisma.educationalResource.findFirst({ where: { id: resourceId, schoolId } });
    if (!r) throw E.notFound();
    if (r.archivedAt) throw E.rule("ARCHIVED");
    if (r.trackingMode !== "INDIVIDUAL") throw E.rule("NOT_INDIVIDUAL_RESOURCE");
    return r;
  }

  async addUnit(schoolId: string, resourceId: string, i: ResourceUnitInput, req: AppRequest) {
    const r = await this.individual(schoolId, resourceId);
    await this.spaces.assertRoom(schoolId, i.roomId);
    const manual = i.inventoryNumber?.trim();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM educational_resources WHERE id = ${resourceId}::uuid FOR UPDATE`;
        let inventoryNumber = manual;
        if (!inventoryNumber) {
          // الرقم التالي: رمز الصنف + تسلسل من 3 أرقام لا يتكرر
          const n = await tx.educationalResourceUnit.count({ where: { resourceId } });
          for (let k = n + 1; ; k++) {
            const cand = `${r.code}-${String(k).padStart(3, "0")}`;
            if (!(await tx.educationalResourceUnit.count({ where: { resourceId, inventoryNumber: cand } }))) {
              inventoryNumber = cand;
              break;
            }
          }
        } else if (await tx.educationalResourceUnit.count({ where: { resourceId, inventoryNumber } })) throw E.conflict("DUPLICATE_INVENTORY_NUMBER");
        const u = await tx.educationalResourceUnit.create({
          data: { resourceId, inventoryNumber: inventoryNumber!, status: i.status, ...nullify({ serialNumber: i.serialNumber, roomId: i.roomId ?? "" }) },
        });
        await this.audit.log({ action: "RESOURCE_UNIT_CREATE", entityType: "EducationalResourceUnit", entityId: u.id, after: { ...u, nameAr: `${r.name} ${u.inventoryNumber}` } }, req, tx);
        return { id: u.id, inventoryNumber: u.inventoryNumber };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw E.conflict("DUPLICATE_INVENTORY_NUMBER");
      throw e;
    }
  }

  async updateUnit(schoolId: string, resourceId: string, unitId: string, i: ResourceUnitInput, req: AppRequest) {
    await this.individual(schoolId, resourceId);
    const before = await this.prisma.educationalResourceUnit.findFirst({ where: { id: unitId, resourceId } });
    if (!before) throw E.notFound();
    // الحالة «معارة» تديرها الإعارة والإرجاع فقط: أثناء الإعارة تُحفظ باقي الحقول وتبقى الحالة كما هي
    await this.spaces.assertRoom(schoolId, i.roomId);
    const manual = i.inventoryNumber?.trim() || before.inventoryNumber;
    if (manual !== before.inventoryNumber && (await this.prisma.educationalResourceUnit.count({ where: { resourceId, inventoryNumber: manual } })))
      throw E.conflict("DUPLICATE_INVENTORY_NUMBER");
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.educationalResourceUnit.update({
        where: { id: unitId },
        data: { inventoryNumber: manual, status: before.status === "ON_LOAN" ? "ON_LOAN" : i.status, ...nullify({ serialNumber: i.serialNumber, roomId: i.roomId ?? "" }) },
      });
      await this.audit.log({ action: "RESOURCE_UNIT_UPDATE", entityType: "EducationalResourceUnit", entityId: unitId, before, after: u }, req, tx);
      return { id: unitId };
    });
  }

  async scanUnit(qrToken: string) {
    if (!UUID_RE.test(qrToken)) return null;
    const u = await this.prisma.educationalResourceUnit.findUnique({ where: { qrToken }, select: { id: true, resource: { select: { id: true, schoolId: true } } } });
    return u ? { kind: "resourceUnit" as const, id: u.resource.id, unitId: u.id, schoolId: u.resource.schoolId } : null;
  }
}
