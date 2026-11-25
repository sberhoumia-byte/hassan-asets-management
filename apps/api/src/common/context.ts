import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";

export interface AuthUser {
  id: string;
  sessionId: string;
  username: string;
  fullNameAr: string;
  isSystemAdmin: boolean; // يحمل دور ADMIN في مؤسسة واحدة على الأقل
  mustChangePassword: boolean;
}

export interface Ctx {
  user?: AuthUser;
  schoolId?: string;
  permissions?: Set<string>;
  requestId?: string;
}

export type AppRequest = Request & Ctx;

export const IS_PUBLIC = "isPublic";
export const PERMISSION = "permission";
export const ADMIN_ONLY = "adminOnly";

/** مسار لا يتطلب تسجيل الدخول. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** يتطلب صلاحية داخل المؤسسة النشطة (ترويسة X-School-Id). */
export const Perm = (code: string) => SetMetadata(PERMISSION, code);
/** يتطلب مدير النظام (الأكاديميات والمديريات وإنشاء المؤسسات). */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
export const ALLOW_PENDING_PASSWORD = "allowPendingPassword";
/** مسموح به حتى قبل تغيير كلمة المرور المؤقتة (me، تغيير كلمة المرور، الخروج). */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>().user!);
export const SchoolId = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>().schoolId!);
export const Req = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>());
