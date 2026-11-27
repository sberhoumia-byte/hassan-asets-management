import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { SetupAdminInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { AccessService } from "../rbac/access.service";
import { config } from "../config";
import { E } from "../common/errors";
import type { AppRequest } from "../common/context";
import { hashRefreshToken, LOCK_MINUTES, MAX_FAILED_LOGINS, newRefreshToken } from "./tokens";

/** نافذة تسامح: طلبا تجديد متزامنان من تبويبين لا يُعدّان إعادة استعمال مسروقة. */
const ROTATION_GRACE_MS = 15_000;

export interface Issued {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private dummyHash: Promise<string>;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
    private access: AccessService,
  ) {
    // يُستعمل لتوحيد زمن الاستجابة حين يكون اسم المستخدم غير موجود
    this.dummyHash = argon2.hash(newRefreshToken());
  }

  hashPassword(pw: string) {
    return argon2.hash(pw, { type: argon2.argon2id });
  }

  async needsSetup() {
    return (await this.prisma.user.count()) === 0;
  }

  /** الإعداد الأول: ينشئ حساب مدير النظام مرة واحدة فقط. */
  async setup(input: SetupAdminInput, setupToken: string | undefined, req: AppRequest) {
    const expected = config().SETUP_TOKEN;
    // فراغات زائدة (لوحات مفاتيح الهاتف، النسخ واللصق) أو \r من ملف .env كُتب على Windows لا تُفشل المطابقة
    if (expected && setupToken?.trim() !== expected.trim()) throw E.forbidden("setup.token");
    const passwordHash = await this.hashPassword(input.password);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724001)`;
      if ((await tx.user.count()) > 0) throw E.conflict("ALREADY_SET_UP");
      const school = await tx.school.findFirst({ orderBy: { createdAt: "asc" } });
      if (!school) throw E.rule("NO_SCHOOL");
      const admin = await tx.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
      const user = await tx.user.create({
        data: {
          username: input.username.trim(),
          fullNameAr: input.fullNameAr.trim(),
          passwordHash,
          mustChangePassword: false, // اختارها المدير بنفسه
        },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: admin.id, schoolId: school.id } });
      await this.audit.log(
        { action: "SETUP", entityType: "User", entityId: user.id, userId: user.id, schoolId: school.id, after: { username: user.username } },
        req,
        tx,
      );
    });
  }

  async login(username: string, password: string, req: AppRequest): Promise<Issued & { userId: string }> {
    const user = await this.prisma.user.findFirst({ where: { username: { equals: username.trim(), mode: "insensitive" } } });
    if (!user) {
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      throw E.invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw E.locked(Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
    }
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok || user.status !== "ACTIVE") {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: lock
          ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) }
          : { failedLoginCount: failed },
      });
      await this.audit.log({ action: lock ? "ACCOUNT_LOCKED" : "LOGIN_FAILED", entityType: "User", entityId: user.id, userId: user.id }, req);
      if (lock) throw E.locked(LOCK_MINUTES);
      throw E.invalidCredentials();
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const issued = await this.issue(user.id, req);
    const firstSchool = await this.prisma.userRole.findFirst({ where: { userId: user.id }, orderBy: { grantedAt: "asc" } });
    await this.audit.log({ action: "LOGIN", entityType: "User", entityId: user.id, userId: user.id, schoolId: firstSchool?.schoolId }, req);
    return { ...issued, userId: user.id };
  }

  private async issue(userId: string, req: AppRequest): Promise<Issued> {
    const refreshToken = newRefreshToken();
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
        ipAddress: req.ip ?? null,
        expiresAt: new Date(Date.now() + config().JWT_REFRESH_TTL_DAYS * 86400_000),
      },
    });
    return { accessToken: await this.sign(userId, session.id), refreshToken };
  }

  private sign(userId: string, sessionId: string) {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId },
      { secret: config().JWT_ACCESS_SECRET, expiresIn: config().JWT_ACCESS_TTL as never },
    );
  }

  /**
   * تدوير رمز التجديد: كل استعمال يلغي الجلسة القديمة وينشئ جديدة.
   * استعمال رمز ملغى (خارج نافذة التسامح) = سرقة محتملة ← إلغاء كل جلسات المستخدم.
   */
  async refresh(token: string | undefined, req: AppRequest): Promise<Issued & { userId: string }> {
    if (!token) throw E.unauthenticated();
    const session = await this.prisma.authSession.findUnique({ where: { refreshTokenHash: hashRefreshToken(token) }, include: { user: true } });
    if (!session) throw E.unauthenticated();
    if (session.revokedAt) {
      if (Date.now() - session.revokedAt.getTime() > ROTATION_GRACE_MS) {
        await this.prisma.authSession.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
        await this.audit.log({ action: "REFRESH_REUSE", entityType: "AuthSession", entityId: session.id, userId: session.userId }, req);
      }
      throw E.unauthenticated();
    }
    if (session.expiresAt < new Date() || session.user.status !== "ACTIVE") throw E.unauthenticated();
    const { count } = await this.prisma.authSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw E.unauthenticated(); // طلب متزامن سبقه
    return { ...(await this.issue(session.userId, req)), userId: session.userId };
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash: hashRefreshToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** الهوية + الأدوار + الصلاحيات الفعلية في كل مؤسسة يصلها المستخدم بدور. */
  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true }, orderBy: { grantedAt: "asc" } } },
    });
    const schoolIds = [...new Set(user.roles.map((r) => r.schoolId))];
    const permissions: Record<string, string[]> = {};
    for (const sid of schoolIds) permissions[sid] = [...(await this.access.permissions(userId, sid))].sort();
    return {
      id: user.id,
      username: user.username,
      fullNameAr: user.fullNameAr,
      fullNameFr: user.fullNameFr ?? undefined,
      locale: user.locale,
      mustChangePassword: user.mustChangePassword,
      isSystemAdmin: user.roles.some((r) => r.role.code === "ADMIN"),
      roles: user.roles.map((r) => ({ role: r.role.code, schoolId: r.schoolId })),
      permissions,
    };
  }

  async changePassword(userId: string, sessionId: string, current: string, next: string, req: AppRequest) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current).catch(() => false))) throw E.rule("WRONG_PASSWORD");
    if (await argon2.verify(user.passwordHash, next).catch(() => false)) throw E.rule("SAME_PASSWORD");
    const passwordHash = await this.hashPassword(next);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
      // إلغاء الجلسات الأخرى (أجهزة أخرى) والإبقاء على الحالية
      await tx.authSession.updateMany({ where: { userId, revokedAt: null, NOT: { id: sessionId } }, data: { revokedAt: new Date() } });
      await this.audit.log({ action: "PASSWORD_CHANGE", entityType: "User", entityId: userId }, req, tx);
    });
  }

  listSessions(userId: string, currentSessionId: string) {
    return this.prisma.authSession
      .findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, userAgent: true, ipAddress: true, expiresAt: true },
      })
      .then((rows) => rows.map((r) => ({ ...r, current: r.id === currentSessionId })));
  }

  async revokeSession(userId: string, id: string, req: AppRequest) {
    const { count } = await this.prisma.authSession.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!count) throw E.notFound();
    await this.audit.log({ action: "SESSION_REVOKE", entityType: "AuthSession", entityId: id }, req);
  }
}
