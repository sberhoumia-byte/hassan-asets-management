import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { academySchema, directorateSchema, schoolSchema } from "@hassan/validation";
import { AdminOnly, CurrentUser, Perm, Req, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { HierarchyService } from "./hierarchy.service";

/** القراءة متاحة لكل مستخدم مسجل (مراجع مشتركة)، والإنشاء لمدير النظام فقط. */
@ApiTags("hierarchy")
@Controller()
export class HierarchyController {
  constructor(private h: HierarchyService) {}

  @Get("academies")
  academies() {
    return this.h.listAcademies();
  }

  @AdminOnly()
  @Post("academies")
  createAcademy(@Body() body: unknown, @Req() req: AppRequest) {
    return this.h.createAcademy(parse(academySchema, body), req);
  }

  @Get("directorates")
  directorates(@Query("academyId") academyId?: string) {
    return this.h.listDirectorates(academyId);
  }

  @AdminOnly()
  @Post("directorates")
  createDirectorate(@Body() body: unknown, @Req() req: AppRequest) {
    return this.h.createDirectorate(parse(directorateSchema, body), req);
  }

  @Get("schools")
  schools(@CurrentUser() u: AuthUser, @Query("directorateId") directorateId?: string, @Query("q") q?: string) {
    return this.h.listSchools(u.id, { directorateId, q: q?.slice(0, 100) });
  }

  @AdminOnly()
  @Post("schools")
  createSchool(@Body() body: unknown, @Req() req: AppRequest) {
    return this.h.createSchool(parse(schoolSchema, body), req);
  }

  @Perm("schools.view")
  @Get("schools/:schoolId")
  school(@Param("schoolId", ParseUUIDPipe) id: string) {
    return this.h.getSchool(id);
  }

  @Perm("schools.update")
  @Put("schools/:schoolId")
  updateSchool(@Param("schoolId", ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>, @Req() req: AppRequest) {
    const input = parse(schoolSchema, body);
    const schoolYear = typeof body?.schoolYear === "string" && body.schoolYear ? body.schoolYear : undefined;
    return this.h.updateSchool(id, { ...input, schoolYear }, req);
  }
}
