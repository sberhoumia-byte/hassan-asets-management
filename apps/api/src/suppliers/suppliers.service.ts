import { Injectable } from "@nestjs/common";
import { matchesQuery } from "@hassan/shared";
import type { SupplierInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { CatalogService } from "../catalog/catalog.service";
import { E } from "../common/errors";
import { compact, nullify } from "../common/util";
import type { AppRequest } from "../common/context";

@Injectable()
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private catalog: CatalogService,
  ) {}

  async list(schoolId: string, f: { q?: string; archived?: boolean }) {
    const rows = await this.prisma.supplier.findMany({
      where: { schoolId, archivedAt: f.archived ? { not: null } : null },
      include: { _count: { select: { assets: true, movements: true, stockItems: true } } },
    });
    return rows
      .filter((s) => matchesQuery(f.q ?? "", s.name, s.ice ?? undefined, s.phone ?? undefined))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"))
      .map((s) =>
        compact({
          id: s.id,
          name: s.name,
          activityId: s.activityId,
          phone: s.phone,
          email: s.email,
          address: s.address,
          ice: s.ice,
          notes: s.notes,
          archivedAt: s.archivedAt?.toISOString(),
          usage: { assets: s._count.assets, movements: s._count.movements, stockItems: s._count.stockItems },
        }),
      );
  }

  private async data(schoolId: string, input: SupplierInput) {
    await this.catalog.assertLookup(schoolId, "SUPPLIER_ACTIVITY", input.activityId || null, "activityId");
    const t = nullify({ phone: input.phone, email: input.email, address: input.address, ice: input.ice, notes: input.notes, activityId: input.activityId ?? "" });
    return { name: input.name.trim(), ...t };
  }

  /** نفس المعرف الموحد ICE لا يتكرر داخل المؤسسة (الاسم قد يتكرر لفروع مختلفة). */
  private async checkIce(schoolId: string, ice: string | null | undefined, exceptId?: string) {
    if (!ice) return;
    if (await this.prisma.supplier.count({ where: { schoolId, ice, ...(exceptId ? { NOT: { id: exceptId } } : {}) } })) throw E.conflict("DUPLICATE_ICE");
  }

  async create(schoolId: string, input: SupplierInput, req: AppRequest) {
    const data = await this.data(schoolId, input);
    await this.checkIce(schoolId, data.ice);
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.supplier.create({ data: { schoolId, ...data } });
      await this.audit.log({ action: "SUPPLIER_CREATE", entityType: "Supplier", entityId: s.id, after: { ...s, nameAr: s.name } }, req, tx);
      return { id: s.id };
    });
  }

  async update(schoolId: string, id: string, input: SupplierInput, req: AppRequest) {
    const before = await this.prisma.supplier.findFirst({ where: { id, schoolId } });
    if (!before) throw E.notFound();
    const data = await this.data(schoolId, input);
    await this.checkIce(schoolId, data.ice, id);
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.supplier.update({ where: { id }, data });
      await this.audit.log({ action: "SUPPLIER_UPDATE", entityType: "Supplier", entityId: id, before, after: { ...s, nameAr: s.name } }, req, tx);
      return { id };
    });
  }

  /** الأرشفة بدل الحذف: يبقى المورد مرتبطاً بالممتلكات والحركات السابقة. */
  async setArchived(schoolId: string, id: string, archived: boolean, req: AppRequest) {
    const before = await this.prisma.supplier.findFirst({ where: { id, schoolId } });
    if (!before) throw E.notFound();
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.supplier.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await this.audit.log({ action: archived ? "SUPPLIER_ARCHIVE" : "SUPPLIER_RESTORE", entityType: "Supplier", entityId: id, after: { nameAr: s.name } }, req, tx);
      return { id };
    });
  }
}
