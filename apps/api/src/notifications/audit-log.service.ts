import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { E } from "../common/errors";
import { UUID_RE } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** عرض سجل التدقيق (إلحاق فقط في القاعدة؛ لا مسار للتعديل أو الحذف). القيم الحساسة محجوبة أصلاً عند الكتابة. */
@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async list(schoolId: string, f: { userId?: string; action?: string; entityType?: string; entityId?: string; from?: string; to?: string; page: number; pageSize: number }) {
    if (f.from && !DATE_RE.test(f.from)) throw E.validation({ fields: { from: "errors.date" } });
    if (f.to && !DATE_RE.test(f.to)) throw E.validation({ fields: { to: "errors.date" } });
    if (f.from && f.to && f.from > f.to) throw E.validation({ fields: { to: "errors.endBeforeStart" } });
    const where: Prisma.AuditLogWhereInput = {
      schoolId,
      ...(f.userId && UUID_RE.test(f.userId) ? { userId: f.userId } : {}),
      ...(f.action ? { action: f.action.slice(0, 60) } : {}),
      ...(f.entityType ? { entityType: f.entityType.slice(0, 60) } : {}),
      ...(f.entityId ? { entityId: f.entityId.slice(0, 60) } : {}),
      ...(f.from || f.to
        ? { createdAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000) } : {}) } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { id: "desc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize, include: { user: { select: { fullNameAr: true, username: true } } } }),
    ]);
    return {
      total,
      page: f.page,
      pageSize: f.pageSize,
      items: rows.map((r) => ({
        id: r.id.toString(),
        at: r.createdAt.toISOString(),
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId ?? undefined,
        user: r.user ? `${r.user.fullNameAr} (${r.user.username})` : undefined,
        userId: r.userId ?? undefined,
        ip: r.ipAddress ?? undefined,
        requestId: r.requestId ?? undefined,
        before: r.before ?? undefined,
        after: r.after ?? undefined,
      })),
    };
  }

  /** القيم المتاحة للتصفية (الأفعال، أنواع الكيانات، المستخدمون) من سجل هذه المؤسسة فعلاً. */
  async facets(schoolId: string) {
    const [actions, types, users] = await Promise.all([
      this.prisma.auditLog.groupBy({ by: ["action"], where: { schoolId }, orderBy: { action: "asc" } }),
      this.prisma.auditLog.groupBy({ by: ["entityType"], where: { schoolId }, orderBy: { entityType: "asc" } }),
      this.prisma.auditLog.groupBy({ by: ["userId"], where: { schoolId, userId: { not: null } } }),
    ]);
    const names = await this.prisma.user.findMany({ where: { id: { in: users.map((u) => u.userId!) } }, select: { id: true, fullNameAr: true, username: true }, orderBy: { fullNameAr: "asc" } });
    return { actions: actions.map((a) => a.action), entityTypes: types.map((t) => t.entityType), users: names.map((u) => ({ id: u.id, name: `${u.fullNameAr} (${u.username})` })) };
  }
}
