import ExcelJS from "exceljs";
import type { ColDef, ReportData } from "./catalog";
import { DOC_TZ, type Fmt } from "./i18n";

/** ساعة الحائط بالمنطقة الزمنية المعتمدة (Excel لا يعرف المناطق الزمنية). */
function wallClock(iso: string): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DOC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")));
}

const NUM_FMT: Record<string, string> = { num: "#,##0.###", money: "#,##0.00", date: "dd/mm/yyyy", datetime: "dd/mm/yyyy hh:mm" };

function cellValue(col: Pick<ColDef, "kind">, v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  switch (col.kind) {
    case "num":
    case "money":
      return typeof v === "number" ? v : Number(v);
    case "date":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : wallClock(String(v));
    case "datetime":
      return wallClock(String(v));
    default:
      return String(v);
  }
}

/**
 * مصنف Excel للتقرير: رأس المؤسسة والعنوان والمرشحات، ثم جدول بقيم مكتوبة (أرقام وتواريخ حقيقية لا نصوص)،
 * مع تصفية تلقائية وتجميد صف العناوين واتجاه من اليمين إلى اليسار للعربية.
 */
export async function buildXlsx(p: {
  fmt: Fmt;
  title: string;
  headerLines: string[];
  meta: string[];
  data: ReportData;
  number: string;
}): Promise<Buffer> {
  const { fmt, data } = p;
  const t = fmt.t;
  const wb = new ExcelJS.Workbook();
  wb.creator = t("app.shortName");
  wb.title = p.title;
  wb.created = new Date();
  const ws = wb.addWorksheet(p.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "), {
    views: [{ rightToLeft: fmt.lang === "ar", state: "frozen", ySplit: 0 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const cols: ColDef[] = data.sections ? data.columns : data.columns;
  const width = Math.max(cols.length, 3);
  const line = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) => {
    const r = ws.addRow([text]);
    ws.mergeCells(r.number, 1, r.number, width);
    r.getCell(1).font = { name: "Arial", bold: o.bold, size: o.size ?? 10, color: o.color ? { argb: o.color } : undefined };
    r.getCell(1).alignment = { horizontal: "center", vertical: "middle", readingOrder: fmt.lang === "ar" ? "rtl" : "ltr" };
    return r;
  };

  for (const l of p.headerLines) line(l, { bold: true });
  ws.addRow([]);
  line(p.title, { bold: true, size: 14, color: "FF0B2545" });
  line(`${t("rpt.archiveNumber")}: ${p.number}`, { size: 9 });
  for (const m of p.meta) line(m, { size: 9, color: "FF444444" });
  ws.addRow([]);

  if (data.summary?.length) {
    for (const [k, v] of data.summary) {
      const r = ws.addRow([t(k), v]);
      r.getCell(1).font = { name: "Arial", bold: true };
    }
    ws.addRow([]);
  }

  const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF1FA" } };
  const border: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFC9D2DF" } },
    bottom: { style: "thin", color: { argb: "FFC9D2DF" } },
    left: { style: "thin", color: { argb: "FFC9D2DF" } },
    right: { style: "thin", color: { argb: "FFC9D2DF" } },
  };

  const header = ws.addRow(cols.map((c) => t(c.label)));
  header.eachCell((c) => {
    c.font = { name: "Arial", bold: true };
    c.fill = headerFill;
    c.border = border;
    c.alignment = { vertical: "middle", wrapText: true };
  });
  const headerRow = header.number;

  const rows: unknown[][] = data.sections
    ? data.sections.flatMap((s) => s.rows.map(([k, v]) => [t(s.title), t(k), v]))
    : data.rows.map((r) => cols.map((c) => r[c.key]));
  for (const r of rows) {
    const row = ws.addRow(r.map((v, i) => cellValue(data.sections ? { kind: i === 2 ? "num" : "text" } : cols[i]!, v)));
    row.eachCell({ includeEmpty: true }, (c, i) => {
      c.border = border;
      const kind = data.sections ? (i === 3 ? "num" : "text") : cols[i - 1]?.kind;
      if (kind && NUM_FMT[kind]) c.numFmt = NUM_FMT[kind]!;
    });
  }
  const lastData = ws.rowCount;

  if (!data.sections && rows.length && cols.some((c) => c.total)) {
    const tot = ws.addRow(cols.map((c, i) => (i === 0 ? t("rpt.total") : c.total ? { formula: `SUM(${colLetter(i + 1)}${headerRow + 1}:${colLetter(i + 1)}${lastData})` } : null)));
    tot.eachCell({ includeEmpty: true }, (c, i) => {
      c.font = { name: "Arial", bold: true };
      c.border = border;
      const kind = cols[i - 1]?.kind;
      if (kind && NUM_FMT[kind]) c.numFmt = NUM_FMT[kind]!;
    });
  }

  ws.views = [{ rightToLeft: fmt.lang === "ar", state: "frozen", ySplit: headerRow }];
  if (rows.length) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastData, column: cols.length } };
  cols.forEach((c, i) => {
    const longest = Math.max(t(c.label).length, ...rows.slice(0, 500).map((r) => String(r[i] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(48, Math.max(10, longest + 2));
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
