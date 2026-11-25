/** عقود المرحلة 7: التقارير (معاينة، PDF، Excel)، الأرشيف، الرسوم البيانية. الخادم فقط. */
import type { ReportFilters, ReportKey } from "@hassan/validation";
import type { Paged } from "./phase4";

export type DocLang = "ar" | "fr";
export type ReportGroup = "assets" | "stock" | "spaces" | "resources" | "maintenance" | "purchasing" | "custody" | "inventory" | "general";

export interface ReportInfo {
  key: ReportKey;
  group: ReportGroup;
  filters: string[];
  statuses?: { prefix: string; values: string[] };
  canPrint: boolean;
  canExport: boolean;
}

export interface ReportPreview {
  html: string;
  rowCount: number;
}

/** ملف مولد (PDF أو Excel) مع رقم أرشيفه. */
export interface GeneratedDownload {
  blob: Blob;
  filename: string;
  number: string;
  id: string;
  pages?: number;
}

export interface ArchivedReport {
  id: string;
  number: string;
  reportKey: string;
  title: string;
  format: "PDF" | "XLSX";
  lang: DocLang;
  rowCount: number;
  pageCount?: number;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  createdBy: string;
}

export interface ReportsApi {
  catalog(sid: string): Promise<ReportInfo[]>;
  preview(sid: string, key: string, lang: DocLang, filters: ReportFilters): Promise<ReportPreview>;
  pdf(sid: string, key: string, lang: DocLang, filters: ReportFilters): Promise<GeneratedDownload>;
  xlsx(sid: string, key: string, lang: DocLang, filters: ReportFilters): Promise<GeneratedDownload>;
  archive(sid: string, q: { key?: string; q?: string; page: number; pageSize: number }): Promise<Paged<ArchivedReport>>;
  download(sid: string, id: string): Promise<GeneratedDownload>;
  /** وصل الإعارة، محضر العهدة، محضر الجرد: PDF من الخادم يؤرشف تلقائياً. */
  docPdf(sid: string, kind: "loan" | "custody" | "inventory", id: string, lang: DocLang): Promise<GeneratedDownload>;
  charts(sid: string): Promise<DashboardCharts>;
}

export interface DashboardCharts {
  months: string[];
  assetsByCategory: { label: string; labelFr?: string; others?: boolean; value: number }[];
  stockStatus: { ok: number; low: number; empty: number };
  resourcesDistribution: { available: number; onLoan: number; damaged: number; maintenance: number };
  loansStatus: { active: number; overdue: number; returned12: number };
  acquisitions: { month: string; count: number; value: number }[];
  maintenance: { month: string; opened: number; closed: number }[];
  inventoryResults: { number: string; matched: number; missing: number; misplaced: number; surplus: number }[];
}

/** يحفظ الملف على جهاز المستخدم (رابط تنزيل مؤقت). */
export function saveDownload(d: Pick<GeneratedDownload, "blob" | "filename">) {
  const url = URL.createObjectURL(d.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = d.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
