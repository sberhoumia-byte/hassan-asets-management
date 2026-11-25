import { Injectable } from "@nestjs/common";
import { randomInt } from "node:crypto";
import { allPermissionCodes, ROLE_CODES } from "@hassan/shared";
import type { UserCreateInput, UserOverridesInput, UserUpdateInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { AccessService } from "../rbac/access.service";
import { AuthService } from "../auth/auth.service";
import { E } from "../common/errors";
import { compact, nullify } from "../common/util";
import type { AppRequest, AuthUser } from "../common/context";

/** كلمة مرور مؤقتة عشوائية (تُعرض مرة واحدة ويُجبر صاحبها على تغييرها). بلا أحرف ملتبسة. */
export function temporaryPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (s: string, n: number) => Array.from({ length: n }, () => s[randomInt(s.length)]).join("");
  return `${pick(letters, 4)}-${pick(letters, 4)}-${pick(digits, 4)}`;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private access: AccessService,
    private auth: AuthService,
  ) {}

  async roles() {
    const rows = await this.prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const order = (c: string) => ROLE_CODES.indexOf(c as never);
    return rows
      .sort((a, b) => order(a.code) - order(b.code))
      .map((r) => compact({ code: r.code, nameAr: r.nameAr, nameFr: r.nameFr, permissions: r.permissions.map((p) => p.permission.code).sort() }));
  }

  async permissions() {
    const rows = await this.prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] });
    return rows.map((p) => ({ code: p.code, module: p.module, action: p.action }));
  }

  private dto(
    u: {
      id: string;
      username: string;
      fullNameAr: string;
      fullNameFr: string | null;
      email: string | null;
      phone: string | null;
      status: string;
      mustChangePassword: boolean;
      lastLoginAt: Date | null;
      lockedUntil: Date | null;
      roles: { schoolId: string; role: { code: string } }[];
      permissionOverrides: { schoolId: string; granted: boolean; permission: { code: string } }[];
    },
    schoolId: string,
  ) {
    return compact({
      id: u.id,
      username: u.username,
      fullNameAr: u.fullNameAr,
      fullNameFr: u.fullNameFr,
      email: u.email,
      phone: u.phone,
      status: u.status,
      mustChangePassword: u.mustChangePassword,
      lastLoginAt: u.lastLoginAt?.toISOString(),
      locked: !!u.lockedUntil && u.lockedUntil > new Date(),
      roles: u.roles.filter((r) => r.schoolId === schoolId).map((r) => r.role.code),
      overrides: u.permissionOverrides
        .filter((o) => o.schoolId === schoolId)
        .map((o) => ({ permission: o.permission.code, granted: o.granted })),
    });
  }

  private include = { roles: { include: { role: true } }, permissionOverrides: { include: { permission: true } } } as const;

  /** مستخدمو المؤسسة النشطة (من لهم دور فيها). مدير النظام يرى أيضاً الحسابات بلا أي دور. */
  async list(schoolId: string, actor: AuthUser) {
    const rows = await this.prisma.user.findMany({
      where: actor.isSystemAdmin ? { OR: [{ roles: { some: { schoolId } } }, { roles: { none: {} } }] } : { roles: { some: { schoolId } } },
      include: this.include,
      orderBy: { fullNameAr: "asc" },
    });
    return rows.map((u) => this.dto(u, schoolId));
  }

  /** لا يُعدّل مستخدم من خارج المؤسسة، ولا يُعدّل غيرُ مدير النظام حسابَ مدير نظام. */
  private async target(id: string, schoolId: string, actor: AuthUser) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: this.include });
    if (!u) throw E.notFound();
    const inSchool = u.roles.some((r) => r.schoolId === schoolId);
    if (!actor.isSystemAdmin) {
      if (!inSchool) throw E.notFound();
      if (u.roles.some((r) => r.role.code === "ADMIN")) throw E.forbidden("system.admin");
    }
    return u;
  }

  private async roleIds(codes: string[], actor: AuthUser) {
    const unique = [...new Set(codes)];
    if (unique.includes("ADMIN") && !actor.isSystemAdmin) throw E.forbidden("system.admin");
    const roles = await this.prisma.role.findMany({ where: { code: { in: unique } } });
    if (roles.length !== unique.length) throw E.validation({ fields: { roles: "errors.unknownRole" } });
    return roles;
  }

  async create(schoolId: string, input: UserCreateInput, actor: AuthUser, req: AppRequest) {
    const roles = await this.roleIds(input.roles, actor);
    const exists = await this.prisma.user.findFirst({ where: { username: { equals: input.username.trim(), mode: "insensitive" } } });
    if (exists) throw E.conflict("DUPLICATE_USERNAME");
    const temp = temporaryPassword();
    const passwordHash = await this.auth.hashPassword(temp);
    const { roles: _r, username, ...profile } = input;
    const data = nullify(profile);
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { ...data, fullNameAr: data.fullNameAr!, username: username.trim(), passwordHash, mustChangePassword: true },
      });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId: u.id, roleId: r.id, schoolId, grantedById: actor.id })) });
      await this.audit.log(
        { action: "USER_CREATE", entityType: "User", entityId: u.id, after: { username: u.username, nameAr: u.fullNameAr, roles: input.roles } },
        req,
        tx,
      );
      return tx.user.findUniqueOrThrow({ where: { id: u.id }, include: this.include });
    });
    return { user: this.dto(user, schoolId), temporaryPassword: temp };
  }

  async update(schoolId: string, id: string, input: UserUpdateInput, actor: AuthUser, req: AppRequest) {
    const before = await this.target(id, schoolId, actor);
    if (id === actor.id && input.status !== "ACTIVE") throw E.rule("CANNOT_DISABLE_SELF");
    const data = nullify(input);
    const u = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { ...data, fullNameAr: data.fullNameAr!, status: input.status } });
      if (input.status !== "ACTIVE") await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(
        {
          action: "USER_UPDATE",
          entityType: "User",
          entityId: id,
          before: { nameAr: before.fullNameAr, status: before.status, email: before.email, phone: before.phone },
          after: { nameAr: input.fullNameAr, status: input.status, email: input.email, phone: input.phone },
        },
        req,
        tx,
      );
      return tx.user.findUniqueOrThrow({ where: { id }, include: this.include });
    });
    return this.dto(u, schoolId);
  }

  async setRoles(schoolId: string, id: string, codes: string[], actor: AuthUser, req: AppRequest) {
    const before = await this.target(id, schoolId, actor);
    const roles = await this.roleIds(codes, actor);
    const beforeCodes = before.roles.filter((r) => r.schoolId === schoolId).map((r) => r.role.code);
    const removingAdmin = beforeCodes.includes("ADMIN") && !codes.includes("ADMIN");
    if (removingAdmin && !actor.isSystemAdmin) throw E.forbidden("system.admin");
    const u = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id, schoolId } });
      if (roles.length)
        await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id, schoolId, grantedById: actor.id })) });
      if (removingAdmin) {
        // يجب أن يبقى مدير نظام نشط واحد على الأقل
        const left = await tx.userRole.count({ where: { role: { code: "ADMIN" }, user: { status: "ACTIVE" } } });
        if (left === 0) throw E.rule("LAST_ADMIN");
      }
      await this.audit.log(
        { action: "USER_ROLES", entityType: "User", entityId: id, before: { roles: beforeCodes }, after: { username: before.username, nameAr: before.fullNameAr, roles: codes } },
        req,
        tx,
      );
      return tx.user.findUniqueOrThrow({ where: { id }, include: this.include });
    });
    return this.dto(u, schoolId);
  }

  /** منح أو سحب صلاحيات فردية. لا يمنح المستخدم صلاحية لا يملكها هو نفسه (منع التصعيد). */
  async setOverrides(schoolId: string, id: string, input: UserOverridesInput, actor: AuthUser, req: AppRequest) {
    const before = await this.target(id, schoolId, actor);
    const known = new Set(allPermissionCodes());
    const mine = await this.access.permissions(actor.id, schoolId);
    for (const o of input.overrides) {
      if (!known.has(o.permission)) throw E.validation({ fields: { overrides: "errors.unknownPermission" } });
      if (o.granted && !mine.has(o.permission)) throw E.forbidden(o.permission);
    }
    const perms = await this.prisma.permission.findMany({ where: { code: { in: input.overrides.map((o) => o.permission) } } });
    const idOf = new Map(perms.map((p) => [p.code, p.id]));
    const dedup = new Map(input.overrides.map((o) => [o.permission, o.granted]));
    const u = await this.prisma.$transaction(async (tx) => {
      await tx.userPermissionOverride.deleteMany({ where: { userId: id, schoolId } });
      if (dedup.size)
        await tx.userPermissionOverride.createMany({
          data: [...dedup].map(([code, granted]) => ({ userId: id, schoolId, permissionId: idOf.get(code)!, granted })),
        });
      await this.audit.log(
        {
          action: "USER_OVERRIDES",
          entityType: "User",
          entityId: id,
          before: { overrides: before.permissionOverrides.filter((o) => o.schoolId === schoolId).map((o) => ({ permission: o.permission.code, granted: o.granted })) },
          after: { username: before.username, nameAr: before.fullNameAr, overrides: [...dedup].map(([permission, granted]) => ({ permission, granted })) },
        },
        req,
        tx,
      );
      return tx.user.findUniqueOrThrow({ where: { id }, include: this.include });
    });
    return this.dto(u, schoolId);
  }

  async resetPassword(schoolId: string, id: string, actor: AuthUser, req: AppRequest) {
    const u = await this.target(id, schoolId, actor);
    if (id === actor.id) throw E.rule("USE_CHANGE_PASSWORD");
    const temp = temporaryPassword();
    const passwordHash = await this.auth.hashPassword(temp);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null } });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ action: "USER_RESET_PASSWORD", entityType: "User", entityId: id, after: { username: u.username, nameAr: u.fullNameAr } }, req, tx);
    });
    return { temporaryPassword: temp };
  }
}
