import { Injectable } from "@nestjs/common";
import { allPermissionCodes } from "@hassan/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * يحسب الصلاحيات الفعلية لمستخدم داخل مؤسسة:
 *   (اتحاد صلاحيات أدواره في هذه المؤسسة) + المنح الفردية − السحب الفردي.
 * مدير النظام (ADMIN في أي مؤسسة) يملك كل الصلاحيات في كل المؤسسات، ما لم تُسحب منه فردياً.
 */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  async isSystemAdmin(userId: string): Promise<boolean> {
    return (await this.prisma.userRole.count({ where: { userId, role: { code: "ADMIN" } } })) > 0;
  }

  async canAccessSchool(userId: string, schoolId: string): Promise<boolean> {
    if (await this.isSystemAdmin(userId)) return (await this.prisma.school.count({ where: { id: schoolId } })) > 0;
    return (await this.prisma.userRole.count({ where: { userId, schoolId } })) > 0;
  }

  async visibleSchoolIds(userId: string): Promise<string[] | "ALL"> {
    if (await this.isSystemAdmin(userId)) return "ALL";
    const rows = await this.prisma.userRole.findMany({ where: { userId }, select: { schoolId: true }, distinct: ["schoolId"] });
    return rows.map((r) => r.schoolId);
  }

  async permissions(userId: string, schoolId: string): Promise<Set<string>> {
    const perms = new Set<string>();
    if (await this.isSystemAdmin(userId)) {
      allPermissionCodes().forEach((p) => perms.add(p));
    } else {
      const roles = await this.prisma.userRole.findMany({
        where: { userId, schoolId },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      });
      for (const r of roles) for (const rp of r.role.permissions) perms.add(rp.permission.code);
    }
    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: { userId, schoolId },
      include: { permission: true },
    });
    for (const o of overrides) {
      if (o.granted) perms.add(o.permission.code);
      else perms.delete(o.permission.code);
    }
    return perms;
  }
}
