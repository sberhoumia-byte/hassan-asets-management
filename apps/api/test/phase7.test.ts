import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type request from "supertest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { PNG } from "pngjs";
import { auth, bootApp, userWithRole } from "./helpers";
import type { PrismaService } from "../src/prisma/prisma.service";
import { PdfService } from "../src/reports/pdf.service";
import { documentHtml, footerTemplate, pageMargins, type BrandingLike, type DocSpec } from "../src/reports/html";
import { formatter } from "../src/reports/i18n";

/**
 * المرحلة 7: التقارير — PDF عربي من الخادم (استخراج النص، الخطوط المضمنة، المقارنة البصرية،
 * الترويسة في كل الصفحات أو الأولى فقط)، Excel، الأرشيف (إلحاق فقط + بصمة)، الصلاحيات، الوثائق الفردية، الرسوم.
 * يتطلب poppler-utils (pdftotext، pdftoppm، pdffonts).
 */
let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let admin = "";
let sid = "";
const s = { cat: "", room: "", teacher: "", unit: "", resource: "", resUnit: "", loan: "", asset: "", custody: "", session: "", viewer: "", stock: "" };
const base = () => `/api/v1/schools/${sid}`;
const year = new Date().getFullYear();
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const get = (path: string, token = admin) => http.get(`${base()}${path}`).set(auth(token));
const post = (path: string, body: object = {}, token = admin) => http.post(`${base()}${path}`).set(auth(token)).send(body);
/** طلب يعيد ملفاً ثنائياً كـ Buffer. */
const binary = (path: string, body: object = {}, token = admin) =>
  http
    .post(`${base()}${path}`)
    .set(auth(token))
    .send(body)
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });

const tmp = mkdtempSync(join(tmpdir(), "hassan-pdf-"));
let fileNo = 0;
function save(buf: Buffer, ext = "pdf") {
  const p = join(tmp, `f${++fileNo}.${ext}`);
  writeFileSync(p, buf);
  return p;
}
/** النص المستخرج بعد حذف المسافات وعلامات الاتجاه (pdftotext يفصل أحياناً الحروف العربية بمسافات). */
const norm = (x: string) => x.replace(/[\s‎‏‪-‮⁦-⁩]/g, "");
const pageText = (pdf: string, page: number) => execFileSync("pdftotext", ["-f", String(page), "-l", String(page), "-enc", "UTF-8", pdf, "-"]).toString("utf8");
const pageCount = (pdf: string) => Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [pdf]).toString())![1]);

beforeAll(async () => {
  ({ app, http, prisma, admin, schoolId: sid } = await bootApp());
  const types = (await get("/lookups?listKey=SPACE_TYPE")).body as { id: string; code: string }[];
  s.room = (await post("/rooms", { code: "R1", name: "القسم الأول", spaceTypeId: types.find((t) => t.code === "CLASSROOM")!.id, status: "GOOD" })).body.id;
  s.cat = (await post("/categories", { code: "IT", nameAr: "معدات معلوماتية", nameFr: "Matériel informatique" })).body.id;
  s.teacher = (await post("/staff", { fullNameAr: "أستاذة الاختبار", fullNameFr: "Enseignante test", type: "TEACHER" })).body.id;
  // 120 ممتلكاً اختبارياً (بيانات اختبار معزولة في مخطط مؤقت) لتقرير متعدد الصفحات
  await prisma.asset.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({
      schoolId: sid,
      inventoryNumber: `T-${String(i + 1).padStart(4, "0")}`,
      name: `حاسوب محمول للاختبار رقم ${i + 1}`,
      categoryId: s.cat,
      roomId: s.room,
      acquisitionDate: new Date(`${today()}T00:00:00Z`),
      acquisitionValue: 1000 + i,
      status: i % 10 === 0 ? ("DAMAGED" as const) : ("AVAILABLE" as const),
    })),
  });
  s.asset = (await prisma.asset.findFirstOrThrow({ where: { schoolId: sid, inventoryNumber: "T-0001" } })).id;
  s.viewer = (await userWithRole(http, admin, sid, "viewer7", ["VIEWER"])).token;
  s.stock = (await userWithRole(http, admin, sid, "stock7", ["STOCK_MANAGER"])).token;
});
afterAll(async () => {
  await app?.close();
});

// =====================================================================
describe("الكتالوج والصلاحيات", () => {
  it("الكتالوج يعرض فقط التقارير التي يملك المستخدم صلاحية وحدتها", async () => {
    const all = (await get("/reports")).body as { key: string; canPrint: boolean; canExport: boolean }[];
    expect(all.map((r) => r.key)).toContain("ASSETS");
    expect(all.find((r) => r.key === "ASSETS")).toMatchObject({ canPrint: true, canExport: true });
    const stock = (await get("/reports", s.stock)).body as { key: string }[];
    expect(stock.map((r) => r.key)).toEqual(expect.arrayContaining(["STOCK", "STOCK_MOVEMENTS", "STOCK_LOW"]));
    expect(stock.map((r) => r.key)).not.toContain("ASSETS");
  });

  it("تقرير وحدة بلا صلاحية ← 403، والاطلاع فقط لا يسمح بـ PDF ولا Excel", async () => {
    expect((await post("/reports/ASSETS/preview", {}, s.stock)).status).toBe(403);
    expect((await post("/reports/ASSETS/preview", {}, s.viewer)).status).toBe(200);
    expect((await post("/reports/ASSETS/pdf", {}, s.viewer)).status).toBe(403);
    expect((await post("/reports/ASSETS/xlsx", {}, s.viewer)).status).toBe(403);
    expect((await post("/reports/NOPE/preview")).status).toBe(404);
  });

  it("المرشحات تُتحقق: حالة غير معروفة، فترة معكوسة، معرف لا ينتمي للمؤسسة", async () => {
    expect((await post("/reports/ASSETS/preview", { filters: { status: "BROKEN" } })).body.error.details.fields.status).toBe("errors.invalidChoice");
    expect((await post("/reports/ASSETS/preview", { filters: { from: "2026-05-01", to: "2026-01-01" } })).body.error.details.fields["filters.to"]).toBe("errors.endBeforeStart");
    const r = await post("/reports/ASSETS/preview", { filters: { roomId: "00000000-0000-4000-8000-000000000000" } });
    expect(r.body.error.details.fields.roomId).toBe("errors.invalidChoice");
    expect((await post("/reports/DISCREPANCIES/preview")).body.error.details.fields.sessionId).toBe("errors.required");
  });
});

// =====================================================================
describe("المعاينة", () => {
  it("HTML بالترويسة المركزية والمرشحات والمجاميع، والمرشح يُطبق فعلاً", async () => {
    const r = await post("/reports/ASSETS/preview", { filters: { status: "DAMAGED" } });
    expect(r.status).toBe(200);
    expect(r.body.rowCount).toBe(12);
    const html = r.body.html as string;
    expect(html).toContain("المملكة المغربية");
    expect(html).toContain("سجل الممتلكات");
    expect(html).toContain("الحالة: معطل");
    expect(html).toContain("T-0001");
    expect(html).not.toContain("T-0002");
    // سياسة أمان: لا سكربتات ولا موارد خارجية في الوثيقة
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script/i);
  });

  it("النصوص المدخلة تُهرَّب (لا حقن HTML في الوثيقة)", async () => {
    await prisma.asset.update({ where: { id: s.asset }, data: { name: "<img src=x onerror=alert(1)>" } });
    const html = (await post("/reports/ASSETS/preview", { filters: { q: "T-0001" } })).body.html as string;
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x");
    await prisma.asset.update({ where: { id: s.asset }, data: { name: "حاسوب محمول للاختبار رقم 1" } });
  });

  it("الفرنسية: الاتجاه من اليسار والتسميات بالفرنسية", async () => {
    const html = (await post("/reports/ASSETS/preview", { lang: "fr" })).body.html as string;
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("Registre des biens");
    expect(html).toContain("N° d&#39;inventaire");
  });
});

// =====================================================================
describe("PDF عربي من الخادم", () => {
  let pdfPath = "";
  let number = "";

  it("يولّد PDF متعدد الصفحات، يرقّمه ويؤرشفه ببصمته", async () => {
    const r = await binary("/reports/ASSETS/pdf", {});
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("application/pdf");
    number = r.headers["x-report-number"] as string;
    expect(number).toBe(`RPT-${year}-00001`);
    const buf = r.body as Buffer;
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    pdfPath = save(buf);
    const pages = pageCount(pdfPath);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(Number(r.headers["x-report-pages"])).toBe(pages);
    const g = await prisma.generatedReport.findFirstOrThrow({ where: { schoolId: sid, number }, include: { file: true } });
    expect(g).toMatchObject({ reportKey: "ASSETS", format: "PDF", lang: "ar", rowCount: 120, pageCount: pages });
    expect(g.file.sha256).toBe(createHash("sha256").update(buf).digest("hex"));
  });

  it("النص العربي قابل للاستخراج: العنوان والترويسة وأسماء الممتلكات ورقم الأرشيف", () => {
    const p1 = norm(pageText(pdfPath, 1));
    expect(p1).toContain(norm("سجل الممتلكات"));
    expect(p1).toContain(norm("المملكة المغربية"));
    expect(p1).toContain(norm("وزارة التربية الوطنية والتعليم الأولي والرياضة"));
    expect(p1).toContain(norm("حاسوب محمول للاختبار رقم"));
    expect(p1).toContain(number);
    expect(p1).toContain("T-0001");
    const all = norm(execFileSync("pdftotext", ["-enc", "UTF-8", pdfPath, "-"]).toString("utf8"));
    expect(all).toContain("T-0120");
    // المجموع: 120 ممتلكاً بقيم 1000..1119 = 127140
    expect(all).toContain(norm("127.140,00"));
  });

  it("الترويسة تتكرر في كل الصفحات (الإعداد الافتراضي ALL_PAGES)", () => {
    const n = pageCount(pdfPath);
    for (let i = 1; i <= n; i++) {
      const t = norm(pageText(pdfPath, i));
      expect(t, `page ${i}`).toContain(norm("المملكة المغربية"));
      expect(t, `page ${i}`).toContain("Royaume du Maroc".replace(/\s/g, ""));
      // رأس الجدول يتكرر أيضاً
      expect(t, `page ${i}`).toContain(norm("رقم الجرد"));
    }
  });

  it("الخطوط مضمنة في الملف (لا اعتماد على خطوط النظام)", () => {
    const fonts = execFileSync("pdffonts", [pdfPath]).toString();
    expect(fonts).toMatch(/NotoSansArabic/);
    const rows = fonts.split("\n").slice(2).filter(Boolean);
    expect(rows.length).toBeGreaterThan(0);
    // العمود "emb" = yes لكل خط
    for (const r of rows) expect(r, r).toMatch(/\s+yes\s+yes\s+(yes|no)\s+\d+\s+\d+\s*$/);
  });

  it("الترويسة في الصفحة الأولى فقط عند اختيار FIRST_PAGE", async () => {
    const cur = (await get("/branding")).body;
    const put = await http
      .put(`${base()}/branding`)
      .set(auth(admin))
      .send({ logoWidthMm: cur.logoWidthMm, logoAlign: cur.logoAlign, letterhead: { ...cur.letterhead, version: undefined, placement: "FIRST_PAGE" } });
    expect(put.status).toBe(200);
    const r = await binary("/reports/ASSETS/pdf", {});
    const p = save(r.body as Buffer);
    const n = pageCount(p);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(norm(pageText(p, 1))).toContain(norm("المملكة المغربية"));
    for (let i = 2; i <= n; i++) expect(norm(pageText(p, i)), `page ${i}`).not.toContain(norm("المملكة المغربية"));
    // رقم إصدار الترويسة المستعملة يُحفظ مع الأرشيف
    const g = await prisma.generatedReport.findFirstOrThrow({ where: { schoolId: sid, number: r.headers["x-report-number"] as string } });
    expect(g.letterheadVersion).toBe(put.body.letterhead.version);
    await http.post(`${base()}/branding/reset`).set(auth(admin));
  });

  it("الفرنسية: نص لاتيني قابل للاستخراج", async () => {
    const r = await binary("/reports/ASSETS/pdf", { lang: "fr", filters: { status: "DAMAGED" } });
    const t = pageText(save(r.body as Buffer), 1);
    expect(t).toContain("Registre des biens");
    expect(t).toContain("Royaume du Maroc");
    expect(t).toContain("En panne");
  });

  it("التقرير السنوي (أقسام ومؤشرات) يُولَّد PDF", async () => {
    const r = await binary("/reports/ANNUAL/pdf", { filters: { year } });
    expect(r.status).toBe(200);
    const t = norm(pageText(save(r.body as Buffer), 1));
    expect(t).toContain(norm("التقرير السنوي للتدبير المادي"));
    expect(t).toContain(norm("ممتلكات مقتناة خلال السنة"));
    expect(t).toContain("120");
  });
});

// =====================================================================
describe("المقارنة البصرية لـ PDF عربي", () => {
  /** وثيقة ثابتة (بيانات وتاريخ ثابتان) تُقارن صفحتها الأولى بصورة مرجعية محفوظة في المستودع. */
  const branding: BrandingLike = {
    logoWidthMm: 22,
    logoAlign: "center",
    letterhead: {
      mode: "GENERATED",
      linesAr: ["المملكة المغربية", "وزارة التربية الوطنية والتعليم الأولي والرياضة", "مؤسسة اختبار"],
      linesFr: ["Royaume du Maroc", "Ministère de l'Éducation Nationale", "Établissement test"],
      showFrenchBlock: true,
      imageAlign: "center",
      showLogo: false,
      showContact: false,
      imageWidthMm: 180,
      imageHeightMm: 35,
      heightMm: 30,
      placement: "ALL_PAGES",
      marginsMm: { top: 12, right: 15, bottom: 12, left: 15 },
      footerText: "التدبير المادي الذكي",
      showFooter: true,
      showPageNumbers: true,
      version: 1,
    },
  };
  const doc: DocSpec = {
    lang: "ar",
    title: "نموذج مرجعي: جرد الممتلكات",
    number: { label: "رقم الأرشيف", value: "RPT-2026-00000" },
    meta: ["حُرر بتاريخ 01/01/2026"],
    blocks: [
      { kind: "stats", items: [["عدد السجلات", "40"], ["مجموع القيمة", "41.780,00"]] },
      {
        kind: "table",
        columns: [{ label: "#" }, { label: "رقم الجرد", ltr: true }, { label: "التسمية" }, { label: "الحالة" }, { label: "القيمة", align: "end", ltr: true }],
        rows: Array.from({ length: 40 }, (_, i) => [String(i + 1), `T-${String(i + 1).padStart(4, "0")}`, `سبورة تفاعلية ${i + 1}`, i % 3 ? "متاح" : "معطوب", `${1000 + i},00`]),
      },
      { kind: "signatures", labels: ["توقيع المسؤول", "توقيع المدير"] },
    ],
  };
  const baselineDir = join(__dirname, "fixtures", "pdf-baseline");
  const baseline = join(baselineDir, "arabic-report-p1.png");

  it("الصفحة الأولى تطابق الصورة المرجعية (فرق البكسلات < 1%)", async () => {
    const svc = new PdfService();
    try {
      const html = documentHtml(doc, branding);
      const { pdf, pages } = await svc.render(html, { margins: pageMargins(branding), footerTemplate: footerTemplate(branding, "ar", formatter("ar").t("print.pageOf")) });
      expect(pages).toBe(2);
      const p = save(pdf);
      const out = join(tmp, "visual");
      execFileSync("pdftoppm", ["-r", "60", "-f", "1", "-l", "1", "-png", "-singlefile", p, out]);
      const actual = readFileSync(`${out}.png`);
      if (!existsSync(baseline) || process.env.UPDATE_PDF_BASELINE === "1") {
        mkdirSync(baselineDir, { recursive: true });
        writeFileSync(baseline, actual);
        console.warn(`[visual] baseline written: ${baseline}`);
      }
      const a = PNG.sync.read(actual);
      const b = PNG.sync.read(readFileSync(baseline));
      expect([a.width, a.height]).toEqual([b.width, b.height]);
      let diff = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const d = Math.max(Math.abs(a.data[i]! - b.data[i]!), Math.abs(a.data[i + 1]! - b.data[i + 1]!), Math.abs(a.data[i + 2]! - b.data[i + 2]!));
        if (d > 48) diff++;
      }
      const ratio = diff / (a.width * a.height);
      expect(ratio).toBeLessThan(0.01);
      // الصفحة ليست فارغة: نسبة معقولة من البكسلات الداكنة (نص وجداول مرسومة فعلاً)
      let dark = 0;
      for (let i = 0; i < a.data.length; i += 4) if (a.data[i]! < 128) dark++;
      expect(dark / (a.width * a.height)).toBeGreaterThan(0.01);
      // تذييل وترقيم الصفحة الثانية في الهامش: الصفحة الأولى والثانية تحملان الترويسة
      expect(norm(pageText(p, 2))).toContain(norm("مؤسسة اختبار"));
    } finally {
      await svc.onModuleDestroy();
    }
  });
});

// =====================================================================
describe("Excel", () => {
  it("مصنف من اليمين إلى اليسار بقيم رقمية وتواريخ حقيقية ومجموع بصيغة", async () => {
    const r = await binary("/reports/ASSETS/xlsx", { filters: { status: "DAMAGED" } });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("spreadsheetml");
    const number = r.headers["x-report-number"] as string;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body as never);
    const ws = wb.worksheets[0]!;
    expect(ws.views[0]?.rightToLeft).toBe(true);
    const cells: string[] = [];
    ws.eachRow((row) => cells.push(row.values ? JSON.stringify(row.values) : ""));
    const flat = cells.join("\n");
    expect(flat).toContain("المملكة المغربية");
    expect(flat).toContain("سجل الممتلكات");
    expect(flat).toContain(number);
    // سطر العناوين ثم 12 سطراً ثم المجموع
    let header = 0;
    ws.eachRow((row, i) => {
      if (row.getCell(1).value === "رقم الجرد") header = i;
    });
    expect(header).toBeGreaterThan(0);
    const first = ws.getRow(header + 1);
    expect(first.getCell(1).value).toBe("T-0001");
    expect(typeof first.getCell(8).value).toBe("number");
    expect(first.getCell(7).value).toBeInstanceOf(Date);
    const total = ws.getRow(header + 13);
    expect(total.getCell(1).value).toBe("المجموع");
    expect((total.getCell(8).value as { formula: string }).formula).toMatch(/^SUM\(H\d+:H\d+\)$/);
    expect(ws.autoFilter).toBeTruthy();
    const g = await prisma.generatedReport.findFirstOrThrow({ where: { schoolId: sid, number } });
    expect(g).toMatchObject({ format: "XLSX", rowCount: 12 });
  });
});

// =====================================================================
describe("الوثائق الفردية من الخادم", () => {
  it("وصل الإعارة PDF يحمل رقم الإعارة والمستعير ويؤرشف بمرجع الإعارة", async () => {
    const res = await post("/resources", { code: "PROJ", name: "جهاز عرض", trackingMode: "INDIVIDUAL", quantityTotal: 0, isLendable: true });
    s.resource = res.body.id;
    s.resUnit = (await post(`/resources/${s.resource}/units`, { status: "AVAILABLE" })).body.id;
    const l = await post("/loans", { resourceId: s.resource, unitId: s.resUnit, quantity: 1, borrowerStaffId: s.teacher, dueAt: inDays(3) });
    expect(l.status).toBe(201);
    s.loan = l.body.id;
    const r = await binary(`/loans/${s.loan}/receipt.pdf`, {});
    expect(r.status).toBe(200);
    const t = norm(pageText(save(r.body as Buffer), 1));
    expect(t).toContain(norm("وصل إعارة وسيلة تعليمية"));
    expect(t).toContain(l.body.number);
    expect(t).toContain(norm("أستاذة الاختبار"));
    expect(t).toContain(norm("توقيع المستعير"));
    const g = await prisma.generatedReport.findFirstOrThrow({ where: { schoolId: sid, number: r.headers["x-report-number"] as string } });
    expect(g).toMatchObject({ reportKey: "DOC_LOAN_RECEIPT", subjectId: s.loan });
    // وثيقة مؤسسة أخرى أو معرف غير موجود
    expect((await binary("/loans/00000000-0000-4000-8000-000000000000/receipt.pdf", {})).status).toBe(404);
  });

  it("محضر العهدة PDF", async () => {
    const c = await post("/custody", { action: "ASSIGNMENT", assetId: s.asset, toStaffId: s.teacher });
    expect(c.status).toBe(201);
    const r = await binary(`/custody/${c.body.id}/report.pdf`, {});
    expect(r.status).toBe(200);
    const t = norm(pageText(save(r.body as Buffer), 1));
    expect(t).toContain(norm("محضر إسناد"));
    expect(t).toContain("T-0001");
  });

  it("محضر الجرد PDF مع تفاصيل الفروقات في صفحة مستقلة", async () => {
    const sess = await post("/inventory-sessions", { type: "ANNUAL", startDate: today(), endDate: inDays(5), includesStock: false, roomIds: [s.room], assigneeIds: [] });
    expect(sess.status).toBe(201);
    s.session = sess.body.id;
    await post(`/inventory-sessions/${s.session}/open`);
    await post(`/inventory-sessions/${s.session}/complete`);
    const r = await binary(`/inventory-sessions/${s.session}/report.pdf`, {});
    expect(r.status).toBe(200);
    const p = save(r.body as Buffer);
    expect(norm(pageText(p, 1))).toContain(norm("محضر جرد سنوي"));
    expect(pageCount(p)).toBeGreaterThanOrEqual(2);
    expect(norm(pageText(p, 2))).toContain(norm("تفاصيل الفروقات"));
    // تقرير الفروقات العام لنفس الدورة
    const d = await post("/reports/DISCREPANCIES/preview", { filters: { sessionId: s.session } });
    expect(d.status).toBe(200);
    expect(d.body.rowCount).toBe(120); // نطاق الدورة حجرة واحدة: 120 ممتلكاً لم يُعدّ أي منها
  });

  it("مستخدم بلا صلاحية الوحدة لا يولّد وثيقتها", async () => {
    expect((await binary(`/loans/${s.loan}/receipt.pdf`, {}, s.stock)).status).toBe(403);
  });
});

// =====================================================================
describe("الأرشيف", () => {
  it("قائمة مرتبة تنازلياً مع البصمة والحجم ومن ولّدها، مصفاة حسب صلاحيات المستخدم", async () => {
    const l = (await get("/report-archive")).body;
    expect(l.total).toBeGreaterThanOrEqual(7);
    expect(l.items[0]).toMatchObject({ createdBy: "مدير النظام" });
    expect(l.items[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    const stock = (await get("/report-archive", s.stock)).body;
    // مسؤول المخزون لا يرى تقارير الممتلكات ولا الوصولات (يرى التقرير السنوي لأنه يطلع على لوحة القيادة)
    expect(stock.items.map((i: { reportKey: string }) => i.reportKey)).toEqual(["ANNUAL"]);
  });

  it("التنزيل يعيد الملف كما صدر بالضبط", async () => {
    const g = await prisma.generatedReport.findFirstOrThrow({ where: { schoolId: sid, number: `RPT-${year}-00001` }, include: { file: true } });
    const r = await http
      .get(`${base()}/report-archive/${g.id}/download`)
      .set(auth(admin))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(r.status).toBe(200);
    expect(r.headers["content-disposition"]).toContain(`RPT-${year}-00001.pdf`);
    expect(createHash("sha256").update(r.body as Buffer).digest("hex")).toBe(g.file.sha256);
    expect((await get(`/report-archive/${g.id}/download`, s.stock)).status).toBe(404);
  });

  it("الأرشيف إلحاق فقط: لا تعديل ولا حذف على مستوى القاعدة", async () => {
    const g = await prisma.generatedReport.findFirstOrThrow({ where: { schoolId: sid } });
    await expect(prisma.generatedReport.update({ where: { id: g.id }, data: { title: "x" } })).rejects.toThrow(/append-only/);
    await expect(prisma.generatedReport.delete({ where: { id: g.id } })).rejects.toThrow(/append-only/);
  });

  it("الأرقام متتالية بلا تكرار عند التوليد المتزامن", async () => {
    const rs = await Promise.all([1, 2, 3].map(() => binary("/reports/STOCK_LOW/xlsx", {})));
    const nums = rs.map((r) => r.headers["x-report-number"] as string);
    expect(new Set(nums).size).toBe(3);
    expect(rs.every((r) => r.status === 200)).toBe(true);
  });

  it("كل توليد مسجل في سجل التدقيق", async () => {
    const n = await prisma.auditLog.count({ where: { schoolId: sid, action: "REPORT_GENERATE" } });
    expect(n).toBe(await prisma.generatedReport.count({ where: { schoolId: sid } }));
  });
});

// =====================================================================
describe("كل تقارير الكتالوج تعمل", () => {
  it("معاينة كل تقرير متاح تنجح (بلا مرشحات أو بالمرشح الإلزامي)", async () => {
    const all = (await get("/reports")).body as { key: string }[];
    expect(all).toHaveLength(17);
    for (const { key } of all) {
      const r = await post(`/reports/${key}/preview`, key === "DISCREPANCIES" ? { filters: { sessionId: s.session } } : {});
      expect(r.status, key).toBe(200);
      expect(r.body.html, key).toContain("<!doctype html>");
    }
  });

  it("الإعارات المتأخرة تُحسب من القاعدة", async () => {
    await prisma.resourceLoan.update({ where: { id: s.loan }, data: { dueAt: new Date(Date.now() - 3 * 86400_000), loanedAt: new Date(Date.now() - 5 * 86400_000) } });
    const r = await post("/reports/LOANS_OVERDUE/preview");
    expect(r.body.rowCount).toBe(1);
  });
});

// =====================================================================
describe("الرسوم البيانية في لوحة القيادة", () => {
  it("سلاسل 12 شهراً وأعداد محسوبة من القاعدة", async () => {
    const c = (await get("/dashboard/charts")).body;
    expect(c.months).toHaveLength(12);
    expect(c.months[11]).toBe(today().slice(0, 7));
    expect(c.acquisitions.at(-1)).toMatchObject({ count: 120, value: 127140 });
    expect(c.assetsByCategory[0]).toMatchObject({ label: "معدات معلوماتية", value: 120 });
    expect(c.resourcesDistribution).toMatchObject({ onLoan: 1 });
    expect(c.loansStatus).toMatchObject({ overdue: 1 });
    expect(c.inventoryResults).toHaveLength(1);
    expect(c.inventoryResults[0].number).toBe(`INV-${year}-001`);
    expect((await get("/dashboard/charts", s.viewer)).status).toBe(200);
  });
});
