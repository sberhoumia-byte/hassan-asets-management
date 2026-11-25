import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { config } from "../config";
import { ADMIN_ONLY, ALLOW_PENDING_PASSWORD, IS_PUBLIC, PERMISSION, SCHOOL_SCOPED, type AppRequest } from "../common/context";
import { AppError, E } from "../common/errors";
import { AccessService } from "./access.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * حارس واحد عام يطبق بالترتيب:
 *  1) المصادقة (JWT + جلسة غير ملغاة + حساب نشط)
 *  2) مدير النظام للمسارات @AdminOnly
 *  3) المؤسسة النشطة (X-School-Id) والصلاحية للمسارات @Perm
 */
@Injectable()
export class AppGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw E.unauthenticated();
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7), { secret: config().JWT_ACCESS_SECRET });
    } catch {
      throw E.unauthenticated();
    }
    const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.sub) throw E.unauthenticated();
    if (session.user.status !== "ACTIVE") throw E.unauthenticated();

    const isSystemAdmin = await this.access.isSystemAdmin(session.userId);
    req.user = {
      id: session.userId,
      sessionId: session.id,
      username: session.user.username,
      fullNameAr: session.user.fullNameAr,
      isSystemAdmin,
      mustChangePassword: session.user.mustChangePassword,
    };

    // كلمة مرور مؤقتة: لا يُسمح إلا بتغييرها (والخروج وجلب الهوية) قبل أي عمل آخر
    if (session.user.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets))
      throw new AppError("PASSWORD_CHANGE_REQUIRED", 403);

    if (this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets) && !isSystemAdmin) throw E.forbidden("system.admin");

    const perm = this.reflector.getAllAndOverride<string>(PERMISSION, targets);
    const scoped = this.reflector.getAllAndOverride<boolean>(SCHOOL_SCOPED, targets);
    if (perm || scoped) {
      // المؤسسة من مسار الطلب (/schools/:schoolId/...) وإلا من ترويسة X-School-Id
      const schoolId = String(req.params?.schoolId ?? req.headers["x-school-id"] ?? "");
      if (!UUID.test(schoolId)) throw E.validation({ fields: { "X-School-Id": "errors.required" } });
      if (!(await this.access.canAccessSchool(req.user.id, schoolId))) throw E.schoolDenied();
      const perms = await this.access.permissions(req.user.id, schoolId);
      if (perm && !perms.has(perm)) throw E.forbidden(perm);
      req.schoolId = schoolId;
      req.permissions = perms;
    }
    return true;
  }
}
