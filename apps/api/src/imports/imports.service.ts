import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { AssetsService } from "../assets/assets.service";
import { AuditService } from "../common/audit.service";
import type { AppRequest, AuthUser } from "../common/context";
import { E } from "../common/errors";
import { compact } from "../common/util";
import { sniffMime, StorageService, XLSX_MIME } from "../files/storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { translator, type Lang } from "../reports/i18n";
import { StaffService } from "../staff/staff.service";
import { StockService } from "../stock/stock.service";
import { SuppliersService } from "../suppliers/suppliers.service";
import { colLabel, IMPORT_ENTITIES, SPECS, type EntitySpec, type FieldSpec, type ImportEntity } from "./specs";

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;
const MAX_STORED_ERRORS = 5000;

type Cell = string | number | boolean | Date | null;
export interface RowError {
  row: number;
  field?: string;
  code: string;
  value?: string;
}
type Mapping = Record<string, number | null>;
interface Parsed {
  headers: string[];
  rows: { row: number; cells: Cell[] }[];
}
interface Validated {
  total: number;
  accepted: { row: number; input: Record<string, unknown> }[];
  errors: RowError[];
  rejectedRows: number;
}
interface Refs {
  categories: Map<string, string[]>;
  lookups: Map<string, Map<string, string[]>>;
  suppliers: Map<string, string[]>;
  rooms: Map<string, string[]>;
  facilities: Map<string, string[]>;
  staff: Map<string, string[]>;
  existing: Set<string>;
}

/** توحيد النص للمطابقة: حروف صغيرة، بلا تشكيل ولا نجمة الإلزام ولا مسافات زائدة. */
export function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "")
    .replace(/[*:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cellOf(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cellOf((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    return null; // خطأ صيغة (#N/A...)
  }
  return v as string | number | boolean;
}

const isBlank = (c: Cell) => c === null || (typeof c === "string" && c.trim() === "");
const asText = (c: Cell) => (c instanceof Date ? c.toISOString().slice(0, 10) : c === null ? "" : String(c).trim());

/** رقم بصيغة فرنسية أو إنجليزية: «1 234,50» أو «1,234.50» أو «1234.5». */
function parseNumber(c: Cell): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  let s = asText(c).replace(/[\s  ]/g, "").replace(/(dh|mad|درهم)$/i, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** تاريخ من خلية Excel (تاريخ، رقم تسلسلي) أو نص YYYY-MM-DD أو DD/MM/YYYY. */
function parseDate(c: Cell): string | null {
  const ok = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1950 && y <= 2100 ? dt.toISOString().slice(0, 10) : null;
  };
  if (c instanceof Date) return ok(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate());
  if (typeof c === "number" && c > 20000 && c < 80000) {
    const dt = new Date(Math.round((c - 25569) * 86400000));
    return ok(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = asText(c);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return ok(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return ok(+m[3]!, +m[2]!, +m[1]!);
  return null;
}

const TRUE = new Set(["1", "true", "yes", "oui", "نعم", "x", "vrai"]);
const FALSE = new Set(["0", "false", "no", "non", "لا", "faux"]);

@Injectable()
export class ImportsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
    private assets: AssetsService,
    private stock: StockService,
    private staffSvc: StaffService,
    private suppliers: SuppliersService,
  ) {}

  private spec(entity: string): EntitySpec {
    if (!(IMPORT_ENTITIES as readonly string[]).includes(entity)) throw E.validation({ fields: { entity: "errors.invalidChoice" } });
    return SPECS[entity as ImportEntity];
  }

  /** صلاحية الوحدة المستهدفة إضافة إلى imports.create. */
  private assertTargetPerm(spec: EntitySpec, req: AppRequest) {
    if (!spec.perms.some((p) => req.permissions?.has(p))) throw E.forbidden(spec.perms[0]);
  }

  entities(req: AppRequest) {
    return IMPORT_ENTITIES.map((e) => ({
      entity: e,
      allowed: SPECS[e].perms.some((p) => req.permissions?.has(p)),
      fields: SPECS[e].fields.map((f) => compact({ key: f.key, kind: f.kind, required: f.required || undefined, values: f.values as string[] | undefined, labelPrefix: f.labelPrefix, list: f.list })),
    }));
  }

  // ---------------------------------------------------------------- المراجع
  private async refs(schoolId: string, spec: EntitySpec): Promise<Refs> {
    const add = (m: Map<string, string[]>, key: string | null | undefined, id: string) => {
      const k = norm(key);
      if (!k) return;
      const cur = m.get(k) ?? [];
      if (!cur.includes(id)) cur.push(id);
      m.set(k, cur);
    };
    const kinds = new Set(spec.fields.map((f) => f.kind));
    const lists = spec.fields.filter((f) => f.kind === "lookup").map((f) => f.list!);
    const [cats, lks, sups, rooms, facs, staff] = await Promise.all([
      kinds.has("category") ? this.prisma.assetCategory.findMany({ where: { isActive: true, OR: [{ schoolId }, { schoolId: null }] } }) : [],
      lists.length ? this.prisma.lookupValue.findMany({ where: { listKey: { in: lists }, isActive: true, OR: [{ schoolId }, { schoolId: null }] } }) : [],
      kinds.has("supplier") ? this.prisma.supplier.findMany({ where: { schoolId, archivedAt: null } }) : [],
      kinds.has("room") ? this.prisma.room.findMany({ where: { schoolId, archivedAt: null } }) : [],
      kinds.has("facility") ? this.prisma.facility.findMany({ where: { schoolId, archivedAt: null } }) : [],
      kinds.has("staff") ? this.prisma.staffMember.findMany({ where: { schoolId, isActive: true } }) : [],
    ]);
    const r: Refs = { categories: new Map(), lookups: new Map(), suppliers: new Map(), rooms: new Map(), facilities: new Map(), staff: new Map(), existing: new Set() };
    for (const c of cats) [c.code, c.nameAr, c.nameFr].forEach((k) => add(r.categories, k, c.id));
    for (const l of lks) {
      const m = r.lookups.get(l.listKey) ?? new Map<string, string[]>();
      [l.code, l.labelAr, l.labelFr].forEach((k) => add(m, k, l.id));
      r.lookups.set(l.listKey, m);
    }
    for (const s of sups) [s.ice, s.name].forEach((k) => add(r.suppliers, k, s.id));
    for (const x of rooms) [x.code, x.name].forEach((k) => add(r.rooms, k, x.id));
    for (const x of facs) [x.code, x.name].forEach((k) => add(r.facilities, k, x.id));
    for (const x of staff) [x.staffNumber, x.fullNameAr, x.fullNameFr].forEach((k) => add(r.staff, k, x.id));

    // القيم الموجودة مسبقاً للحقول الفريدة
    const ex = (vals: (string | null)[]) => vals.forEach((v) => v && r.existing.add(norm(v)));
    if (spec.entity === "ASSETS") ex((await this.prisma.asset.findMany({ where: { schoolId }, select: { inventoryNumber: true } })).map((a) => a.inventoryNumber));
    if (spec.entity === "STAFF") ex((await this.prisma.staffMember.findMany({ where: { schoolId }, select: { staffNumber: true } })).map((a) => a.staffNumber));
    if (spec.entity === "SUPPLIERS") ex((await this.prisma.supplier.findMany({ where: { schoolId }, select: { ice: true } })).map((a) => a.ice));
    if (spec.entity === "STOCK") ex((await this.prisma.inventoryItem.findMany({ where: { schoolId }, select: { code: true } })).map((a) => a.code));
    return r;
  }

  // ---------------------------------------------------------------- القالب
  async template(schoolId: string, entity: string, lang: Lang) {
    const spec = this.spec(entity);
    const t = translator(lang);
    const wb = new ExcelJS.Workbook();
    wb.creator = "HASSAN IBN THABIT";
    const rtl = lang === "ar";
    const data = wb.addWorksheet(t("imp.sheet.data"), { views: [{ rightToLeft: rtl, state: "frozen", ySplit: 1 }] });
    const lists = wb.addWorksheet(t("imp.sheet.lists"), { views: [{ rightToLeft: rtl }] });
    const help = wb.addWorksheet(t("imp.sheet.help"), { views: [{ rightToLeft: rtl }] });

    data.columns = spec.fields.map((f) => ({ header: t(colLabel(spec.entity, f.key)) + (f.required ? " *" : ""), key: f.key, width: Math.max(14, t(colLabel(spec.entity, f.key)).length + 4) }));
    const head = data.getRow(1);
    head.font = { bold: true };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF1FA" } };
    spec.fields.forEach((f, i) => {
      if (f.required) head.getCell(i + 1).font = { bold: true, color: { argb: "FFB42318" } };
      if (f.kind === "date") data.getColumn(i + 1).numFmt = "dd/mm/yyyy";
    });

    // ورقة القوائم: القيم المقبولة الفعلية للمؤسسة (لا بيانات مفترضة)
    const choiceLists: { key: string; values: string[] }[] = [];
    for (const f of spec.fields) {
      let values: string[] = [];
      if (f.kind === "enum") values = f.values!.map((v) => t(`${f.labelPrefix}.${v}`));
      else if (f.kind === "bool") values = [t("common.yes"), t("common.no")];
      else if (f.kind === "category") values = (await this.prisma.assetCategory.findMany({ where: { isActive: true, OR: [{ schoolId }, { schoolId: null }] }, orderBy: { code: "asc" } })).map((c) => c.code);
      else if (f.kind === "lookup") values = (await this.prisma.lookupValue.findMany({ where: { listKey: f.list!, isActive: true, OR: [{ schoolId }, { schoolId: null }] }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] })).map((l) => l.code);
      else if (f.kind === "room") values = (await this.prisma.room.findMany({ where: { schoolId, archivedAt: null }, orderBy: { code: "asc" } })).map((x) => x.code);
      else if (f.kind === "facility") values = (await this.prisma.facility.findMany({ where: { schoolId, archivedAt: null }, orderBy: { code: "asc" } })).map((x) => x.code);
      if (values.length) choiceLists.push({ key: f.key, values });
    }
    choiceLists.forEach((cl, ci) => {
      const col = lists.getColumn(ci + 1);
      col.width = 26;
      lists.getCell(1, ci + 1).value = t(colLabel(spec.entity, cl.key));
      lists.getCell(1, ci + 1).font = { bold: true };
      cl.values.forEach((v, vi) => (lists.getCell(vi + 2, ci + 1).value = v));
      const fi = spec.fields.findIndex((f) => f.key === cl.key) + 1;
      const letter = lists.getColumn(ci + 1).letter;
      const range = `'${lists.name.replace(/'/g, "''")}'!$${letter}$2:$${letter}$${cl.values.length + 1}`;
      const dl = data.getColumn(fi).letter;
      // قائمة منسدلة على نطاق العمود كاملاً (بدون فرضها: يُقبل الاسم أيضاً)
      (data as unknown as { dataValidations: { add(a: string, v: ExcelJS.DataValidation): void } }).dataValidations.add(`${dl}2:${dl}${IMPORT_MAX_ROWS + 1}`, {
        type: "list",
        allowBlank: true,
        formulae: [range],
        showErrorMessage: false,
      });
    });

    // ورقة التعليمات: لكل عمود: إلزامي؟ الصيغة المقبولة
    help.columns = [
      { header: t("imp.help.column"), key: "c", width: 30 },
      { header: t("imp.help.required"), key: "r", width: 12 },
      { header: t("imp.help.format"), key: "f", width: 70 },
    ];
    help.getRow(1).font = { bold: true };
    for (const f of spec.fields) help.addRow({ c: t(colLabel(spec.entity, f.key)), r: f.required ? t("common.yes") : t("common.no"), f: t(`imp.fmt.${f.kind}`) + (f.unique ? ` ${t("imp.fmt.unique")}` : "") });
    help.addRow({});
    help.addRow({ c: t("imp.help.limits", { rows: IMPORT_MAX_ROWS }) });
    if (spec.entity === "STOCK") help.addRow({ c: t("imp.help.noBalances") });

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return { buf, mime: XLSX_MIME, filename: `template-${spec.entity.toLowerCase()}.xlsx` };
  }

  // ---------------------------------------------------------------- القراءة
  private async parse(buf: Buffer): Promise<Parsed> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as never);
    } catch {
      throw E.validation({ fields: { file: "errors.fileType" } });
    }
    const ws = wb.worksheets.find((w) => w.state !== "hidden" && w.state !== "veryHidden") ?? wb.worksheets[0];
    if (!ws) throw E.rule("IMPORT_EMPTY");
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => (headers[col - 1] = asText(cellOf(c.value))));
    for (let i = 0; i < headers.length; i++) headers[i] ??= "";
    const rows: Parsed["rows"] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const cells: Cell[] = headers.map((_, i) => cellOf(row.getCell(i + 1).value));
      if (cells.every(isBlank)) return;
      rows.push({ row: n, cells });
    });
    if (!headers.some((h) => h)) throw E.rule("IMPORT_EMPTY");
    if (rows.length > IMPORT_MAX_ROWS) throw E.rule("IMPORT_TOO_MANY_ROWS", { max: IMPORT_MAX_ROWS, rows: rows.length });
    return { headers, rows };
  }

  /** مطابقة تلقائية: عنوان العمود بالعربية أو الفرنسية أو اسم الحقل. */
  autoMap(spec: EntitySpec, headers: string[]): Mapping {
    const tAr = translator("ar");
    const tFr = translator("fr");
    const m: Mapping = {};
    for (const f of spec.fields) {
      const names = new Set([norm(tAr(colLabel(spec.entity, f.key))), norm(tFr(colLabel(spec.entity, f.key))), norm(f.key)]);
      const idx = headers.findIndex((h) => names.has(norm(h)));
      m[f.key] = idx >= 0 ? idx : null;
    }
    return m;
  }

  private checkMapping(spec: EntitySpec, headers: string[], raw: unknown): Mapping {
    const m: Mapping = {};
    const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const used = new Set<number>();
    for (const f of spec.fields) {
      const v = src[f.key];
      if (v === null || v === undefined || v === "") {
        m[f.key] = null;
        continue;
      }
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= headers.length || used.has(v)) throw E.validation({ fields: { [`mapping.${f.key}`]: "errors.invalidChoice" } });
      used.add(v);
      m[f.key] = v;
    }
    return m;
  }

  private missingRequired(spec: EntitySpec, m: Mapping) {
    return spec.fields.filter((f) => f.required && m[f.key] == null).map((f) => f.key);
  }

  // ---------------------------------------------------------------- التحقق
  private convert(f: FieldSpec, c: Cell, refs: Refs, t: (k: string) => string): { value?: unknown; error?: string } {
    if (isBlank(c)) return { value: f.default ?? (f.kind === "text" ? "" : null) };
    const one = (m: Map<string, string[]> | undefined) => {
      const ids = m?.get(norm(asText(c))) ?? [];
      return ids.length === 1 ? { value: ids[0] } : { error: ids.length > 1 ? "imp.err.ambiguous" : "imp.err.notFound" };
    };
    switch (f.kind) {
      case "text":
        return { value: asText(c) };
      case "int":
      case "number": {
        const n = parseNumber(c);
        if (n === null) return { error: "errors.number" };
        if (f.kind === "int" && !Number.isInteger(n)) return { error: "errors.integer" };
        return { value: n };
      }
      case "date": {
        const d = parseDate(c);
        return d ? { value: d } : { error: "errors.date" };
      }
      case "bool": {
        const s = norm(asText(c));
        if (TRUE.has(s) || s === norm(t("common.yes"))) return { value: true };
        if (FALSE.has(s) || s === norm(t("common.no"))) return { value: false };
        return { error: "errors.invalidChoice" };
      }
      case "enum": {
        const s = norm(asText(c));
        const tAr = translator("ar");
        const tFr = translator("fr");
        const v = f.values!.find((x) => [x, tAr(`${f.labelPrefix}.${x}`), tFr(`${f.labelPrefix}.${x}`)].some((k) => norm(k) === s));
        return v ? { value: v } : { error: "errors.invalidChoice" };
      }
      case "category":
        return one(refs.categories);
      case "lookup":
        return one(refs.lookups.get(f.list!));
      case "supplier":
        return one(refs.suppliers);
      case "room":
        return one(refs.rooms);
      case "facility":
        return one(refs.facilities);
      case "staff":
        return one(refs.staff);
    }
  }

  private async validateRows(schoolId: string, spec: EntitySpec, parsed: Parsed, m: Mapping): Promise<Validated> {
    const refs = await this.refs(schoolId, spec);
    const t = translator("ar");
    const errors: RowError[] = [];
    const accepted: Validated["accepted"] = [];
    const seen = new Map<string, Set<string>>();
    let rejectedRows = 0;
    for (const { row, cells } of parsed.rows) {
      const rowErrors: RowError[] = [];
      const input: Record<string, unknown> = {};
      for (const f of spec.fields) {
        const idx = m[f.key];
        const c = idx == null ? null : (cells[idx] ?? null);
        const r = this.convert(f, c, refs, t);
        if (r.error) rowErrors.push({ row, field: f.key, code: r.error, value: asText(c).slice(0, 100) });
        else if (r.value !== null && r.value !== undefined) input[f.key] = r.value;
      }
      if (!rowErrors.length) {
        const z = spec.schema.safeParse(input);
        if (!z.success) {
          for (const iss of z.error.issues) {
            const field = String(iss.path[0] ?? "");
            const idx = m[field];
            rowErrors.push({ row, field: field || undefined, code: iss.message.startsWith("errors.") ? iss.message : "errors.invalidChoice", value: idx == null ? undefined : asText(cells[idx] ?? null).slice(0, 100) });
          }
        }
      }
      // التفرد: داخل الملف وفي قاعدة البيانات
      for (const f of spec.fields.filter((x) => x.unique)) {
        const v = norm(input[f.key]);
        if (!v) continue;
        const s = seen.get(f.key) ?? new Set<string>();
        if (refs.existing.has(v)) rowErrors.push({ row, field: f.key, code: "imp.err.exists", value: String(input[f.key]) });
        else if (s.has(v)) rowErrors.push({ row, field: f.key, code: "imp.err.duplicateInFile", value: String(input[f.key]) });
        s.add(v);
        seen.set(f.key, s);
      }
      if (rowErrors.length) {
        rejectedRows++;
        errors.push(...rowErrors);
      } else accepted.push({ row, input });
    }
    return { total: parsed.rows.length, accepted, errors, rejectedRows };
  }

  // ---------------------------------------------------------------- المسار
  private dto(j: Prisma.ImportJobGetPayload<{ include: { sourceFile: true } }>, extra?: Record<string, unknown>) {
    const rep = (j.errorReport ?? {}) as { headers?: string[]; errors?: RowError[]; truncated?: boolean };
    return compact({
      id: j.id,
      entity: j.entity,
      status: j.status,
      fileName: j.sourceFile.originalName,
      headers: rep.headers ?? [],
      mapping: (j.columnMapping ?? {}) as Mapping,
      totalRows: j.totalRows ?? undefined,
      acceptedRows: j.acceptedRows ?? undefined,
      rejectedRows: j.rejectedRows ?? undefined,
      errors: (rep.errors ?? []).slice(0, 200),
      errorCount: rep.errors?.length ?? 0,
      createdAt: j.createdAt.toISOString(),
      committedAt: j.committedAt?.toISOString(),
      ...extra,
    });
  }

  private async job(schoolId: string, id: string) {
    const j = await this.prisma.importJob.findFirst({ where: { id, schoolId }, include: { sourceFile: true } });
    if (!j) throw E.notFound();
    return j;
  }

  async list(schoolId: string) {
    const rows = await this.prisma.importJob.findMany({ where: { schoolId }, include: { sourceFile: true }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map((j) => {
      const d = this.dto(j);
      return { ...d, errors: undefined, headers: undefined, mapping: undefined };
    });
  }

  async get(schoolId: string, id: string, req: AppRequest) {
    const j = await this.job(schoolId, id);
    return this.dto(j, { missing: this.missingRequired(this.spec(j.entity), (j.columnMapping ?? {}) as Mapping), allowed: this.spec(j.entity).perms.some((p) => req.permissions?.has(p)) });
  }

  async upload(schoolId: string, body: { entity: string; fileName: string; dataBase64: string }, user: AuthUser, req: AppRequest) {
    const spec = this.spec(body.entity);
    this.assertTargetPerm(spec, req);
    const buf = Buffer.from(body.dataBase64, "base64");
    if (!buf.length) throw E.validation({ fields: { file: "errors.required" } });
    if (buf.length > IMPORT_MAX_BYTES) throw E.validation({ fields: { file: "errors.fileTooLarge" } });
    if (sniffMime(buf) !== XLSX_MIME) throw E.validation({ fields: { file: "errors.fileType" } });
    const parsed = await this.parse(buf);
    const mapping = this.autoMap(spec, parsed.headers);
    const missing = this.missingRequired(spec, mapping);
    const j = await this.prisma.$transaction(async (tx) => {
      const f = await this.storage.save(tx, { schoolId, buf, mime: XLSX_MIME, originalName: body.fileName || "import.xlsx", uploadedById: user.id });
      const j = await tx.importJob.create({
        data: {
          schoolId,
          entity: spec.entity,
          sourceFileId: f.id,
          columnMapping: mapping,
          status: missing.length ? "UPLOADED" : "MAPPED",
          totalRows: parsed.rows.length,
          errorReport: { headers: parsed.headers },
          createdById: user.id,
        },
        include: { sourceFile: true },
      });
      await this.audit.log({ action: "IMPORT_UPLOAD", entityType: "ImportJob", entityId: j.id, after: { entity: spec.entity, file: f.originalName, rows: parsed.rows.length } }, req, tx);
      return j;
    });
    return this.dto(j, { missing, allowed: true });
  }

  private async load(j: { sourceFile: { storageKey: string; sha256: string } }) {
    let buf: Buffer;
    try {
      buf = await this.storage.read(j.sourceFile.storageKey);
    } catch {
      throw E.rule("FILE_MISSING");
    }
    if (this.storage.sha(buf) !== j.sourceFile.sha256) throw E.rule("FILE_INTEGRITY");
    return this.parse(buf);
  }

  /** تحقق دون أي كتابة في جداول الكيان: يحفظ الملخص وتقرير الأخطاء في المهمة فقط. */
  async validate(schoolId: string, id: string, body: { mapping?: unknown }, req: AppRequest) {
    const j = await this.job(schoolId, id);
    const spec = this.spec(j.entity);
    this.assertTargetPerm(spec, req);
    if (!["UPLOADED", "MAPPED", "VALIDATED"].includes(j.status)) throw E.rule("IMPORT_STATE", { status: j.status });
    const parsed = await this.load(j);
    const mapping = body.mapping !== undefined ? this.checkMapping(spec, parsed.headers, body.mapping) : ((j.columnMapping ?? {}) as Mapping);
    const missing = this.missingRequired(spec, mapping);
    if (missing.length) throw E.rule("IMPORT_MAPPING_REQUIRED", { fields: missing });
    const v = await this.validateRows(schoolId, spec, parsed, mapping);
    const u = await this.prisma.importJob.update({
      where: { id },
      data: {
        columnMapping: mapping,
        status: "VALIDATED",
        totalRows: v.total,
        acceptedRows: v.accepted.length,
        rejectedRows: v.rejectedRows,
        errorReport: { headers: parsed.headers, errors: v.errors.slice(0, MAX_STORED_ERRORS) as unknown as Prisma.InputJsonValue, truncated: v.errors.length > MAX_STORED_ERRORS },
      },
      include: { sourceFile: true },
    });
    return this.dto(u, { missing: [], allowed: true });
  }

  /** تقرير الأخطاء: صفوف الملف المرفوضة كما هي مع عمود يشرح كل خطأ. */
  async errorsXlsx(schoolId: string, id: string, lang: Lang) {
    const j = await this.job(schoolId, id);
    const spec = this.spec(j.entity);
    if (j.status !== "VALIDATED" && j.status !== "COMMITTED") throw E.rule("IMPORT_STATE", { status: j.status });
    const t = translator(lang);
    const rep = (j.errorReport ?? {}) as { errors?: RowError[] };
    const parsed = await this.load(j);
    const byRow = new Map<number, RowError[]>();
    for (const e of rep.errors ?? []) byRow.set(e.row, [...(byRow.get(e.row) ?? []), e]);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(t("imp.sheet.errors"), { views: [{ rightToLeft: lang === "ar", state: "frozen", ySplit: 1 }] });
    ws.addRow([t("imp.err.rowNo"), t("imp.err.details"), ...parsed.headers]);
    ws.getRow(1).font = { bold: true };
    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 60;
    for (const r of parsed.rows) {
      const errs = byRow.get(r.row);
      if (!errs) continue;
      const msg = errs.map((e) => `${e.field ? t(colLabel(spec.entity, e.field)) + ": " : ""}${t(e.code)}${e.value ? ` («${e.value}»)` : ""}`).join(" ؛ ");
      // تُكتب الخلايا قيماً نصية/رقمية فقط (لا صيغ)
      ws.addRow([r.row, msg, ...r.cells.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c))]);
    }
    ws.getColumn(2).alignment = { wrapText: true, vertical: "top" };
    return { buf: Buffer.from(await wb.xlsx.writeBuffer()), mime: XLSX_MIME, filename: `import-errors-${j.id.slice(0, 8)}.xlsx` };
  }

  /** الاعتماد: إعادة التحقق ثم إنشاء كل الصفوف المقبولة في معاملة واحدة مع سجل تدقيق لكل سطر. */
  async commit(schoolId: string, id: string, body: { acceptPartial?: boolean }, user: AuthUser, req: AppRequest) {
    const j = await this.job(schoolId, id);
    const spec = this.spec(j.entity);
    this.assertTargetPerm(spec, req);
    if (spec.entity === "STAFF") this.staffSvc.canManage(req);
    if (j.status !== "VALIDATED") throw E.rule("IMPORT_STATE", { status: j.status });
    const parsed = await this.load(j);
    const v = await this.validateRows(schoolId, spec, parsed, (j.columnMapping ?? {}) as Mapping);
    // البيانات تغيرت منذ التحقق (مثلاً رقم جرد أُضيف يدوياً): يُطلب تحقق جديد
    if (v.rejectedRows !== (j.rejectedRows ?? 0) || v.accepted.length !== (j.acceptedRows ?? 0)) throw E.conflict("IMPORT_STALE");
    if (!v.accepted.length) throw E.rule("IMPORT_NOTHING");
    if (v.rejectedRows > 0 && !body.acceptPartial) throw E.rule("IMPORT_HAS_ERRORS", { rejected: v.rejectedRows });

    try {
      const created = await this.prisma.$transaction(
        async (tx) => {
          // يمنع اعتماد نفس المهمة مرتين (طلبان متزامنان)
          const lock = await tx.importJob.updateMany({ where: { id, status: "VALIDATED" }, data: { status: "COMMITTED", committedAt: new Date() } });
          if (lock.count !== 1) throw E.conflict("IMPORT_STATE");
          let n = 0;
          for (const { row, input } of v.accepted) {
            const meta = { importJobId: id, importRow: row };
            if (spec.entity === "ASSETS") {
              const a = input as Parameters<AssetsService["data"]>[0];
              const inventoryNumber = a.inventoryNumber?.trim() || (await this.assets.generateNumber(tx, schoolId));
              const x = await tx.asset.create({ data: { schoolId, inventoryNumber, createdById: user.id, ...this.assets.data(a) } });
              if (x.roomId) await tx.assetLocation.create({ data: { assetId: x.id, roomId: x.roomId } });
              await this.audit.log({ action: "ASSET_CREATE", entityType: "Asset", entityId: x.id, after: { inventoryNumber, nameAr: x.name, ...meta } }, req, tx);
            } else if (spec.entity === "STAFF") {
              const s = input as Parameters<StaffService["data"]>[0];
              const x = await tx.staffMember.create({ data: { schoolId, ...this.staffSvc.data(s), isActive: true } });
              await this.audit.log({ action: "STAFF_CREATE", entityType: "StaffMember", entityId: x.id, after: { nameAr: x.fullNameAr, ...meta } }, req, tx);
            } else if (spec.entity === "SUPPLIERS") {
              const s = input as Parameters<SuppliersService["data"]>[1];
              const x = await tx.supplier.create({ data: { schoolId, ...(await this.suppliers.data(schoolId, s)) } });
              await this.audit.log({ action: "SUPPLIER_CREATE", entityType: "Supplier", entityId: x.id, after: { nameAr: x.name, ...meta } }, req, tx);
            } else {
              const s = input as Parameters<StockService["itemData"]>[0];
              const x = await tx.inventoryItem.create({ data: { schoolId, ...this.stock.itemData(s), isActive: true } });
              await this.audit.log({ action: "STOCK_ITEM_CREATE", entityType: "InventoryItem", entityId: x.id, after: { code: x.code, nameAr: x.name, ...meta } }, req, tx);
            }
            n++;
          }
          await tx.importJob.update({ where: { id }, data: { acceptedRows: n } });
          await this.audit.log({ action: "IMPORT_COMMIT", entityType: "ImportJob", entityId: id, after: { entity: spec.entity, created: n, rejected: v.rejectedRows } }, req, tx);
          return n;
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
      return this.dto(await this.job(schoolId, id), { created });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw E.conflict("IMPORT_STALE");
      throw e;
    }
  }

  async cancel(schoolId: string, id: string, req: AppRequest) {
    const j = await this.job(schoolId, id);
    if (j.status === "COMMITTED" || j.status === "CANCELLED") throw E.rule("IMPORT_STATE", { status: j.status });
    const u = await this.prisma.$transaction(async (tx) => {
      const u = await tx.importJob.update({ where: { id }, data: { status: "CANCELLED" }, include: { sourceFile: true } });
      await this.audit.log({ action: "IMPORT_CANCEL", entityType: "ImportJob", entityId: id, after: { entity: j.entity } }, req, tx);
      return u;
    });
    return this.dto(u);
  }
}
