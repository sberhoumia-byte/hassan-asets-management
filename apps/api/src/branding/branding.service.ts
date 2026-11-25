import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  LETTERHEAD_MAX_BYTES,
  LETTERHEAD_TYPES,
  letterheadSchema,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  logoSettingsSchema,
  type LetterheadInput,
} from "@hassan/validation";
import { DEFAULT_LOGO, defaultLetterheadFields } from "@hassan/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { decodeDataUrl, StorageService, type DecodedImage } from "../files/storage.service";
import { E } from "../common/errors";
import type { AppRequest, AuthUser } from "../common/context";

export const brandingBodySchema = logoSettingsSchema.extend({
  logoDataUrl: z.string().max(4_000_000).optional(),
  letterhead: letterheadSchema.extend({ imageDataUrl: z.string().max(8_000_000).optional() }),
});
export type BrandingBody = z.infer<typeof brandingBodySchema>;

type Tx = Prisma.TransactionClient;
type Align = "right" | "center" | "left";

/** حقول إضافية للترويسة لا تقابلها أعمدة مستقلة: تُحفظ في textLines وfooter (JSON). */
interface TextLinesJson {
  ar: string[];
  fr: string[];
  showFrenchBlock: boolean;
  imageAlign: Align;
}
interface FooterJson {
  text: string;
  showFooter: boolean;
  showPageNumbers: boolean;
}

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

@Injectable()
export class BrandingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  private async defaults(schoolId: string) {
    const s = await this.prisma.school.findUnique({ where: { id: schoolId }, include: { directorate: { include: { academy: true } } } });
    if (!s) throw E.notFound();
    return defaultLetterheadFields(s.directorate.academy, s.directorate, s);
  }

  async get(schoolId: string) {
    const b = await this.prisma.brandingSettings.findUnique({
      where: { schoolId },
      include: { logoFile: true, defaultLetterhead: { include: { imageFile: true } } },
    });
    if (!b?.defaultLetterhead) {
      return {
        schoolId,
        ...DEFAULT_LOGO,
        ...(b?.logoFile ? { logoWidthMm: Number(b.logoWidthMm ?? DEFAULT_LOGO.logoWidthMm), logoAlign: (b.logoPosition ?? "center") as Align } : {}),
        logoDataUrl: await this.storage.dataUrl(b?.logoFile),
        letterhead: { ...(await this.defaults(schoolId)), version: 1 },
      };
    }
    const lh = b.defaultLetterhead;
    const lines = (lh.textLines ?? {}) as Partial<TextLinesJson>;
    const footer = (lh.footer ?? {}) as Partial<FooterJson>;
    const updatedBy = b.updatedById ? await this.prisma.user.findUnique({ where: { id: b.updatedById }, select: { fullNameAr: true } }) : null;
    return {
      schoolId,
      logoWidthMm: Number(b.logoWidthMm ?? DEFAULT_LOGO.logoWidthMm),
      logoAlign: (b.logoPosition ?? DEFAULT_LOGO.logoAlign) as Align,
      logoDataUrl: await this.storage.dataUrl(b.logoFile),
      letterhead: {
        mode: lh.mode,
        linesAr: lines.ar ?? [],
        linesFr: lines.fr ?? [],
        showFrenchBlock: lines.showFrenchBlock ?? true,
        imageAlign: lines.imageAlign ?? "center",
        showLogo: lh.showLogo,
        showContact: lh.showContact,
        imageWidthMm: Number(lh.imageWidthMm ?? 180),
        imageHeightMm: Number(lh.imageHeightMm ?? 35),
        heightMm: Number(lh.heightMm),
        placement: lh.placement,
        marginsMm: lh.marginsMm as LetterheadInput["marginsMm"],
        footerText: footer.text ?? b.footerText ?? "",
        showFooter: footer.showFooter ?? true,
        showPageNumbers: footer.showPageNumbers ?? b.showPageNumbers,
        imageDataUrl: await this.storage.dataUrl(lh.imageFile),
        version: lh.version,
      },
      updatedAt: b.updatedAt.toISOString(),
      updatedBy: updatedBy?.fullNameAr,
    };
  }

  /** يعيد استعمال الملف الحالي إن لم تتغير الصورة، وإلا يخزن ملفاً جديداً (القديم يبقى للتاريخ). */
  private async resolveImage(
    tx: Tx,
    img: DecodedImage | null,
    current: { id: string; sha256: string } | null | undefined,
    schoolId: string,
    name: string,
    user: AuthUser,
  ): Promise<string | null> {
    if (!img) return null;
    if (current && current.sha256 === sha(img.buf)) return current.id;
    const f = await this.storage.save(tx, { schoolId, buf: img.buf, mime: img.mime, originalName: name, uploadedById: user.id });
    return f.id;
  }

  private async nextVersion(tx: Tx, schoolId: string) {
    const agg = await tx.letterhead.aggregate({ where: { schoolId }, _max: { version: true } });
    // بدون أي ترويسة محفوظة، الافتراضي المعروض هو الإصدار 1، فأول حفظ هو 2
    return (agg._max.version ?? 1) + 1;
  }

  async save(schoolId: string, body: BrandingBody, user: AuthUser, req: AppRequest) {
    const logo = body.logoDataUrl ? decodeDataUrl(body.logoDataUrl, LOGO_TYPES, LOGO_MAX_BYTES, "logo") : null;
    const lhImage =
      body.letterhead.mode === "IMAGE" && body.letterhead.imageDataUrl
        ? decodeDataUrl(body.letterhead.imageDataUrl, LETTERHEAD_TYPES, LETTERHEAD_MAX_BYTES, "letterheadImage")
        : null;
    if (body.letterhead.mode === "IMAGE" && !lhImage) throw E.validation({ fields: { letterheadImage: "errors.required" } });
    const before = await this.get(schoolId);

    await this.prisma.$transaction(async (tx) => {
      const prev = await tx.brandingSettings.findUnique({
        where: { schoolId },
        include: { logoFile: true, defaultLetterhead: { include: { imageFile: true } } },
      });
      const logoFileId = await this.resolveImage(tx, logo, prev?.logoFile, schoolId, "logo", user);
      const imageFileId = await this.resolveImage(tx, lhImage, prev?.defaultLetterhead?.imageFile, schoolId, "letterhead", user);
      const lhRow = await this.createLetterhead(tx, schoolId, body.letterhead, imageFileId, user);
      if (prev?.defaultLetterheadId) await tx.letterhead.update({ where: { id: prev.defaultLetterheadId }, data: { isArchived: true } });
      const data = {
        logoFileId,
        logoWidthMm: body.logoWidthMm,
        logoPosition: body.logoAlign,
        defaultLetterheadId: lhRow.id,
        footerText: body.letterhead.footerText,
        showPageNumbers: body.letterhead.showPageNumbers,
        updatedById: user.id,
      };
      await tx.brandingSettings.upsert({ where: { schoolId }, create: { schoolId, ...data }, update: data });
      await this.audit.log(
        {
          action: "BRANDING_SAVE",
          entityType: "Branding",
          entityId: lhRow.id,
          schoolId,
          before: summary(before),
          after: { ...summary({ ...body, letterhead: { ...body.letterhead, version: lhRow.version } }), logoFileId, imageFileId },
        },
        req,
        tx,
      );
    });
    return this.get(schoolId);
  }

  private async createLetterhead(tx: Tx, schoolId: string, l: LetterheadInput, imageFileId: string | null, user: AuthUser) {
    const textLines: TextLinesJson = { ar: l.linesAr, fr: l.linesFr, showFrenchBlock: l.showFrenchBlock, imageAlign: l.imageAlign };
    const footer: FooterJson = { text: l.footerText, showFooter: l.showFooter, showPageNumbers: l.showPageNumbers };
    const version = await this.nextVersion(tx, schoolId);
    return tx.letterhead.create({
      data: {
        schoolId,
        name: `v${version}`,
        mode: l.mode,
        imageFileId: l.mode === "IMAGE" ? imageFileId : null,
        imageWidthMm: l.imageWidthMm,
        imageHeightMm: l.imageHeightMm,
        textLines: textLines as unknown as Prisma.InputJsonValue,
        showLogo: l.showLogo,
        showContact: l.showContact,
        placement: l.placement,
        heightMm: l.heightMm,
        marginsMm: l.marginsMm,
        footer: footer as unknown as Prisma.InputJsonValue,
        version,
        createdById: user.id,
      },
    });
  }

  /** استعادة الترويسة الافتراضية كإصدار جديد (الإصدارات السابقة تبقى في التاريخ). الشعار لا يُمس. */
  async reset(schoolId: string, user: AuthUser, req: AppRequest) {
    const defaults = await this.defaults(schoolId);
    await this.prisma.$transaction(async (tx) => {
      const prev = await tx.brandingSettings.findUnique({ where: { schoolId } });
      const lhRow = await this.createLetterhead(tx, schoolId, defaults, null, user);
      if (prev?.defaultLetterheadId) await tx.letterhead.update({ where: { id: prev.defaultLetterheadId }, data: { isArchived: true } });
      const data = {
        defaultLetterheadId: lhRow.id,
        footerText: defaults.footerText,
        showPageNumbers: defaults.showPageNumbers,
        updatedById: user.id,
      };
      await tx.brandingSettings.upsert({ where: { schoolId }, create: { schoolId, ...data }, update: data });
      await this.audit.log({ action: "BRANDING_RESET", entityType: "Branding", entityId: lhRow.id, schoolId, after: { version: lhRow.version } }, req, tx);
    });
    return this.get(schoolId);
  }

  async history(schoolId: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { schoolId, entityType: "Branding", action: { in: ["BRANDING_SAVE", "BRANDING_RESET"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { fullNameAr: true } } },
    });
    return rows.map((r) => ({
      at: r.createdAt.toISOString(),
      by: r.user?.fullNameAr ?? "",
      version: Number(((r.after ?? {}) as { version?: number }).version ?? 0),
      summaryKey: r.action === "BRANDING_RESET" ? "history.reset" : "history.saved",
    }));
  }
}

/** ما يُسجل في التدقيق: الإعدادات دون الصور المضمنة. */
function summary(b: { logoWidthMm: number; logoAlign: string; letterhead: Record<string, unknown> & { version?: number } }) {
  const { imageDataUrl: _i, ...lh } = b.letterhead as Record<string, unknown>;
  return { logoWidthMm: b.logoWidthMm, logoAlign: b.logoAlign, version: b.letterhead.version, letterhead: lh };
}
