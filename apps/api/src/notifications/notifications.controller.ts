import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { CurrentUser, Perm, Req, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { AuditLogService } from "./audit-log.service";
import { NotificationsService } from "./notifications.service";

const prefsSchema = z.object({ items: z.array(z.object({ type: z.string().max(40), enabled: z.boolean() })).max(30) });

/** إشعارات المستخدم الحالي (كل المؤسسات التي يصل إليها) وتفضيلاته. */
@ApiTags("notifications")
@Controller()
export class NotificationsController {
  constructor(
    private s: NotificationsService,
    private audit: AuditLogService,
  ) {}

  @Get("notifications")
  list(@CurrentUser() u: AuthUser, @Query("unread") unread?: string, @Query("limit") limit?: string) {
    return this.s.list(u, { unread: unread === "1" || unread === "true", limit: Number(limit) || 50 });
  }

  @Post("notifications/:id/read")
  @HttpCode(200)
  read(@CurrentUser() u: AuthUser, @Param("id") id: string) {
    return this.s.markRead(u, id);
  }

  @Post("notifications/read-all")
  @HttpCode(200)
  readAll(@CurrentUser() u: AuthUser) {
    return this.s.markAllRead(u);
  }

  @Get("notifications/preferences")
  prefs(@CurrentUser() u: AuthUser) {
    return this.s.preferences(u);
  }

  @Put("notifications/preferences")
  setPrefs(@CurrentUser() u: AuthUser, @Body() body: unknown, @Req() req: AppRequest) {
    return this.s.setPreferences(u, parse(prefsSchema, body).items, req);
  }

  /** فحص التنبيهات الآن لهذه المؤسسة (إضافة إلى الفحص الدوري). */
  @Perm("settings.manage")
  @Post("schools/:schoolId/notifications/run")
  @HttpCode(200)
  run(@Param("schoolId", ParseUUIDPipe) sid: string) {
    return this.s.run(sid);
  }

  /** سجل التدقيق: قراءة فقط. */
  @Perm("audit.view")
  @Get("schools/:schoolId/audit-logs")
  auditLogs(
    @Param("schoolId", ParseUUIDPipe) sid: string,
    @Query("userId") userId?: string,
    @Query("action") action?: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.audit.list(sid, { userId, action, entityType, entityId, from, to, page: Math.max(1, Number(page) || 1), pageSize: Math.min(Math.max(Number(pageSize) || 50, 1), 200) });
  }

  @Perm("audit.view")
  @Get("schools/:schoolId/audit-logs/facets")
  facets(@Param("schoolId", ParseUUIDPipe) sid: string) {
    return this.audit.facets(sid);
  }
}
