import type { ReportFilters } from "@hassan/validation";
import type { Paged } from "../phase4";
import type { ArchivedReport, DashboardCharts, DocLang, ReportInfo, ReportPreview, ReportsApi } from "../phase7";
import type { HttpApi } from "./httpApi";

const s = (schoolId: string) => `/schools/${schoolId}`;
const DOC_PATH = { loan: "loans", custody: "custody", inventory: "inventory-sessions" } as const;
const DOC_FILE = { loan: "receipt.pdf", custody: "report.pdf", inventory: "report.pdf" } as const;

export class HttpReportsApi implements ReportsApi {
  constructor(private h: HttpApi) {}
  catalog(sid: string) {
    return this.h.request<ReportInfo[]>("GET", `${s(sid)}/reports`);
  }
  preview(sid: string, key: string, lang: DocLang, filters: ReportFilters) {
    return this.h.request<ReportPreview>("POST", `${s(sid)}/reports/${key}/preview`, { body: { lang, filters } });
  }
  pdf(sid: string, key: string, lang: DocLang, filters: ReportFilters) {
    return this.h.requestFile("POST", `${s(sid)}/reports/${key}/pdf`, { body: { lang, filters } });
  }
  xlsx(sid: string, key: string, lang: DocLang, filters: ReportFilters) {
    return this.h.requestFile("POST", `${s(sid)}/reports/${key}/xlsx`, { body: { lang, filters } });
  }
  archive(sid: string, q: { key?: string; q?: string; page: number; pageSize: number }) {
    return this.h.request<Paged<ArchivedReport>>("GET", `${s(sid)}/report-archive`, { query: q });
  }
  download(sid: string, id: string) {
    return this.h.requestFile("GET", `${s(sid)}/report-archive/${id}/download`);
  }
  docPdf(sid: string, kind: "loan" | "custody" | "inventory", id: string, lang: DocLang) {
    return this.h.requestFile("POST", `${s(sid)}/${DOC_PATH[kind]}/${id}/${DOC_FILE[kind]}`, { body: { lang } });
  }
  charts(sid: string) {
    return this.h.request<DashboardCharts>("GET", `${s(sid)}/dashboard/charts`);
  }
}
