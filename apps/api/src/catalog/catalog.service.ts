import { Injectable } from "@nestjs/common";
import { LOOKUP_KEYS, isValidPattern } from "@hassan/shared";
import type { CategoryInput, LookupValueInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { E } from "../common/errors";
import { compact, nullify, UUID_RE } from "../common/util";
import type { AppRequest } from "../common/context";

/** التصنيفات والقوائم المرجعية وإعداد الترقيم: القيم العامة (schoolId = null) للقراءة فقط هنا. */
@Injectable()
export class CatalogService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private catDto(c: { id: string; schoolId: string | null; parentId: string | null; code: string; nameAr: string; nameFr: string | null; isActive: boolean }) {
    return compact({ id: c.id, parentId: c.parentId, code: c.code, nameAr: c.nameAr, nameFr: c.nameFr, isActive: c.isActive, global: c.schoolId === null });
  }

  async categories(schoolId: string) {
    const rows = await this.prisma.assetCategory.findMany({
      where: { OR: [{ schoolId }, { schoolId: null }] },
      orderBy: [{ code: "asc" }],
    });
    return rows.map((c) => this.catDto(c));
  }

  private async checkParent(schoolId: string, parentId: string | null | undefined, selfId?: string) {
    if (!parentId) return null;
    if (!UUID_RE.test(parentId)) throw E.rule("CATEGORY_NOT_FOUND");
    const p = await this.prisma.assetCategory.findFirst({ where: { id: parentId, OR: [{ schoolId }, { schoolId: null }] } });
    if (!p) throw E.rule("CATEGORY_NOT_FOUND");
    // منع الحلقات: الأب لا يكون التصنيف نفسه ولا أحد فروعه
    let cur: string | null = p.id;
    for (let i = 0; cur && i < 50; i++) {
      if (cur === selfId) throw E.rule("CATEGORY_CYCLE");
      cur = (await this.prisma.assetCategory.findUnique({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null;
    }
    return p.id;
  }

  async createCategory(schoolId: string, input: CategoryInput, req: AppRequest) {
    const parentId = await this.checkParent(schoolId, input.parentId);
    const d = nullify({ nameFr: input.nameFr });
    if (await this.prisma.assetCategory.findFirst({ where: { code: input.code, OR: [{ schoolId }, { schoolId: null }] } })) throw E.conflict("DUPLICATE_CODE");
    const c = await this.prisma.$transaction(async (tx) => {
      const c = await tx.assetCategory.create({ data: { schoolId, parentId, code: input.code, nameAr: input.nameAr.trim(), nameFr: d.nameFr, isActive: input.isActive ?? true } });
      await this.audit.log({ action: "CATEGORY_CREATE", entityType: "AssetCategory", entityId: c.id, after: { ...c, nameAr: c.nameAr } }, req, tx);
      return c;
    });
    return this.catDto(c);
  }

  async updateCategory(schoolId: string, id: string, input: CategoryInput, req: AppRequest) {
    const before = await this.prisma.assetCategory.findFirst({ where: { id, schoolId } });
    if (!before) throw E.notFound(); // التصنيفات العامة لا تُعدَّل من مؤسسة
    const parentId = await this.checkParent(schoolId, input.parentId, id);
    if (input.code !== before.code && (await this.prisma.assetCategory.findFirst({ where: { code: input.code, OR: [{ schoolId }, { schoolId: null }] } })))
      throw E.conflict("DUPLICATE_CODE");
    const c = await this.prisma.$transaction(async (tx) => {
      const c = await tx.assetCategory.update({
        where: { id },
        data: { parentId, code: input.code, nameAr: input.nameAr.trim(), nameFr: nullify({ x: input.nameFr }).x, isActive: input.isActive ?? before.isActive },
      });
      await this.audit.log({ action: "CATEGORY_UPDATE", entityType: "AssetCategory", entityId: id, before, after: c }, req, tx);
      return c;
    });
    return this.catDto(c);
  }

  async lookups(schoolId: string, listKey?: string, includeInactive = false) {
    const rows = await this.prisma.lookupValue.findMany({
      where: { OR: [{ schoolId: null }, { schoolId }], ...(listKey ? { listKey } : {}), ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ listKey: "asc" }, { sortOrder: "asc" }, { labelAr: "asc" }],
    });
    return rows.map((r) =>
      compact({ id: r.id, listKey: r.listKey, code: r.code, labelAr: r.labelAr, labelFr: r.labelFr, sortOrder: r.sortOrder, isActive: r.isActive, global: r.schoolId === null }),
    );
  }

  private checkKey(listKey: string) {
    if (!(LOOKUP_KEYS as readonly string[]).includes(listKey)) throw E.validation({ fields: { listKey: "errors.unknownList" } });
  }

  async createLookup(schoolId: string, listKey: string, input: LookupValueInput, req: AppRequest) {
    this.checkKey(listKey);
    if (await this.prisma.lookupValue.findFirst({ where: { listKey, code: input.code, OR: [{ schoolId }, { schoolId: null }] } })) throw E.conflict("DUPLICATE_CODE");
    const r = await this.prisma.$transaction(async (tx) => {
      const r = await tx.lookupValue.create({
        data: { schoolId, listKey, code: input.code, labelAr: input.labelAr.trim(), labelFr: nullify({ x: input.labelFr }).x, sortOrder: input.sortOrder ?? 0, isActive: input.isActive ?? true },
      });
      await this.audit.log({ action: "LOOKUP_CREATE", entityType: "LookupValue", entityId: r.id, after: r }, req, tx);
      return r;
    });
    return { id: r.id };
  }

  async updateLookup(schoolId: string, id: string, input: LookupValueInput, req: AppRequest) {
    const before = await this.prisma.lookupValue.findFirst({ where: { id, schoolId } });
    if (!before) throw E.notFound();
    if (input.code !== before.code && (await this.prisma.lookupValue.findFirst({ where: { listKey: before.listKey, code: input.code, OR: [{ schoolId }, { schoolId: null }] } })))
      throw E.conflict("DUPLICATE_CODE");
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.lookupValue.update({
        where: { id },
        data: { code: input.code, labelAr: input.labelAr.trim(), labelFr: nullify({ x: input.labelFr }).x, sortOrder: input.sortOrder ?? before.sortOrder, isActive: input.isActive ?? before.isActive },
      });
      await this.audit.log({ action: "LOOKUP_UPDATE", entityType: "LookupValue", entityId: id, before, after: r }, req, tx);
    });
    return { id };
  }

  /** يتحقق أن القيمة المرجعية موجودة ومن القائمة الصحيحة ومتاحة لهذه المؤسسة. */
  async assertLookup(schoolId: string, listKey: string, id: string | null | undefined, field: string) {
    if (!id) return null;
    const ok = UUID_RE.test(id) && (await this.prisma.lookupValue.count({ where: { id, listKey, OR: [{ schoolId }, { schoolId: null }] } }));
    if (!ok) throw E.validation({ fields: { [field]: "errors.invalidChoice" } });
    return id;
  }

  async assertCategory(schoolId: string, id: string | null | undefined, field = "categoryId") {
    if (!id) return null;
    const ok = UUID_RE.test(id) && (await this.prisma.assetCategory.count({ where: { id, OR: [{ schoolId }, { schoolId: null }] } }));
    if (!ok) throw E.validation({ fields: { [field]: "errors.invalidChoice" } });
    return id;
  }

  async assertSupplier(schoolId: string, id: string | null | undefined, field = "supplierId") {
    if (!id) return null;
    const ok = UUID_RE.test(id) && (await this.prisma.supplier.count({ where: { id, schoolId } }));
    if (!ok) throw E.validation({ fields: { [field]: "errors.invalidChoice" } });
    return id;
  }

  async numbering(schoolId: string) {
    const s = await this.prisma.schoolSettings.upsert({ where: { schoolId }, create: { schoolId }, update: {} });
    return { inventoryNumberPattern: s.inventoryNumberPattern };
  }

  async setNumbering(schoolId: string, pattern: string, req: AppRequest) {
    if (!isValidPattern(pattern)) throw E.validation({ fields: { inventoryNumberPattern: "errors.patternSeq" } });
    const before = await this.numbering(schoolId);
    await this.prisma.$transaction(async (tx) => {
      await tx.schoolSettings.update({ where: { schoolId }, data: { inventoryNumberPattern: pattern } });
      await this.audit.log({ action: "SETTINGS_UPDATE", entityType: "SchoolSettings", entityId: schoolId, before, after: { inventoryNumberPattern: pattern } }, req, tx);
    });
    return { inventoryNumberPattern: pattern };
  }
}
