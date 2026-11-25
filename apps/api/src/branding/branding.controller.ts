import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser, Perm, Req, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { brandingBodySchema, BrandingService } from "./branding.service";

@ApiTags("branding")
@Controller("schools/:schoolId/branding")
export class BrandingController {
  constructor(private b: BrandingService) {}

  @Perm("branding.view")
  @Get()
  get(@Param("schoolId", ParseUUIDPipe) schoolId: string) {
    return this.b.get(schoolId);
  }

  @Perm("branding.update")
  @Put()
  save(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.b.save(schoolId, parse(brandingBodySchema, body), u, req);
  }

  @Perm("branding.update")
  @Post("reset")
  @HttpCode(200)
  reset(@Param("schoolId", ParseUUIDPipe) schoolId: string, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.b.reset(schoolId, u, req);
  }

  @Perm("branding.view")
  @Get("history")
  history(@Param("schoolId", ParseUUIDPipe) schoolId: string) {
    return this.b.history(schoolId);
  }
}
