import type { DocumentCreateInput, DocumentMetaInput, DocumentVersionInput } from "@hassan/validation";
import type { DocLang } from "../phase7";
import type { DocumentDetail, DocumentQuery, DocumentsApi, DocumentSummary, ImportEntity, ImportEntityInfo, ImportJob, ImportsApi } from "../phase7b";
import type { HttpApi } from "./httpApi";

const s = (schoolId: string) => `/schools/${schoolId}`;

export class HttpImportsApi implements ImportsApi {
  constructor(private h: HttpApi) {}
  entities(sid: string) {
    return this.h.request<ImportEntityInfo[]>("GET", `${s(sid)}/imports/entities`);
  }
  template(sid: string, entity: ImportEntity, lang: DocLang) {
    return this.h.requestFile("GET", `${s(sid)}/imports/templates/${entity}`, { query: { lang } });
  }
  list(sid: string) {
    return this.h.request<ImportJob[]>("GET", `${s(sid)}/imports`);
  }
  get(sid: string, id: string) {
    return this.h.request<ImportJob>("GET", `${s(sid)}/imports/${id}`);
  }
  upload(sid: string, entity: ImportEntity, fileName: string, dataBase64: string) {
    return this.h.request<ImportJob>("POST", `${s(sid)}/imports`, { body: { entity, fileName, dataBase64 } });
  }
  validate(sid: string, id: string, mapping?: Record<string, number | null>) {
    return this.h.request<ImportJob>("POST", `${s(sid)}/imports/${id}/validate`, { body: mapping ? { mapping } : {} });
  }
  errorsFile(sid: string, id: string, lang: DocLang) {
    return this.h.requestFile("GET", `${s(sid)}/imports/${id}/errors.xlsx`, { query: { lang } });
  }
  commit(sid: string, id: string, acceptPartial: boolean) {
    return this.h.request<ImportJob>("POST", `${s(sid)}/imports/${id}/commit`, { body: { acceptPartial } });
  }
  cancel(sid: string, id: string) {
    return this.h.request<ImportJob>("POST", `${s(sid)}/imports/${id}/cancel`, { body: {} });
  }
}

export class HttpDocumentsApi implements DocumentsApi {
  constructor(private h: HttpApi) {}
  list(sid: string, q: DocumentQuery) {
    return this.h.request<DocumentSummary[]>("GET", `${s(sid)}/documents`, { query: { ...q, archived: q.archived ? "1" : undefined } });
  }
  get(sid: string, id: string) {
    return this.h.request<DocumentDetail>("GET", `${s(sid)}/documents/${id}`);
  }
  create(sid: string, input: DocumentCreateInput) {
    return this.h.request<DocumentDetail>("POST", `${s(sid)}/documents`, { body: input });
  }
  update(sid: string, id: string, input: DocumentMetaInput) {
    return this.h.request<DocumentDetail>("PUT", `${s(sid)}/documents/${id}`, { body: input });
  }
  addVersion(sid: string, id: string, input: DocumentVersionInput) {
    return this.h.request<DocumentDetail>("POST", `${s(sid)}/documents/${id}/versions`, { body: input });
  }
  download(sid: string, id: string, versionId: string) {
    return this.h.requestFile("GET", `${s(sid)}/documents/${id}/versions/${versionId}/download`);
  }
  archive(sid: string, id: string, reason: string) {
    return this.h.request<DocumentDetail>("POST", `${s(sid)}/documents/${id}/archive`, { body: { reason } });
  }
  restore(sid: string, id: string) {
    return this.h.request<DocumentDetail>("POST", `${s(sid)}/documents/${id}/restore`, { body: {} });
  }
}
