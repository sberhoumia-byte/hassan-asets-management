/** عقود المرحلة 7 (تكملة): استيراد Excel والوثائق المرفوعة. الخادم فقط. */
import type { DocumentCreateInput, DocumentMetaInput, DocumentVersionInput } from "@hassan/validation";
import type { DocLang, GeneratedDownload } from "./phase7";

export type ImportEntity = "ASSETS" | "STAFF" | "SUPPLIERS" | "STOCK";
export type ImportStatus = "UPLOADED" | "MAPPED" | "VALIDATED" | "COMMITTED" | "FAILED" | "CANCELLED";

export interface ImportEntityInfo {
  entity: ImportEntity;
  allowed: boolean;
  fields: { key: string; kind: string; required?: boolean; values?: string[]; labelPrefix?: string; list?: string }[];
}
export interface ImportRowError {
  row: number;
  field?: string;
  code: string;
  value?: string;
}
export interface ImportJob {
  id: string;
  entity: ImportEntity;
  status: ImportStatus;
  fileName: string;
  headers?: string[];
  mapping?: Record<string, number | null>;
  totalRows?: number;
  acceptedRows?: number;
  rejectedRows?: number;
  errors?: ImportRowError[];
  errorCount?: number;
  missing?: string[];
  allowed?: boolean;
  created?: number;
  createdAt: string;
  committedAt?: string;
}

export interface ImportsApi {
  entities(sid: string): Promise<ImportEntityInfo[]>;
  template(sid: string, entity: ImportEntity, lang: DocLang): Promise<GeneratedDownload>;
  list(sid: string): Promise<ImportJob[]>;
  get(sid: string, id: string): Promise<ImportJob>;
  upload(sid: string, entity: ImportEntity, fileName: string, dataBase64: string): Promise<ImportJob>;
  validate(sid: string, id: string, mapping?: Record<string, number | null>): Promise<ImportJob>;
  errorsFile(sid: string, id: string, lang: DocLang): Promise<GeneratedDownload>;
  commit(sid: string, id: string, acceptPartial: boolean): Promise<ImportJob>;
  cancel(sid: string, id: string): Promise<ImportJob>;
}

export type DocumentLinkType = "ASSET" | "SUPPLIER" | "PURCHASE_ORDER" | "MAINTENANCE_REQUEST" | "ROOM" | "FACILITY";
export interface DocumentSummary {
  id: string;
  title: string;
  categoryId?: string;
  documentDate?: string;
  issuingBody?: string;
  expiresAt?: string;
  accessLevel: "SCHOOL" | "RESTRICTED";
  archivedAt?: string;
  version: number;
  mimeType?: string;
  sizeBytes?: number;
  fileName?: string;
  linkCount: number;
  updatedAt: string;
}
export interface DocumentVersionInfo {
  id: string;
  version: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  changeNote?: string;
  uploadedBy: string;
  createdAt: string;
}
export interface DocumentDetail extends DocumentSummary {
  notes?: string;
  createdBy: string;
  createdAt: string;
  links: { entityType: DocumentLinkType; entityId: string; label: string }[];
  versions: DocumentVersionInfo[];
}
export interface DocumentQuery {
  q?: string;
  categoryId?: string;
  archived?: boolean;
  entityType?: DocumentLinkType;
  entityId?: string;
}

export interface DocumentsApi {
  list(sid: string, q: DocumentQuery): Promise<DocumentSummary[]>;
  get(sid: string, id: string): Promise<DocumentDetail>;
  create(sid: string, input: DocumentCreateInput): Promise<DocumentDetail>;
  update(sid: string, id: string, input: DocumentMetaInput): Promise<DocumentDetail>;
  addVersion(sid: string, id: string, input: DocumentVersionInput): Promise<DocumentDetail>;
  download(sid: string, id: string, versionId: string): Promise<GeneratedDownload>;
  archive(sid: string, id: string, reason: string): Promise<DocumentDetail>;
  restore(sid: string, id: string): Promise<DocumentDetail>;
}

/** يقرأ ملفاً محلياً كـ base64 (بدون بادئة data:). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
