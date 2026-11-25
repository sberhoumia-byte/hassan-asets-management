import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { matchesQuery } from "@hassan/shared";
import { DOCUMENT_MAX_BYTES, type DocumentCreateInput, type DocumentMetaInput, type DocumentVersionInput } from "@hassan/validation";
import { AuditService } from "../common/audit.service";
import type { AppRequest, AuthUser } from "../common/context";
import { E } from "../common/errors";
import { compact, nullify, UUID_RE } from "../common/util";
import { CatalogService } from "../catalog/catalog.service";
import { sniffMime, StorageService } from "../files/storage.service";
import { PrismaService } from "../prisma/prisma.service";

const DOC_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const dateOnly = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined);
const include = { versions: { include: { file: true }, orderBy: { version: "desc" as const } }, links: true } satisfies Prisma.DocumentInclude;
type Row = Prisma.DocumentGetPayload<{ include: typeof include }>;

/**
 * الوثائق المرفوعة (فواتير، محاضر، عقود...): كل رفع جديد إصدار جديد، والإصدارات السابقة تبقى قابلة للتنزيل.
 * لا حذف: أرشفة فقط (مفروض أيضاً بقادح في قاعدة البيانات). الوثيقة المقيدة لا يراها إلا من يملك documents.update.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
    private catalog: CatalogService,
  ) {}

  private canSeeRestricted(req: AppRequest) {
    return !!req.permissions?.has("documents.update");
  }

  private decode(dataBase64: string) {
    const buf = Buffer.from(dataBase64, "base64");
    if (!buf.length) throw E.validation({ fields: { file: "errors.required" } });
    if (buf.length > DOCUMENT_MAX_BYTES) throw E.validation({ fields: { file: "errors.fileTooLarge" } });
    const mime = sniffMime(buf);
    if (!mime || !DOC_TYPES.includes(mime)) throw E.validation({ fields: { file: "errors.fileType" } });
    return { buf, mime };
  }

  /** كل كيان مرتبط يجب أن يتبع نفس المؤسسة. */
  private async assertLinks(schoolId: string, links: DocumentMetaInput["links"]) {
    for (const [i, l] of links.entries()) {
      const where = { id: l.entityId, schoolId };
      const n = !UUID_RE.test(l.entityId)
        ? 0
        : l.entityType === "ASSET"
          ? await this.prisma.asset.count({ where })
          : l.entityType === "SUPPLIER"
            ? await this.prisma.supplier.count({ where })
            : l.entityType === "PURCHASE_ORDER"
              ? await this.prisma.purchaseOrder.count({ where })
              : l.entityType === "MAINTENANCE_REQUEST"
                ? await this.prisma.maintenanceRequest.count({ where })
                : l.entityType === "ROOM"
                  ? await this.prisma.room.count({ where })
                  : await this.prisma.facility.count({ where });
      if (!n) throw E.validation({ fields: { [`links.${i}`]: "errors.invalidChoice" } });
    }
    // إزالة التكرار
    return [...new Map(links.map((l) => [`${l.entityType}:${l.entityId}`, l])).values()];
  }

  /** تسميات الكيانات المرتبطة (رقم الجرد، اسم المورد...) للعرض. */
  private async linkLabels(rows: { entityType: string; entityId: string }[]) {
    const ids = (t: string) => rows.filter((r) => r.entityType === t).map((r) => r.entityId);
    const [a, s, p, m, r, f] = await Promise.all([
      this.prisma.asset.findMany({ where: { id: { in: ids("ASSET") } }, select: { id: true, inventoryNumber: true, name: true } }),
      this.prisma.supplier.findMany({ where: { id: { in: ids("SUPPLIER") } }, select: { id: true, name: true } }),
      this.prisma.purchaseOrder.findMany({ where: { id: { in: ids("PURCHASE_ORDER") } }, select: { id: true, number: true } }),
      this.prisma.maintenanceRequest.findMany({ where: { id: { in: ids("MAINTENANCE_REQUEST") } }, select: { id: true, number: true } }),
      this.prisma.room.findMany({ where: { id: { in: ids("ROOM") } }, select: { id: true, code: true, name: true } }),
      this.prisma.facility.findMany({ where: { id: { in: ids("FACILITY") } }, select: { id: true, code: true, name: true } }),
    ]);
    const m2 = new Map<string, string>();
    a.forEach((x) => m2.set(x.id, `${x.inventoryNumber} — ${x.name}`));
    s.forEach((x) => m2.set(x.id, x.name));
    p.forEach((x) => m2.set(x.id, x.number));
    m.forEach((x) => m2.set(x.id, x.number));
    r.forEach((x) => m2.set(x.id, `${x.code} — ${x.name}`));
    f.forEach((x) => m2.set(x.id, `${x.code} — ${x.name}`));
    return m2;
  }

  private async users(ids: string[]) {
    const u = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, fullNameAr: true } });
    return new Map(u.map((x) => [x.id, x.fullNameAr]));
  }

  private summary(d: Row) {
    const cur = d.versions[0];
    return compact({
      id: d.id,
      title: d.title,
      categoryId: d.categoryId ?? undefined,
      documentDate: ymd(d.documentDate),
      issuingBody: d.issuingBody ?? undefined,
      expiresAt: ymd(d.expiresAt),
      accessLevel: d.accessLevel as "SCHOOL" | "RESTRICTED",
      archivedAt: d.archivedAt?.toISOString(),
      version: cur?.version ?? 0,
      mimeType: cur?.file.mimeType,
      sizeBytes: cur?.file.sizeBytes,
      fileName: cur?.file.originalName,
      linkCount: d.links.length,
      updatedAt: d.updatedAt.toISOString(),
    });
  }

  async list(schoolId: string, f: { q?: string; categoryId?: string; archived?: boolean; entityType?: string; entityId?: string }, req: AppRequest) {
    const rows = await this.prisma.document.findMany({
      where: {
        schoolId,
        archivedAt: f.archived ? { not: null } : null,
        ...(f.categoryId && UUID_RE.test(f.categoryId) ? { categoryId: f.categoryId } : {}),
        ...(this.canSeeRestricted(req) ? {} : { accessLevel: "SCHOOL" }),
        ...(f.entityType && f.entityId && UUID_RE.test(f.entityId) ? { links: { some: { entityType: f.entityType, entityId: f.entityId } } } : {}),
      },
      include,
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    return rows.filter((d) => matchesQuery(f.q ?? "", d.title, d.issuingBody ?? undefined, d.notes ?? undefined, d.versions[0]?.file.originalName)).map((d) => this.summary(d));
  }

  private async row(schoolId: string, id: string, req: AppRequest) {
    const d = UUID_RE.test(id) ? await this.prisma.document.findFirst({ where: { id, schoolId }, include }) : null;
    if (!d || (d.accessLevel === "RESTRICTED" && !this.canSeeRestricted(req))) throw E.notFound();
    return d;
  }

  async get(schoolId: string, id: string, req: AppRequest) {
    const d = await this.row(schoolId, id, req);
    const [labels, users] = await Promise.all([this.linkLabels(d.links), this.users(d.versions.map((v) => v.uploadedById).concat(d.createdById))]);
    return {
      ...this.summary(d),
      notes: d.notes ?? undefined,
      createdBy: users.get(d.createdById) ?? "",
      createdAt: d.createdAt.toISOString(),
      links: d.links.map((l) => ({ entityType: l.entityType, entityId: l.entityId, label: labels.get(l.entityId) ?? "" })),
      versions: d.versions.map((v) =>
        compact({
          id: v.id,
          version: v.version,
          fileName: v.file.originalName,
          mimeType: v.file.mimeType,
          sizeBytes: v.file.sizeBytes,
          sha256: v.file.sha256,
          changeNote: v.changeNote ?? undefined,
          uploadedBy: users.get(v.uploadedById) ?? "",
          createdAt: v.createdAt.toISOString(),
        }),
      ),
    };
  }

  private meta(i: DocumentMetaInput) {
    const t = nullify({ issuingBody: i.issuingBody, notes: i.notes, categoryId: i.categoryId ?? "" });
    return { title: i.title.trim(), documentDate: dateOnly(i.documentDate), expiresAt: dateOnly(i.expiresAt), accessLevel: i.accessLevel, ...t };
  }

  async create(schoolId: string, i: DocumentCreateInput, user: AuthUser, req: AppRequest) {
    await this.catalog.assertLookup(schoolId, "DOCUMENT_CATEGORY", i.categoryId || null, "categoryId");
    const links = await this.assertLinks(schoolId, i.links);
    const file = this.decode(i.dataBase64);
    const id = await this.prisma.$transaction(async (tx) => {
      const f = await this.storage.save(tx, { schoolId, buf: file.buf, mime: file.mime, originalName: i.fileName, uploadedById: user.id });
      const d = await tx.document.create({
        data: { schoolId, createdById: user.id, ...this.meta(i), versions: { create: { version: 1, fileId: f.id, uploadedById: user.id } }, links: { create: links } },
      });
      await this.audit.log({ action: "DOCUMENT_CREATE", entityType: "Document", entityId: d.id, after: { nameAr: d.title, file: f.originalName, sha256: f.sha256, links } }, req, tx);
      return d.id;
    });
    return this.get(schoolId, id, req);
  }

  async update(schoolId: string, id: string, i: DocumentMetaInput, req: AppRequest) {
    const before = await this.row(schoolId, id, req);
    if (before.archivedAt) throw E.rule("DOCUMENT_ARCHIVED");
    await this.catalog.assertLookup(schoolId, "DOCUMENT_CATEGORY", i.categoryId || null, "categoryId");
    const links = await this.assertLinks(schoolId, i.links);
    await this.prisma.$transaction(async (tx) => {
      const d = await tx.document.update({ where: { id }, data: this.meta(i) });
      // الروابط ليست بيانات حساسة: تُستبدل، والفرق محفوظ في سجل التدقيق
      await tx.documentLink.deleteMany({ where: { documentId: id } });
      if (links.length) await tx.documentLink.createMany({ data: links.map((l) => ({ documentId: id, ...l })) });
      await this.audit.log(
        {
          action: "DOCUMENT_UPDATE",
          entityType: "Document",
          entityId: id,
          before: { ...this.summary(before), notes: before.notes, links: before.links.map((l) => ({ entityType: l.entityType, entityId: l.entityId })) },
          after: { nameAr: d.title, ...this.meta(i), links },
        },
        req,
        tx,
      );
    });
    return this.get(schoolId, id, req);
  }

  async addVersion(schoolId: string, id: string, i: DocumentVersionInput, user: AuthUser, req: AppRequest) {
    const d = await this.row(schoolId, id, req);
    if (d.archivedAt) throw E.rule("DOCUMENT_ARCHIVED");
    const file = this.decode(i.dataBase64);
    try {
      await this.prisma.$transaction(async (tx) => {
        const last = await tx.documentVersion.aggregate({ where: { documentId: id }, _max: { version: true } });
        const version = (last._max.version ?? 0) + 1;
        const f = await this.storage.save(tx, { schoolId, buf: file.buf, mime: file.mime, originalName: i.fileName, uploadedById: user.id });
        await tx.documentVersion.create({ data: { documentId: id, version, fileId: f.id, changeNote: i.changeNote.trim(), uploadedById: user.id } });
        await tx.document.update({ where: { id }, data: { updatedAt: new Date() } });
        await this.audit.log({ action: "DOCUMENT_VERSION_ADD", entityType: "Document", entityId: id, after: { nameAr: d.title, version, file: f.originalName, sha256: f.sha256, changeNote: i.changeNote } }, req, tx);
      });
    } catch (e) {
      // رفعان متزامنان لنفس الوثيقة: القيد الفريد (documentId, version) يحسم
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw E.conflict("DOCUMENT_VERSION_CONFLICT");
      throw e;
    }
    return this.get(schoolId, id, req);
  }

  async download(schoolId: string, id: string, versionId: string, req: AppRequest) {
    const d = await this.row(schoolId, id, req);
    const v = d.versions.find((x) => x.id === versionId);
    if (!v) throw E.notFound();
    let buf: Buffer;
    try {
      buf = await this.storage.read(v.file.storageKey);
    } catch {
      throw E.rule("FILE_MISSING");
    }
    if (this.storage.sha(buf) !== v.file.sha256) throw E.rule("FILE_INTEGRITY");
    const ext = v.file.mimeType === "application/pdf" ? "pdf" : v.file.mimeType === "image/png" ? "png" : "jpg";
    return { buf, mime: v.file.mimeType, filename: `document-v${v.version}.${ext}`, originalName: v.file.originalName };
  }

  async setArchived(schoolId: string, id: string, archived: boolean, reason: string | undefined, req: AppRequest) {
    const d = await this.row(schoolId, id, req);
    if (!!d.archivedAt === archived) return this.get(schoolId, id, req); // لا تغيير
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await this.audit.log({ action: archived ? "DOCUMENT_ARCHIVE" : "DOCUMENT_RESTORE", entityType: "Document", entityId: id, after: { nameAr: d.title, reason } }, req, tx);
    });
    return this.get(schoolId, id, req);
  }
}
