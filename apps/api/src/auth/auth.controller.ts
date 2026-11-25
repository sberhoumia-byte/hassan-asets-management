import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { changePasswordSchema, loginSchema, setupAdminSchema } from "@hassan/validation";
import { AllowPendingPassword, CurrentUser, Public, Req, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { config } from "../config";
import { AuthService } from "./auth.service";
import { REFRESH_COOKIE, refreshCookieOptions } from "./tokens";

const loginLimit = () => ({ default: { limit: config().LOGIN_RATE_LIMIT, ttl: 60_000 } });

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Get("setup-status")
  async setupStatus() {
    return { needsSetup: await this.auth.needsSetup(), setupTokenRequired: !!config().SETUP_TOKEN };
  }

  @Public()
  @Throttle(loginLimit())
  @Post("setup")
  @HttpCode(201)
  async setup(@Body() body: Record<string, unknown>, @Req() req: AppRequest) {
    const input = parse(setupAdminSchema, body);
    await this.auth.setup(input, typeof body?.setupToken === "string" ? body.setupToken : undefined, req);
    return { ok: true };
  }

  @Public()
  @Throttle(loginLimit())
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { username, password } = parse(loginSchema, body);
    const r = await this.auth.login(username, password, req);
    res.cookie(REFRESH_COOKIE, r.refreshToken, refreshCookieOptions());
    return { accessToken: r.accessToken, user: await this.auth.me(r.userId) };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const r = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], req);
      res.cookie(REFRESH_COOKIE, r.refreshToken, refreshCookieOptions());
      return { accessToken: r.accessToken, user: await this.auth.me(r.userId) };
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
      throw e;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  }

  @AllowPendingPassword()
  @Get("me")
  me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u.id);
  }

  @AllowPendingPassword()
  @Throttle(loginLimit())
  @Post("change-password")
  @HttpCode(204)
  async changePassword(@Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    const { currentPassword, newPassword } = parse(changePasswordSchema, body);
    await this.auth.changePassword(u.id, u.sessionId, currentPassword, newPassword, req);
  }

  @Get("sessions")
  sessions(@CurrentUser() u: AuthUser) {
    return this.auth.listSessions(u.id, u.sessionId);
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  async revoke(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    await this.auth.revokeSession(u.id, id, req);
  }
}
