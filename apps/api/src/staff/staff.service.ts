import { Injectable } from "@nestjs/common";
import { matchesQuery } from "@hassan/shared";
import type { StaffInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { E } from "../common/errors";
import { compact, nullify, UUID_RE } from "../common/util";
import type { AppRequest } from "../common/context";

/** من يملك إحدى هذه الصلاحيات يدير سجل الموظفين (المستعيرون والمسؤولون عن الممتلكات). */
export const STAFF_MANAGERS = ["loans.create", "custody.create", "assets.update", "users.manage", "settings.manage"];

/** الأطر والموظفون: المستعيرون والمسؤولون عن الممتلكات. ليسوا بالضرورة مستخدمين للنظام. لا حذف: تعطيل فقط. */
@Injectable()
export class StaffService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  canManage(req: AppRequest) {
    if (!STAFF_MANAGERS.some((p) => req.permissions?.has(p))) throw E.forbidden(STAFF_MANAGERS[0]!);
  }

  async list(schoolId: string, f: { q?: string; all?: boolean }) {
    const rows = await this.prisma.staffMember.findMany({
      where: { schoolId, ...(f.all ? {} : { isActive: true }) },
      include: { _count: { select: { loans: { where: { status: { in: ["ACTIVE", "PARTIALLY_RETURNED"] } } }, responsibleFor: { where: { archivedAt: null } } } } },
      orderBy: { fullNameAr: "asc" },
    });
    return rows
      .filter((s) => matchesQuery(f.q ?? "", s.fullNameAr, s.fullNameFr ?? undefined, s.staffNumber ?? undefined))
      .map((s) =>
        compact({
          id: s.id,
          fullNameAr: s.fullNameAr,
          fullNameFr: s.fullNameFr,
          type: s.type,
          staffNumber: s.staffNumber,
          phone: s.phone,
          email: s.email,
          isActive: s.isActive,
          activeLoans: s._count.loans,
          assets: s._count.responsibleFor,
        }),
      );
  }

  private data(i: StaffInput) {
    return { fullNameAr: i.fullNameAr.trim(), type: i.type, ...nullify({ fullNameFr: i.fullNameFr, staffNumber: i.staffNumber, phone: i.phone, email: i.email }) };
  }

  async create(schoolId: string, i: StaffInput, req: AppRequest) {
    this.canManage(req);
    const d = this.data(i);
    if (d.staffNumber && (await this.prisma.staffMember.count({ where: { schoolId, staffNumber: d.staffNumber } }))) throw E.conflict("DUPLICATE_STAFF_NUMBER");
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.staffMember.create({ data: { schoolId, ...d, isActive: i.isActive ?? true } });
      await this.audit.log({ action: "STAFF_CREATE", entityType: "StaffMember", entityId: s.id, after: { ...s, nameAr: s.fullNameAr } }, req, tx);
      return { id: s.id };
    });
  }

  async update(schoolId: string, id: string, i: StaffInput, req: AppRequest) {
    this.canManage(req);
    const before = await this.prisma.staffMember.findFirst({ where: { id, schoolId } });
    if (!before) throw E.notFound();
    const d = this.data(i);
    if (d.staffNumber && d.staffNumber !== before.staffNumber && (await this.prisma.staffMember.count({ where: { schoolId, staffNumber: d.staffNumber } })))
      throw E.conflict("DUPLICATE_STAFF_NUMBER");
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.staffMember.update({ where: { id }, data: { ...d, isActive: i.isActive ?? before.isActive } });
      await this.audit.log({ action: "STAFF_UPDATE", entityType: "StaffMember", entityId: id, before, after: { ...s, nameAr: s.fullNameAr } }, req, tx);
      return { id };
    });
  }

  async assertStaff(schoolId: string, id: string | null | undefined, field: string, requireActive = true) {
    if (!id) return null;
    const s = UUID_RE.test(id) ? await this.prisma.staffMember.findFirst({ where: { id, schoolId } }) : null;
    if (!s) throw E.validation({ fields: { [field]: "errors.invalidChoice" } });
    if (requireActive && !s.isActive) throw E.validation({ fields: { [field]: "errors.archivedChoice" } });
    return s;
  }
}
