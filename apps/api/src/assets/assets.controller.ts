import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { archiveSchema, assetSchema } from "@hassan/validation";
import { CurrentUser, Perm, Req, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { E } from "../common/errors";
import { AccessService } from "../rbac/access.service";
import { AssetsService } from "./assets.service";
import { ResourcesService } from "../resources/resources.service";

const page = (v?: string, d = 1) => Math.max(1, Math.min(Number(v) || d, 10_000));

@ApiTags("assets")
@Controller()
export class AssetsController {
  constructor(
    private assets: AssetsService,
    private access: AccessService,
    private resources: ResourcesService,
  ) {}

  @Perm("assets.view")
  @Get("schools/:schoolId/assets")
  list(
    @Param("schoolId", ParseUUIDPipe) schoolId: string,
    @Query("q") q?: string,
    @Query("categoryId") categoryId?: string,
    @Query("status") status?: string,
    @Query("archived") archived?: string,
    @Query("page") p?: string,
    @Query("roomId") roomId?: string,
    @Query("responsibleStaffId") responsibleStaffId?: string,
    @Query("pageSize") ps?: string,
  ) {
    return this.assets.list(schoolId, { q: q?.slice(0, 100), categoryId, status, archived: archived === "1", roomId, responsibleStaffId, page: page(p), pageSize: Math.min(page(ps, 25), 200) });
  }

  @Perm("assets.create")
  @Post("schools/:schoolId/assets")
  create(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.assets.create(schoolId, parse(assetSchema, body), u, req);
  }

  @Perm("assets.view")
  @Get("schools/:schoolId/assets/:id")
  get(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.assets.get(schoolId, id);
  }

  @Perm("assets.update")
  @Put("schools/:schoolId/assets/:id")
  update(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.assets.update(schoolId, id, parse(assetSchema, body), u, req);
  }

  @Perm("assets.archive")
  @Post("schools/:schoolId/assets/:id/archive")
  @HttpCode(200)
  archive(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.assets.archive(schoolId, id, parse(archiveSchema, body).reason, req);
  }

  @Perm("assets.view")
  @Get("schools/:schoolId/assets/:id/history")
  history(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.assets.history(schoolId, id);
  }

  /** رمز QR يحمل qrToken فقط. لا يكشف شيئاً لمن لا يصل إلى مؤسسة الكيان. */
  @Get("scan/:qrToken")
  async scan(@Param("qrToken") token: string, @CurrentUser() u: AuthUser) {
    // ممتلك أو وحدة وسيلة تعليمية
    const r = (await this.resources.scanUnit(token)) ?? (await this.assets.scan(token));
    if (!(await this.access.canAccessSchool(u.id, r.schoolId))) throw E.notFound();
    return r;
  }
}
