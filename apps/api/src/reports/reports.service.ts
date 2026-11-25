import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { formatNumber } from "@hassan/shared";
import type { ReportFilters, ReportRequest } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { StorageService } from "../files/storage.service";
import { BrandingService } from "../branding/branding.service";
import { InventoryService } from "../inventory/inventory.service";
import { ResourcesService } from "../resources/resources.service";
import { LoansService } from "../loans/loans.service";
import { CustodyService } from "../custody/custody.service";
import { nextSequence } from "../common/sequences";
import { E } from "../common/errors";
import type { AppRequest, AuthUser } from "../common/context";
import { getDef, REPORTS, type ColDef, type Raw, type ReportData } from "./catalog";
import { documentHtml, footerTemplate, pageMargins, type Block, type BrandingLike, type DocSpec, type SchoolContact } from "./html";
import { formatter, type Fmt, type Lang } from "./i18n";
import { PdfService } from "./pdf.service";
import { buildXlsx } from "./xlsx";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** الوثائق الفردية (وصل، محضر) وصلاحية الاطلاع على مصدرها. */
export const DOC_KEYS = { DOC_LOAN_RECEIPT: "loans.view", DOC_INVENTORY: "inventory.view", DOC_CUSTODY: "custody.view" } as const;
type DocKey = keyof typeof DOC_KEYS;

export interface GeneratedFile {
  id: string;
  number: string;
  buf: Buffer;
  mime: string;
  filename: string;
  pages?: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
    private branding: BrandingService,
    private pdf: PdfService,
    private inventory: InventoryService,
    private resources: ResourcesService,
    private loans: LoansService,
    private custody: CustodyService,
  ) {}

  /** التقارير المتاحة للمستخدم: يلزم reports.view وصلاحية الاطلاع على الوحدة المعنية. */
  catalog(perms: Set<string>) {
    return REPORTS.filter((r) => perms.has(r.perm)).map((r) => ({
      key: r.key,
      group: r.group,
      filters: r.filters,
      statuses: r.statuses ? { prefix: r.statuses.prefix, values: [...r.statuses.values] } : undefined,
      canPrint: perms.has("reports.print"),
      canExport: perms.has("reports.export"),
    }));
  }

  private need(req: AppRequest, perm: string) {
    if (!req.permissions?.has(perm)) throw E.forbidden(perm);
  }

  // ------------------------------------------------------------------
  // بناء البيانات والوثيقة
  // ------------------------------------------------------------------

  private async school(schoolId: string): Promise<SchoolContact & { nameAr: string; nameFr: string | null }> {
    const s = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { nameAr: true, nameFr: true, address: true, phone: true, email: true } });
    if (!s) throw E.notFound();
    return s;
  }

  /** وصف المرشحات بلغة الوثيقة؛ المعرفات يجب أن تنتمي إلى المؤسسة (عزل البيانات). */
  private async describeFilters(schoolId: string, f: ReportFilters, keys: readonly string[], fmt: Fmt, statusPrefix?: string): Promise<string[]> {
    const t = fmt.t;
    const out: string[] = [];
    const bad = (k: string) => E.validation({ fields: { [k]: "errors.invalidChoice" } });
    const used = (k: string) => keys.includes(k) && f[k as keyof ReportFilters] !== undefined && f[k as keyof ReportFilters] !== "";
    if (used("from") || used("to")) {
      const from = keys.includes("from") && f.from ? fmt.date(f.from) : "…";
      const to = keys.includes("to") && f.to ? fmt.date(f.to) : "…";
      out.push(`${t("rpt.f.period")}: ${from} — ${to}`);
    }
    if (used("status") && statusPrefix) out.push(`${t("rpt.f.status")}: ${t(`${statusPrefix}.${f.status}`)}`);
    if (used("categoryId")) {
      const c = await this.prisma.assetCategory.findFirst({ where: { id: f.categoryId, OR: [{ schoolId }, { schoolId: null }] } });
      if (!c) throw bad("categoryId");
      out.push(`${t("rpt.f.categoryId")}: ${fmt.lang === "fr" && c.nameFr ? c.nameFr : c.nameAr}`);
    }
    if (used("roomId")) {
      const r = await this.prisma.room.findFirst({ where: { id: f.roomId, schoolId } });
      if (!r) throw bad("roomId");
      out.push(`${t("rpt.f.roomId")}: ${r.code} — ${r.name}`);
    }
    if (used("warehouseId")) {
      const w = await this.prisma.warehouse.findFirst({ where: { id: f.warehouseId, schoolId } });
      if (!w) throw bad("warehouseId");
      out.push(`${t("rpt.f.warehouseId")}: ${w.name}`);
    }
    if (used("supplierId")) {
      const s = await this.prisma.supplier.findFirst({ where: { id: f.supplierId, schoolId } });
      if (!s) throw bad("supplierId");
      out.push(`${t("rpt.f.supplierId")}: ${s.name}`);
    }
    if (used("sessionId")) {
      const s = await this.prisma.inventorySession.findFirst({ where: { id: f.sessionId, schoolId } });
      if (!s) throw bad("sessionId");
    }
    if (used("q")) out.push(`${t("rpt.f.q")}: «${f.q}»`);
    if (used("includeArchived") && f.includeArchived) out.push(t("rpt.f.includeArchived"));
    return out;
  }

  private async build(schoolId: string, key: string, r: ReportRequest, req: AppRequest, now = new Date()) {
    const def = getDef(key, r.filters);
    this.need(req, def.perm);
    // المرشحات غير المعرفة لهذا التقرير تُهمل
    const f = Object.fromEntries(Object.entries(r.filters).filter(([k]) => (def.filters as readonly string[]).includes(k))) as ReportFilters;
    const fmt = formatter(r.lang);
    const described = await this.describeFilters(schoolId, f, def.filters, fmt, def.statuses?.prefix);
    const data = await def.run({ prisma: this.prisma, schoolId, f, fmt, now, inventory: this.inventory, resources: this.resources });
    const title = fmt.t(`rpt.title.${def.key}`);
    return { def, f, fmt, data, title, described };
  }

  private cell(fmt: Fmt, c: Pick<ColDef, "kind">, v: Raw): string {
    if (v === null || v === undefined || v === "") return "";
    switch (c.kind) {
      case "num":
        return fmt.num(Number(v));
      case "money":
        return fmt.money(Number(v));
      case "date":
        return fmt.date(String(v));
      case "datetime":
        return fmt.dateTime(String(v));
      default:
        return String(v);
    }
  }

  private reportBlocks(fmt: Fmt, data: ReportData): Block[] {
    const t = fmt.t;
    const blocks: Block[] = [];
    if (data.summary?.length) blocks.push({ kind: "stats", items: data.summary.map(([k, v]) => [t(k), v]) });
    if (data.sections) {
      for (const s of data.sections) {
        blocks.push({ kind: "heading", text: t(s.title) });
        blocks.push({ kind: "kv", rows: s.rows.map(([k, v, kind]) => [t(k), this.cell(fmt, { kind }, v)]), ltrValues: s.rows.map((_, i) => i) });
      }
      return blocks;
    }
    const cols = data.columns;
    const hasTotals = cols.some((c) => c.total) && data.rows.length > 0;
    blocks.push({
      kind: "table",
      testId: "report-table",
      columns: [
        { label: "#", align: "center", widthPct: 4 },
        ...cols.map((c) => ({
          label: t(c.label),
          align: c.kind === "num" || c.kind === "money" ? ("end" as const) : undefined,
          ltr: c.kind === "code" || c.kind === "num" || c.kind === "money",
          widthPct: c.width,
        })),
      ],
      rows: data.rows.map((r, i) => [String(i + 1), ...cols.map((c) => this.cell(fmt, c, r[c.key]))]),
      footer: hasTotals
        ? [
            "",
            ...cols.map((c, i) =>
              i === 0 && !c.total ? t("rpt.total") : c.total ? this.cell(fmt, c, data.rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0)) : "",
            ),
          ]
        : undefined,
      empty: t("rpt.empty"),
    });
    return blocks;
  }

  private metaLines(fmt: Fmt, described: string[], user: AuthUser, now: Date, data?: ReportData) {
    const t = fmt.t;
    return [
      ...(data?.subject ? [data.subject] : []),
      described.length ? `${t("rpt.filters")}: ${described.join(" · ")}` : t("rpt.noFilters"),
      t("rpt.generatedAt", { d: fmt.dateTime(now), u: user.fullNameAr }),
    ];
  }

  private async brandingFor(schoolId: string): Promise<BrandingLike> {
    return (await this.branding.get(schoolId)) as unknown as BrandingLike;
  }

  async preview(schoolId: string, key: string, r: ReportRequest, user: AuthUser, req: AppRequest) {
    const now = new Date();
    const { fmt, data, title, described } = await this.build(schoolId, key, r, req, now);
    const doc: DocSpec = { lang: r.lang, title, meta: this.metaLines(fmt, described, user, now, data), blocks: this.reportBlocks(fmt, data) };
    const html = documentHtml(doc, await this.brandingFor(schoolId), await this.school(schoolId), { preview: true });
    return { html, rowCount: data.sections ? data.sections.reduce((a, s) => a + s.rows.length, 0) : data.rows.length };
  }

  // ------------------------------------------------------------------
  // التوليد والأرشفة
  // ------------------------------------------------------------------

  /**
   * يحجز رقم الأرشيف، يولّد الملف بالرقم مطبوعاً عليه، ثم يخزنه مع بصمته — كل ذلك في معاملة واحدة:
   * إن فشل التوليد لا يُستهلك رقم ولا يبقى سجل ناقص.
   */
  private async archive(
    schoolId: string,
    p: { reportKey: string; title: string; lang: Lang; format: "PDF" | "XLSX"; filters?: object; subjectId?: string; rowCount: number; letterheadVersion?: number },
    render: (number: string) => Promise<{ buf: Buffer; pages?: number }>,
    user: AuthUser,
    req: AppRequest,
  ): Promise<GeneratedFile> {
    return this.prisma.$transaction(
      async (tx) => {
        const year = new Date().getFullYear();
        const number = formatNumber("RPT-{YEAR}-{SEQ:5}", { year, seq: await nextSequence(tx, schoolId, "REPORT", year) });
        const { buf, pages } = await render(number);
        const mime = p.format === "PDF" ? "application/pdf" : XLSX_MIME;
        const filename = `${number}.${p.format === "PDF" ? "pdf" : "xlsx"}`;
        const file = await this.storage.save(tx, { schoolId, buf, mime, originalName: filename, uploadedById: user.id });
        const g = await tx.generatedReport.create({
          data: {
            schoolId,
            number,
            reportKey: p.reportKey,
            title: p.title.slice(0, 300),
            lang: p.lang,
            format: p.format,
            filters: (p.filters ?? undefined) as Prisma.InputJsonValue | undefined,
            subjectId: p.subjectId ?? null,
            rowCount: p.rowCount,
            pageCount: pages ?? null,
            fileId: file.id,
            letterheadVersion: p.letterheadVersion ?? null,
            createdById: user.id,
          },
        });
        await this.audit.log(
          { action: "REPORT_GENERATE", entityType: "GeneratedReport", entityId: g.id, schoolId, after: { number, reportKey: p.reportKey, format: p.format, sha256: file.sha256, rowCount: p.rowCount, pageCount: pages } },
          req,
          tx,
        );
        return { id: g.id, number, buf, mime, filename, pages };
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
  }

  private async renderPdf(doc: DocSpec, schoolId: string) {
    const b = await this.brandingFor(schoolId);
    const html = documentHtml(doc, b, await this.school(schoolId));
    const { pdf, pages } = await this.pdf.render(html, { margins: pageMargins(b), footerTemplate: footerTemplate(b, doc.lang, formatter(doc.lang).t("print.pageOf")) });
    return { buf: pdf, pages, version: b.letterhead.version };
  }

  async reportPdf(schoolId: string, key: string, r: ReportRequest, user: AuthUser, req: AppRequest) {
    const now = new Date();
    const { def, f, fmt, data, title, described } = await this.build(schoolId, key, r, req, now);
    const b = await this.brandingFor(schoolId);
    const rowCount = data.sections ? data.sections.reduce((a, s) => a + s.rows.length, 0) : data.rows.length;
    return this.archive(
      schoolId,
      { reportKey: def.key, title, lang: r.lang, format: "PDF", filters: f, rowCount, letterheadVersion: b.letterhead.version },
      async (number) => {
        const doc: DocSpec = {
          lang: r.lang,
          title,
          number: { label: fmt.t("rpt.archiveNumber"), value: number },
          meta: this.metaLines(fmt, described, user, now, data),
          blocks: this.reportBlocks(fmt, data),
        };
        return this.renderPdf(doc, schoolId);
      },
      user,
      req,
    );
  }

  async reportXlsx(schoolId: string, key: string, r: ReportRequest, user: AuthUser, req: AppRequest) {
    const now = new Date();
    const { def, f, fmt, data, title, described } = await this.build(schoolId, key, r, req, now);
    const b = await this.brandingFor(schoolId);
    const lh = b.letterhead;
    const headerLines = (r.lang === "fr" && lh.linesFr.some(Boolean) ? lh.linesFr : lh.linesAr).filter(Boolean);
    const rowCount = data.sections ? data.sections.reduce((a, s) => a + s.rows.length, 0) : data.rows.length;
    return this.archive(
      schoolId,
      { reportKey: def.key, title, lang: r.lang, format: "XLSX", filters: f, rowCount, letterheadVersion: lh.version },
      async (number) => ({ buf: await buildXlsx({ fmt, title, headerLines, meta: this.metaLines(fmt, described, user, now, data), data, number }) }),
      user,
      req,
    );
  }

  // ------------------------------------------------------------------
  // الوثائق الفردية: وصل الإعارة، محضر الجرد، محضر العهدة
  // ------------------------------------------------------------------

  private async conditionLabel(schoolId: string, lang: Lang, code?: string | null) {
    if (!code) return "";
    const v = await this.prisma.lookupValue.findFirst({ where: { listKey: "CONDITION", code, OR: [{ schoolId }, { schoolId: null }] }, orderBy: { schoolId: "asc" } });
    return v ? (lang === "fr" && v.labelFr ? v.labelFr : v.labelAr) : code;
  }

  private async docPdf(schoolId: string, key: DocKey, subjectId: string, lang: Lang, user: AuthUser, req: AppRequest, build: (fmt: Fmt) => Promise<{ doc: Omit<DocSpec, "lang" | "meta">; rowCount: number }>) {
    this.need(req, DOC_KEYS[key]);
    const fmt = formatter(lang);
    const now = new Date();
    const { doc, rowCount } = await build(fmt);
    const b = await this.brandingFor(schoolId);
    return this.archive(
      schoolId,
      { reportKey: key, title: `${doc.title}${doc.number ? ` — ${doc.number.value}` : ""}`, lang, format: "PDF", subjectId, rowCount, letterheadVersion: b.letterhead.version },
      (number) => this.renderPdf({ ...doc, lang, meta: [`${fmt.t("rpt.archiveNumber")}: ${number}`, fmt.t("rpt.generatedAt", { d: fmt.dateTime(now), u: user.fullNameAr })] }, schoolId),
      user,
      req,
    );
  }

  async loanReceiptPdf(schoolId: string, id: string, lang: Lang, user: AuthUser, req: AppRequest) {
    return this.docPdf(schoolId, "DOC_LOAN_RECEIPT", id, lang, user, req, async (fmt) => {
      const t = fmt.t;
      const l = await this.loans.get(schoolId, id);
      const hasReturns = l.returns.length > 0;
      const kv: [string, string][] = [[t("loans.resource"), `${l.resource.code} — ${l.resource.name}`]];
      if (l.unit) kv.push([t("loans.unit"), l.unit]);
      kv.push([t("assets.quantity"), fmt.num(l.quantity)]);
      kv.push([t("loans.borrower"), l.borrowerFr ? `${l.borrower} — ${l.borrowerFr}` : l.borrower]);
      kv.push([t("loans.loanedAt"), fmt.dateTime(l.loanedAt)]);
      kv.push([t("loans.dueAt"), fmt.date(l.dueAt.slice(0, 10))]);
      if (l.conditionOut) kv.push([t("loans.conditionOut"), await this.conditionLabel(schoolId, lang, l.conditionOut)]);
      if (l.handedOverBy) kv.push([t("receipt.handedOverBy"), l.handedOverBy]);
      if (l.notes) kv.push([t("stock.notes"), l.notes]);
      kv.push([t("assets.status"), `${t(`loanStatus.${l.status}`)}${l.lateDays > 0 ? ` — ${t("loans.lateDays", { n: l.lateDays })}` : ""}`]);
      const blocks: Block[] = [{ kind: "kv", rows: kv }];
      if (hasReturns) {
        blocks.push({ kind: "heading", text: t("receipt.returns") });
        const rows: string[][] = [];
        for (const r of l.returns)
          rows.push([fmt.dateTime(r.returnedAt), `${fmt.num(r.quantity)}${r.damaged ? ` (${t("receipt.damaged")})` : ""}`, (await this.conditionLabel(schoolId, lang, r.conditionIn)) || "—", r.receivedBy ?? "—"]);
        blocks.push({ kind: "table", columns: [{ label: t("receipt.returnedAt") }, { label: t("assets.quantity") }, { label: t("loans.conditionIn") }, { label: t("receipt.receivedBy") }], rows });
        if (l.outstanding > 0) blocks.push({ kind: "para", text: t("loans.outstandingN", { n: l.outstanding }), bold: true });
      }
      blocks.push({ kind: "para", text: t(hasReturns ? "receipt.pledgeReturn" : "receipt.pledgeLoan") });
      blocks.push({ kind: "signatures", labels: ["receipt.signBorrower", "receipt.signOfficer", "receipt.signDirector"].map((k) => t(k)) });
      return { doc: { title: hasReturns ? t("receipt.titleReturn") : t("receipt.titleLoan"), number: { label: t("receipt.number"), value: l.number }, blocks }, rowCount: 1 + l.returns.length };
    });
  }

  async custodyReportPdf(schoolId: string, id: string, lang: Lang, user: AuthUser, req: AppRequest) {
    return this.docPdf(schoolId, "DOC_CUSTODY", id, lang, user, req, async (fmt) => {
      const t = fmt.t;
      const r = await this.custody.get(schoolId, id);
      const kv: [string, string][] = [
        [t("custody.action"), t(`custodyAction.${r.action}`)],
        [t("custody.date"), fmt.date(r.occurredAt.slice(0, 10))],
        [t("custody.asset"), r.asset.name],
        [t("assets.inventoryNumber"), r.asset.inventoryNumber],
        [t("assets.quantity"), fmt.num(r.asset.quantity)],
      ];
      if (r.action !== "RELOCATION") {
        kv.push([t("custody.fromStaff"), r.fromStaff ?? "—"]);
        kv.push([t("custody.toStaff"), r.toStaff ? `${r.toStaff}${r.toStaffNumber ? ` (${r.toStaffNumber})` : ""}` : "—"]);
      }
      if (r.toRoom || r.action === "RELOCATION") {
        kv.push([t("custody.fromRoom"), r.fromRoom ?? "—"]);
        kv.push([t("custody.toRoom"), r.toRoom ?? "—"]);
      }
      if (r.notes) kv.push([t("stock.notes"), r.notes]);
      if (r.by) kv.push([t("custody.recordedBy"), r.by]);
      const signs =
        r.action === "RELOCATION"
          ? ["custodyReport.signOfficer", "receipt.signDirector"]
          : r.action === "RETURN"
            ? ["custodyReport.signFrom", "custodyReport.signOfficer", "receipt.signDirector"]
            : ["custodyReport.signFrom", "custodyReport.signTo", "receipt.signDirector"];
      return {
        doc: {
          title: t(`custodyReport.${r.action}`),
          number: { label: t("doc.number"), value: r.number },
          blocks: [{ kind: "kv", rows: kv, ltrValues: [3] }, { kind: "para", text: t(`custodyPledge.${r.action}`) }, { kind: "signatures", labels: signs.map((k) => t(k)) }],
        },
        rowCount: 1,
      };
    });
  }

  async inventoryReportPdf(schoolId: string, id: string, lang: Lang, user: AuthUser, req: AppRequest) {
    return this.docPdf(schoolId, "DOC_INVENTORY", id, lang, user, req, async (fmt) => {
      const t = fmt.t;
      const x = await this.inventory.get(schoolId, id);
      const d = await this.inventory.discrepancies(schoolId, id);
      const kinds = ["missing", "misplaced", "surplus", "unexpected", "notCounted", "condition"] as const;
      const sep = lang === "ar" ? "، " : ", ";
      const kv: [string, string][] = [
        [t("inv.period"), `${fmt.date(x.startDate)} — ${fmt.date(x.endDate)}`],
        [t("inv.scope"), x.rooms.length ? x.rooms.map((r) => r.label).join(sep) : t("inv.wholeSchool")],
        [t("inv.includesStock"), x.includesStock ? t("common.yes") : t("common.no")],
        [t("inv.assignees"), x.assignees.map((a) => a.name).join(sep) || "—"],
        [t("assets.status"), t(`invStatus.${x.status}`)],
        [t("inv.countedLines"), t("inv.countedOf", { c: d.totals.counted, n: d.totals.lines })],
        ...kinds.map((k): [string, string] => [t(`invDisc.${k}`), fmt.num(d[k].length)]),
      ];
      if (x.validatedBy) kv.push([t("invReport.validatedBy"), `${x.validatedBy}${x.validatedAt ? ` — ${fmt.dateTime(x.validatedAt)}` : ""}`]);
      const final = ["VALIDATED", "CLOSED", "ARCHIVED"].includes(x.status);
      const blocks: Block[] = [];
      if (!final) blocks.push({ kind: "para", text: t("invReport.draftWarning"), bold: true });
      blocks.push({ kind: "kv", rows: kv }, { kind: "heading", text: t("inv.reportNotes") }, { kind: "notes", text: x.reportNotes ?? "" });
      blocks.push({ kind: "signatures", labels: ["invReport.signCommittee", "invReport.signOfficer", "receipt.signDirector"].map((k) => t(k)) });
      const detail = kinds.flatMap((k) => d[k].map((l) => ({ k, l })));
      if (detail.length) {
        blocks.push({ kind: "pageBreak" }, { kind: "heading", text: t("invReport.detailTitle") });
        blocks.push({
          kind: "table",
          columns: [{ label: t("inv.issues") }, { label: t("inv.ref"), ltr: true }, { label: t("inv.item") }, { label: t("inv.expected"), align: "end", ltr: true }, { label: t("inv.counted"), align: "end", ltr: true }, { label: t("inv.foundRoom") }],
          rows: detail.map(({ k, l }) => [
            t(`invDisc.${k}`),
            l.ref,
            l.name,
            fmt.num(l.expectedQty),
            l.countedQty === undefined ? "—" : fmt.num(l.countedQty),
            k === "condition" ? (l.conditionFound ?? "") : (l.foundRoom ?? l.expectedRoom ?? "—"),
          ]),
        });
      }
      return { doc: { title: t("invReport.title", { type: t(`invType.${x.type}`) }), number: { label: t("doc.number"), value: x.number }, blocks }, rowCount: detail.length };
    });
  }

  // ------------------------------------------------------------------
  // الأرشيف (قراءة فقط)
  // ------------------------------------------------------------------

  private allowedKeys(perms: Set<string>): string[] {
    return [...REPORTS.filter((r) => perms.has(r.perm)).map((r) => r.key), ...Object.entries(DOC_KEYS).filter(([, p]) => perms.has(p)).map(([k]) => k)];
  }

  async archiveList(schoolId: string, perms: Set<string>, f: { key?: string; q?: string; page: number; pageSize: number }) {
    const keys = this.allowedKeys(perms);
    const where: Prisma.GeneratedReportWhereInput = {
      schoolId,
      reportKey: f.key && keys.includes(f.key) ? f.key : { in: keys },
      ...(f.q ? { OR: [{ number: { contains: f.q, mode: "insensitive" } }, { title: { contains: f.q, mode: "insensitive" } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.generatedReport.findMany({ where, include: { file: { select: { sizeBytes: true, sha256: true } } }, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.prisma.generatedReport.count({ where }),
    ]);
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, fullNameAr: true } })).map((u) => [u.id, u.fullNameAr]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        number: r.number,
        reportKey: r.reportKey,
        title: r.title,
        format: r.format,
        lang: r.lang,
        rowCount: r.rowCount,
        pageCount: r.pageCount ?? undefined,
        sizeBytes: r.file.sizeBytes,
        sha256: r.file.sha256,
        createdAt: r.createdAt.toISOString(),
        createdBy: users.get(r.createdById) ?? "",
      })),
      total,
      page: f.page,
      pageSize: f.pageSize,
    };
  }

  /** تنزيل نسخة مؤرشفة كما صدرت؛ يُتحقق من البصمة قبل الإرسال. */
  async archiveFile(schoolId: string, id: string, perms: Set<string>) {
    const g = await this.prisma.generatedReport.findFirst({ where: { id, schoolId }, include: { file: true } });
    if (!g || !this.allowedKeys(perms).includes(g.reportKey)) throw E.notFound();
    const buf = await this.storage.read(g.file.storageKey).catch(() => {
      throw E.rule("FILE_MISSING");
    });
    if (this.storage.sha(buf) !== g.file.sha256) throw E.conflict("FILE_INTEGRITY");
    return { buf, mime: g.file.mimeType, filename: g.file.originalName, number: g.number, id: g.id, pages: g.pageCount ?? undefined };
  }
}
