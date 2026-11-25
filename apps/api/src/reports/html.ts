/**
 * بناء وثيقة HTML للطباعة (A4) من مواصفة مجردة: الترويسة المركزية، العنوان، المحتوى، التوقيعات.
 * نفس HTML يُستعمل للمعاينة في الواجهة ولتوليد PDF بـChromium، فما يُعاين هو ما يُطبع.
 *
 * التوزيع على الصفحات يتركه Chromium للمحرك نفسه:
 * - الترويسة في كل الصفحات: داخل <thead> لإطار الصفحة (يتكرر تلقائياً في كل صفحة).
 * - الترويسة في الأولى فقط: قبل المحتوى مباشرة.
 * - رؤوس الجداول تتكرر في كل صفحة، والأسطر لا تنقسم بين صفحتين.
 * - التذييل وترقيم الصفحات في هامش الصفحة السفلي (footerTemplate).
 */
import { fontFaceCss } from "./fonts";
import type { Lang } from "./i18n";

export interface BrandingLike {
  logoWidthMm: number;
  logoAlign: "right" | "center" | "left";
  logoDataUrl?: string;
  letterhead: {
    mode: "GENERATED" | "IMAGE" | string;
    linesAr: string[];
    linesFr: string[];
    showFrenchBlock: boolean;
    imageAlign: "right" | "center" | "left";
    showLogo: boolean;
    showContact: boolean;
    imageWidthMm: number;
    imageHeightMm: number;
    heightMm: number;
    placement: "ALL_PAGES" | "FIRST_PAGE" | string;
    marginsMm: { top: number; right: number; bottom: number; left: number };
    footerText: string;
    showFooter: boolean;
    showPageNumbers: boolean;
    imageDataUrl?: string;
    version: number;
  };
}

export interface SchoolContact {
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export type CellAlign = "start" | "end" | "center";
export interface Column {
  label: string;
  align?: CellAlign;
  /** نص لا يُقلب اتجاهه (أرقام الجرد، الرموز، المبالغ). */
  ltr?: boolean;
  widthPct?: number;
}

export type Block =
  | { kind: "kv"; rows: [string, string][]; ltrValues?: number[] }
  | { kind: "table"; columns: Column[]; rows: string[][]; footer?: string[]; testId?: string; empty?: string }
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string; bold?: boolean }
  | { kind: "notes"; text: string }
  | { kind: "stats"; items: [string, string][] }
  | { kind: "signatures"; labels: string[] }
  | { kind: "pageBreak" };

export interface DocSpec {
  lang: Lang;
  title: string;
  number?: { label: string; value: string };
  /** أسطر صغيرة تحت العنوان (المرشحات، تاريخ التحرير...). */
  meta?: string[];
  blocks: Block[];
  watermark?: string;
}

export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** يقبل فقط صور data: الآمنة (لا روابط خارجية في الوثيقة). */
const safeImg = (u?: string) => (u && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : undefined);

export function letterheadHeightMm(b: BrandingLike): number {
  const lh = b.letterhead;
  return lh.mode === "IMAGE" && safeImg(lh.imageDataUrl) ? lh.imageHeightMm : lh.heightMm;
}

/** الترويسة المركزية: نفس منطق مكوّن الواجهة LetterheadView (أبعاد بالمليمتر). */
export function letterheadHtml(b: BrandingLike, school?: SchoolContact): string {
  const lh = b.letterhead;
  const height = letterheadHeightMm(b);
  const img = lh.mode === "IMAGE" ? safeImg(lh.imageDataUrl) : undefined;
  if (img) {
    const justify = lh.imageAlign === "center" ? "center" : lh.imageAlign === "right" ? "flex-end" : "flex-start";
    return `<div class="lh" data-letterhead style="height:${height}mm;display:flex;justify-content:${justify};align-items:center"><img src="${img}" alt="" style="width:${lh.imageWidthMm}mm;height:${lh.imageHeightMm}mm;object-fit:contain"></div>`;
  }
  const logoSrc = lh.showLogo ? safeImg(b.logoDataUrl) : undefined;
  const logo = logoSrc
    ? `<div class="lh-logo"><img src="${logoSrc}" alt="" style="width:${b.logoWidthMm}mm;max-height:${Math.max(4, height - 4)}mm;object-fit:contain"></div>`
    : `<div></div>`;
  const ar = `<div class="lh-ar">${lh.linesAr.filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;
  const fr = lh.showFrenchBlock ? `<div class="lh-fr">${lh.linesFr.filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join("")}</div>` : `<div></div>`;
  // الترتيب الفعلي من اليسار إلى اليمين على الورقة حسب موضع الشعار
  const cols = b.logoAlign === "right" ? [fr, ar, logo] : b.logoAlign === "left" ? [logo, fr, ar] : [fr, logo, ar];
  const tpl = b.logoAlign === "center" ? "1fr auto 1fr" : b.logoAlign === "right" ? "1fr 1fr auto" : "auto 1fr 1fr";
  const contact = lh.showContact && school ? [school.address, school.phone, school.email].filter(Boolean).join("  ·  ") : "";
  return `<div class="lh" data-letterhead style="height:${height}mm;overflow:hidden">
<div class="lh-generated" style="grid-template-columns:${tpl};height:${contact ? `calc(${height}mm - 6mm)` : `${height}mm`}">${cols.join("")}</div>
${contact ? `<div class="lh-contact">${esc(contact)}</div>` : ""}</div>`;
}

function blockHtml(b: Block): string {
  switch (b.kind) {
    case "heading":
      return `<h3 class="sec">${esc(b.text)}</h3>`;
    case "para":
      return `<p class="para"${b.bold ? ' style="font-weight:700"' : ""}>${esc(b.text)}</p>`;
    case "notes":
      return `<div class="notes">${esc(b.text)}</div>`;
    case "pageBreak":
      return `<div style="break-after:page"></div>`;
    case "kv":
      return `<table class="grid kv"><tbody>${b.rows
        .map(([k, v], i) => `<tr><th>${esc(k)}</th><td${b.ltrValues?.includes(i) ? ' dir="ltr" class="ltr"' : ""}>${esc(v)}</td></tr>`)
        .join("")}</tbody></table>`;
    case "stats":
      return `<div class="stats">${b.items.map(([k, v]) => `<div class="stat"><div class="stat-v" dir="ltr">${esc(v)}</div><div class="stat-k">${esc(k)}</div></div>`).join("")}</div>`;
    case "signatures":
      return `<div class="signs" style="grid-template-columns:repeat(${b.labels.length},1fr)">${b.labels.map((l) => `<div class="sign">${esc(l)}</div>`).join("")}</div>`;
    case "table": {
      const cls = (c: Column) => [c.align === "end" ? "al-end" : c.align === "center" ? "al-center" : "", c.ltr ? "ltr" : ""].filter(Boolean).join(" ");
      const cols = b.columns.some((c) => c.widthPct) ? `<colgroup>${b.columns.map((c) => `<col${c.widthPct ? ` style="width:${c.widthPct}%"` : ""}>`).join("")}</colgroup>` : "";
      const head = `<thead><tr>${b.columns.map((c) => `<th class="${cls(c)}">${esc(c.label)}</th>`).join("")}</tr></thead>`;
      const body = b.rows.length
        ? b.rows.map((r) => `<tr>${r.map((v, i) => `<td class="${cls(b.columns[i] ?? { label: "" })}"${b.columns[i]?.ltr ? ' dir="ltr"' : ""}>${esc(v)}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${b.columns.length}" class="al-center empty">${esc(b.empty ?? "—")}</td></tr>`;
      const foot = b.footer ? `<tfoot><tr>${b.footer.map((v, i) => `<td class="${cls(b.columns[i] ?? { label: "" })}">${esc(v)}</td>`).join("")}</tr></tfoot>` : "";
      return `<table class="grid data"${b.testId ? ` data-testid="${esc(b.testId)}"` : ""}>${cols}${head}<tbody>${body}</tbody>${foot}</table>`;
    }
  }
}

/** عرض الهوامش الفعلية لـ Chromium (الهامش السفلي يتسع للتذييل وترقيم الصفحات). */
export function pageMargins(b: BrandingLike) {
  const m = b.letterhead.marginsMm;
  const needsFooter = b.letterhead.showFooter || b.letterhead.showPageNumbers;
  return { top: m.top, right: m.right, bottom: Math.max(m.bottom, needsFooter ? 14 : m.bottom), left: m.left };
}

/** نص التذييل وترقيم الصفحات (footerTemplate في Chromium؛ pageNumber/totalPages يملؤها المحرك). */
export function footerTemplate(b: BrandingLike, lang: Lang, pageLabel: string): string {
  const lh = b.letterhead;
  const m = pageMargins(b);
  if (!lh.showFooter && !lh.showPageNumbers) return "<span></span>";
  const pages = pageLabel.replace("{p}", '<span class="pageNumber"></span>').replace("{n}", '<span class="totalPages"></span>');
  // القالب معزول عن الصفحة: الخط يُضمَّن فيه من جديد، والقياسات بالبكسل (القالب لا يرث تكبير الصفحة).
  return `<div dir="${lang === "ar" ? "rtl" : "ltr"}" style="width:100%;margin:0 ${m.right}mm 0 ${m.left}mm;padding-top:1.5mm;border-top:0.3mm solid #c9d2df;display:flex;justify-content:space-between;font-family:DocSans,sans-serif;font-size:8px;color:#555;-webkit-print-color-adjust:exact">
<style>${fontFaceCss()}</style>
<span>${lh.showFooter ? esc(lh.footerText) : ""}</span><span>${lh.showPageNumbers ? pages : ""}</span></div>`;
}

export function documentHtml(doc: DocSpec, b: BrandingLike, school?: SchoolContact, opts: { preview?: boolean } = {}): string {
  const dir = doc.lang === "ar" ? "rtl" : "ltr";
  const lh = letterheadHtml(b, school);
  const all = b.letterhead.placement === "ALL_PAGES";
  const m = pageMargins(b);
  const header = `<div class="title-block"><h1>${esc(doc.title)}</h1>${
    doc.number ? `<div class="num">${esc(doc.number.label)}: <b dir="ltr">${esc(doc.number.value)}</b></div>` : ""
  }${(doc.meta ?? []).map((x) => `<div class="meta">${esc(x)}</div>`).join("")}</div>`;
  const body = doc.blocks.map(blockHtml).join("\n");
  const frame = all
    ? `<table class="frame"><thead><tr><td><div class="lh-wrap">${lh}</div></td></tr></thead><tbody><tr><td>${header}${body}</td></tr></tbody></table>`
    : `<div class="lh-wrap">${lh}</div>${header}${body}`;
  return `<!doctype html>
<html lang="${doc.lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'">
<style>
${fontFaceCss()}
@page { size: A4; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }
:root { --navy: #0B2545; --line: #c9d2df; --head: #eaf1fa; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; }
body { font-family: DocSans, sans-serif; font-size: 10pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${opts.preview ? `body { background: #dde3ec; padding: 6mm 0; } .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; box-shadow: 0 6px 24px rgba(11,37,69,.14); }` : ""}
.frame { width: 100%; border-collapse: collapse; }
.frame > thead > tr > td, .frame > tbody > tr > td { padding: 0; vertical-align: top; }
.lh-wrap { padding-bottom: 4mm; }
.lh-generated { display: grid; align-items: center; gap: 4mm; border-bottom: 0.5mm solid var(--navy); padding-bottom: 2mm; direction: ltr; }
.lh-generated > div { display: flex; flex-direction: column; justify-content: center; }
.lh-logo { align-items: center; }
.lh-ar { text-align: right; direction: rtl; line-height: 1.55; font-size: 9.5pt; }
.lh-fr { text-align: left; direction: ltr; line-height: 1.55; font-size: 8.5pt; }
.lh-ar div:last-child, .lh-fr div:last-child { font-weight: 700; }
.lh-contact { height: 6mm; font-size: 8pt; text-align: center; color: #444; direction: rtl; padding-top: 1mm; }
.title-block { text-align: center; margin: 0 0 4mm; }
h1 { font-family: DocSans, sans-serif; font-weight: 700; font-size: 15pt; margin: 0 0 1.5mm; color: var(--navy); }
.num { font-size: 10pt; margin-bottom: 1mm; }
.meta { font-size: 8.5pt; color: #444; }
h3.sec { font-family: DocSans, sans-serif; font-weight: 700; font-size: 11pt; margin: 4mm 0 2mm; color: var(--navy); break-after: avoid; }
.para { font-size: 9.5pt; margin: 2mm 0; }
.notes { border: 0.3mm solid var(--line); border-radius: 1.5mm; min-height: 22mm; padding: 2mm; white-space: pre-wrap; font-size: 10pt; }
table.grid { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 4mm; }
table.grid th, table.grid td { border: 0.3mm solid var(--line); padding: 1.3mm 1.8mm; text-align: start; vertical-align: top; }
table.grid th { background: var(--head); font-weight: 700; }
table.grid thead { display: table-header-group; }
table.grid tfoot { display: table-row-group; }
table.grid tfoot td { font-weight: 700; background: #f5f8fc; }
table.grid tr { break-inside: avoid; }
table.kv th { width: 36%; }
.al-end { text-align: end !important; }
.al-center { text-align: center !important; }
td.ltr, th.ltr { unicode-bidi: plaintext; }
td.empty { color: #666; padding: 4mm !important; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm; margin-bottom: 4mm; }
.stat { border: 0.3mm solid var(--line); border-radius: 1.5mm; padding: 2mm; text-align: center; break-inside: avoid; }
.stat-v { font-size: 13pt; font-weight: 700; color: var(--navy); }
.stat-k { font-size: 8pt; color: #444; }
.signs { display: grid; gap: 6mm; margin-top: 8mm; break-inside: avoid; }
.sign { border: 0.3mm solid var(--line); border-radius: 1.5mm; height: 30mm; padding: 2mm; font-size: 9.5pt; font-weight: 700; text-align: center; }
</style></head>
<body>${opts.preview ? `<div class="sheet">${frame}</div>` : frame}</body></html>`;
}
