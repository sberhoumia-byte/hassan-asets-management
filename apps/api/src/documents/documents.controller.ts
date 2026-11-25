import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { archiveSchema, documentCreateSchema, documentMetaSchema, documentVersionSchema } from "@hassan/validation";
import { CurrentUser, Perm, Req, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { DocumentsService } from "./documents.service";

const SID = () => Param("schoolId", ParseUUIDPipe);
const ID = () => Param("id", ParseUUIDPipe);

@ApiTags("documents")
@Controller("schools/:schoolId/documents")
export class DocumentsController {
  constructor(private s: DocumentsService) {}

  @Perm("documents.view")
  @Get()
  list(
    @SID() sid: string,
    @Req() req: AppRequest,
    @Query("q") q?: string,
    @Query("categoryId") categoryId?: string,
    @Query("archived") archived?: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
  ) {
    return this.s.list(sid, { q: q?.slice(0, 100), categoryId, archived: archived === "1" || archived === "true", entityType, entityId }, req);
  }

  @Perm("documents.view")
  @Get(":id")
  get(@SID() sid: string, @ID() id: string, @Req() req: AppRequest) {
    return this.s.get(sid, id, req);
  }

  @Perm("documents.create")
  @Post()
  create(@SID() sid: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.create(sid, parse(documentCreateSchema, body), u, req);
  }

  @Perm("documents.update")
  @Put(":id")
  update(@SID() sid: string, @ID() id: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.s.update(sid, id, parse(documentMetaSchema, body), req);
  }

  @Perm("documents.update")
  @Post(":id/versions")
  addVersion(@SID() sid: string, @ID() id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.addVersion(sid, id, parse(documentVersionSchema, body), u, req);
  }

  @Perm("documents.view")
  @Get(":id/versions/:versionId/download")
  async download(@SID() sid: string, @ID() id: string, @Param("versionId", ParseUUIDPipe) vid: string, @Req() req: AppRequest, @Res() res: Response) {
    const f = await this.s.download(sid, id, vid, req);
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Content-Disposition", `attachment; filename="${f.filename}"; filename*=UTF-8''${encodeURIComponent(f.originalName).replace(/'/g, "%27")}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.send(f.buf);
  }

  @Perm("documents.archive")
  @Post(":id/archive")
  @HttpCode(200)
  archive(@SID() sid: string, @ID() id: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.s.setArchived(sid, id, true, parse(archiveSchema, body).reason, req);
  }

  @Perm("documents.archive")
  @Post(":id/restore")
  @HttpCode(200)
  restore(@SID() sid: string, @ID() id: string, @Req() req: AppRequest) {
    return this.s.setArchived(sid, id, false, undefined, req);
  }
}
