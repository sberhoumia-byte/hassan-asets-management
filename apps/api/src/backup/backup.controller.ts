import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req as NestReq, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { createReadStream } from "node:fs";
import { backupRestoreSchema } from "@hassan/validation";
import { AdminOnly, CurrentUser, Req, type AppRequest, type AuthUser } from "../common/context";
import { E } from "../common/errors";
import { parse } from "../common/zod";
import { BackupService } from "./backup.service";

/** النسخ الاحتياطي للنظام كله: لمدير النظام فقط (لا يخص مؤسسة واحدة). */
@ApiTags("backup")
@AdminOnly()
@Controller("backups")
export class BackupController {
  constructor(private s: BackupService) {}

  @Get()
  list() {
    return this.s.list();
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.create(u, req);
  }

  /** جسم الطلب: الملف المشفر نفسه (application/octet-stream). */
  @Post("upload")
  upload(@NestReq() raw: Request, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    if (!Buffer.isBuffer(raw.body)) throw E.validation({ fields: { file: "errors.fileType" } });
    return this.s.upload(raw.body, u, req);
  }

  @Post(":id/verify")
  @HttpCode(200)
  verify(@Param("id", ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return this.s.verify(id, req);
  }

  @Get(":id/download")
  async download(@Param("id", ParseUUIDPipe) id: string, @Req() req: AppRequest, @Res() res: Response) {
    const f = await this.s.file(id, req);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${f.filename}"`);
    res.setHeader("Content-Length", String(f.size));
    res.setHeader("Cache-Control", "no-store");
    createReadStream(f.path).pipe(res);
  }

  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.restore(id, parse(backupRestoreSchema, body), u, req);
  }
}
