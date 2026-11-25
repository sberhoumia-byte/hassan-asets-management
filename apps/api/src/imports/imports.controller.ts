import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { CurrentUser, Perm, Req, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { ImportsService } from "./imports.service";

const SID = () => Param("schoolId", ParseUUIDPipe);
const ID = () => Param("id", ParseUUIDPipe);
const lang = (v?: string) => (v === "fr" ? "fr" : "ar") as "ar" | "fr";

const uploadSchema = z.object({
  entity: z.string().min(1, "errors.required"),
  fileName: z.string().trim().max(200, "errors.tooLong").default("import.xlsx"),
  // 5MB بعد الترميز base64 ≈ 6.7MB
  dataBase64: z.string().min(1, "errors.required").max(7_000_000, "errors.fileTooLarge").regex(/^[A-Za-z0-9+/=\s]+$/, "errors.fileType"),
});
const validateSchema = z.object({ mapping: z.record(z.string(), z.number().int().nullable()).optional() });
const commitSchema = z.object({ acceptPartial: z.boolean().optional() });

function sendFile(res: Response, f: { buf: Buffer; mime: string; filename: string }) {
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${f.filename.replace(/[^\w.-]/g, "_")}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(f.buf);
}

/** استيراد Excel: قالب ← رفع ومطابقة الأعمدة ← تحقق (بلا كتابة) ← تقرير أخطاء ← اعتماد. */
@ApiTags("imports")
@Controller("schools/:schoolId/imports")
export class ImportsController {
  constructor(private s: ImportsService) {}

  @Perm("imports.view")
  @Get("entities")
  entities(@Req() req: AppRequest) {
    return this.s.entities(req);
  }

  @Perm("imports.view")
  @Get("templates/:entity")
  async template(@SID() sid: string, @Param("entity") entity: string, @Query("lang") l: string | undefined, @Res() res: Response) {
    sendFile(res, await this.s.template(sid, entity, lang(l)));
  }

  @Perm("imports.view")
  @Get()
  list(@SID() sid: string) {
    return this.s.list(sid);
  }

  @Perm("imports.view")
  @Get(":id")
  get(@SID() sid: string, @ID() id: string, @Req() req: AppRequest) {
    return this.s.get(sid, id, req);
  }

  @Perm("imports.create")
  @Post()
  upload(@SID() sid: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.upload(sid, parse(uploadSchema, body), u, req);
  }

  @Perm("imports.create")
  @Post(":id/validate")
  @HttpCode(200)
  validate(@SID() sid: string, @ID() id: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.s.validate(sid, id, parse(validateSchema, body ?? {}), req);
  }

  @Perm("imports.view")
  @Get(":id/errors.xlsx")
  async errors(@SID() sid: string, @ID() id: string, @Query("lang") l: string | undefined, @Res() res: Response) {
    sendFile(res, await this.s.errorsXlsx(sid, id, lang(l)));
  }

  @Perm("imports.create")
  @Post(":id/commit")
  @HttpCode(200)
  commit(@SID() sid: string, @ID() id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.commit(sid, id, parse(commitSchema, body ?? {}), u, req);
  }

  @Perm("imports.create")
  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@SID() sid: string, @ID() id: string, @Req() req: AppRequest) {
    return this.s.cancel(sid, id, req);
  }
}
