import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { syncBatchSchema } from "@hassan/validation";
import { CurrentUser, Req, SchoolScoped, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { SyncService } from "./sync.service";

const SID = () => Param("schoolId", ParseUUIDPipe);

/** الصلاحية تُفحص لكل عملية داخل الدفعة حسب نوعها. */
@ApiTags("sync")
@Controller("schools/:schoolId/sync")
export class SyncController {
  constructor(private s: SyncService) {}

  @SchoolScoped()
  @Post()
  @HttpCode(200)
  push(@SID() sid: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.push(sid, parse(syncBatchSchema, body), u, req);
  }

  @SchoolScoped()
  @Get()
  history(@SID() sid: string, @CurrentUser() u: AuthUser) {
    return this.s.history(sid, u);
  }
}
