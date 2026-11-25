import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { reportRequestSchema } from "@hassan/validation";
import { CurrentUser, Perm, Req, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { ReportsService, type GeneratedFile } from "./reports.service";

const SID = () => Param("schoolId", ParseUUIDPipe);
const ID = () => Param("id", ParseUUIDPipe);
const langSchema = z.object({ lang: z.enum(["ar", "fr"]).default("ar") });
const pg = (v?: string, d = 1) => Math.max(1, Math.min(Number(v) || d, 10_000));

/** يرسل الملف مع رقم الأرشيف في الترويسات (اسم الملف ASCII آمن: رقم الأرشيف). */
function send(res: Response, f: Pick<GeneratedFile, "buf" | "mime" | "filename" | "number" | "id" | "pages">) {
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${f.filename.replace(/[^\w.-]/g, "_")}"`);
  res.setHeader("X-Report-Id", f.id);
  res.setHeader("X-Report-Number", f.number);
  if (f.pages) res.setHeader("X-Report-Pages", String(f.pages));
  res.setHeader("Cache-Control", "no-store");
  res.send(f.buf);
}

@ApiTags("reports")
@Controller("schools/:schoolId")
export class ReportsController {
  constructor(private s: ReportsService) {}

  @Perm("reports.view")
  @Get("reports")
  catalog(@Req() req: AppRequest) {
    return this.s.catalog(req.permissions ?? new Set());
  }

  @Perm("reports.view")
  @Post("reports/:key/preview")
  @HttpCode(200)
  preview(@SID() sid: string, @Param("key") key: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.preview(sid, key, parse(reportRequestSchema, body ?? {}), u, req);
  }

  @Perm("reports.print")
  @Post("reports/:key/pdf")
  @HttpCode(200)
  async pdf(@SID() sid: string, @Param("key") key: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest, @Res() res: Response) {
    send(res, await this.s.reportPdf(sid, key, parse(reportRequestSchema, body ?? {}), u, req));
  }

  @Perm("reports.export")
  @Post("reports/:key/xlsx")
  @HttpCode(200)
  async xlsx(@SID() sid: string, @Param("key") key: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest, @Res() res: Response) {
    send(res, await this.s.reportXlsx(sid, key, parse(reportRequestSchema, body ?? {}), u, req));
  }

  @Perm("reports.view")
  @Get("report-archive")
  archive(@SID() sid: string, @Req() req: AppRequest, @Query("key") key?: string, @Query("q") q?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.s.archiveList(sid, req.permissions ?? new Set(), { key, q: q?.slice(0, 100), page: pg(page), pageSize: Math.min(pg(pageSize, 25), 100) });
  }

  @Perm("reports.view")
  @Get("report-archive/:id/download")
  async download(@SID() sid: string, @ID() id: string, @Req() req: AppRequest, @Res() res: Response) {
    send(res, await this.s.archiveFile(sid, id, req.permissions ?? new Set()));
  }

  // الوثائق الفردية بصيغة PDF من الخادم (تُؤرشف بدورها)
  @Perm("reports.print")
  @Post("loans/:id/receipt.pdf")
  @HttpCode(200)
  async loanReceipt(@SID() sid: string, @ID() id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest, @Res() res: Response) {
    send(res, await this.s.loanReceiptPdf(sid, id, parse(langSchema, body ?? {}).lang, u, req));
  }

  @Perm("reports.print")
  @Post("custody/:id/report.pdf")
  @HttpCode(200)
  async custodyReport(@SID() sid: string, @ID() id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest, @Res() res: Response) {
    send(res, await this.s.custodyReportPdf(sid, id, parse(langSchema, body ?? {}).lang, u, req));
  }

  @Perm("reports.print")
  @Post("inventory-sessions/:id/report.pdf")
  @HttpCode(200)
  async inventoryReport(@SID() sid: string, @ID() id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest, @Res() res: Response) {
    send(res, await this.s.inventoryReportPdf(sid, id, parse(langSchema, body ?? {}).lang, u, req));
  }
}
