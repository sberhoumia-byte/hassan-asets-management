import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { chromium, type Browser } from "playwright-core";
import { config } from "../config";
import { AppError } from "../common/errors";

export interface PdfOptions {
  margins: { top: number; right: number; bottom: number; left: number };
  footerTemplate: string;
}

/**
 * توليد PDF بمحرك Chromium (بدون واجهة): يدعم العربية وتشكيل الحروف واتجاه RTL كاملاً.
 * - متصفح واحد مشترك يُشغَّل عند أول طلب، وصفحة معزولة لكل وثيقة.
 * - JavaScript معطل وكل طلبات الشبكة ممنوعة: الوثيقة لا تحمّل إلا ما هو مضمن فيها.
 * - حد للتوازي ومهلة زمنية حتى لا يستنزف التوليد موارد الخادم.
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private log = new Logger("Pdf");
  private browser: Promise<Browser> | null = null;
  private active = 0;
  private queue: (() => void)[] = [];
  private static readonly MAX_CONCURRENT = 2;
  private static readonly TIMEOUT_MS = 60_000;

  private launch(): Promise<Browser> {
    if (!this.browser) {
      const c = config();
      this.browser = chromium
        .launch({ headless: true, executablePath: c.CHROMIUM_PATH || undefined, args: c.PDF_NO_SANDBOX ? ["--no-sandbox"] : [] })
        .then((b) => {
          b.on("disconnected", () => {
            this.browser = null;
          });
          return b;
        })
        .catch((e: unknown) => {
          this.browser = null;
          this.log.error(`Chromium launch failed: ${String(e)}`);
          throw new AppError("PDF_ENGINE_UNAVAILABLE", 503);
        });
    }
    return this.browser;
  }

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= PdfService.MAX_CONCURRENT) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }

  async render(html: string, o: PdfOptions): Promise<{ pdf: Buffer; pages: number }> {
    return this.slot(async () => {
      const browser = await this.launch();
      const ctx = await browser.newContext({ javaScriptEnabled: false, offline: true });
      try {
        const page = await ctx.newPage();
        page.setDefaultTimeout(PdfService.TIMEOUT_MS);
        await page.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort()));
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate("document.fonts.ready").catch(() => undefined);
        const mm = (n: number) => `${n}mm`;
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: "<span></span>",
          footerTemplate: o.footerTemplate,
          margin: { top: mm(o.margins.top), right: mm(o.margins.right), bottom: mm(o.margins.bottom), left: mm(o.margins.left) },
          tagged: true,
        });
        return { pdf, pages: countPages(pdf) };
      } finally {
        await ctx.close().catch(() => undefined);
      }
    });
  }

  async onModuleDestroy() {
    const b = this.browser;
    this.browser = null;
    if (b) await (await b.catch(() => null))?.close().catch(() => undefined);
  }
}

/** عدد صفحات PDF من كائنات /Type /Page (دون /Pages). */
export function countPages(pdf: Buffer): number {
  const m = pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 0;
}
