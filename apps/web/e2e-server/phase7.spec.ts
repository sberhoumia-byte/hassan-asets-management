import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";

/**
 * المرحلة 7 على الخادم الحقيقي: الرسوم البيانية في لوحة القيادة، التقارير (معاينة، PDF عربي من Chromium، Excel، الأرشيف)،
 * محضر PDF من الخادم، استيراد Excel كاملاً (قالب ← رفع ← تحقق ← اعتماد)، والوثائق المرفوعة بإصداراتها.
 * الملف مستقل: ينشئ ما يحتاجه برموز P7-*.
 */
test.describe.configure({ mode: "serial" });

const ADMIN = { name: "مدير الاختبار", username: "admin", password: "Passw0rd123" };
const shots = process.env.SCREENSHOTS ? "../../docs/UI/screenshots/phase7" : null;
const shot = async (page: Page, name: string) => {
  if (!shots) return;
  const style = await page.addStyleTag({ content: ".mantine-Notifications-root{display:none!important}" });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${shots}/${name}.png` });
  await style.evaluate((el) => el.remove());
};

async function login(page: Page) {
  const st = await (await page.request.get("/api/v1/auth/setup-status")).json();
  if (st.needsSetup)
    await page.request.post("/api/v1/auth/setup", { data: { fullNameAr: ADMIN.name, username: ADMIN.username, password: ADMIN.password, confirmPassword: ADMIN.password } });
  await page.goto("/#/login");
  await page.getByLabel("اسم المستخدم").fill(ADMIN.username);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(ADMIN.password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("header-school")).toBeVisible();
}

async function apiClient(request: APIRequestContext) {
  const r = await request.post("/api/v1/auth/login", { data: { username: ADMIN.username, password: ADMIN.password } });
  const { accessToken } = await r.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const schools = await (await request.get("/api/v1/schools", { headers })).json();
  const sid = schools[0].id as string;
  return {
    sid,
    get: async (p: string) => (await request.get(`/api/v1/schools/${sid}${p}`, { headers })).json(),
    post: async (p: string, data: unknown) => (await request.post(`/api/v1/schools/${sid}${p}`, { headers, data })).json(),
  };
}

/** بيانات اختبار معزولة (مخطط E2E مؤقت): تصنيفان، فضاء، بضعة ممتلكات. */
async function fixtures(page: Page) {
  const c = await apiClient(page.request);
  const cats = await c.get("/categories");
  const cat = async (code: string, nameAr: string) => cats.find((x: { code: string }) => x.code === code)?.id ?? (await c.post("/categories", { code, nameAr })).id;
  const it = await cat("P7IT", "معدات معلوماتية");
  const fu = await cat("P7FU", "أثاث مدرسي");
  const types = await c.get("/lookups?listKey=SPACE_TYPE");
  const rooms = await c.get("/rooms");
  const room =
    rooms.find((r: { code: string }) => r.code === "P7-R1")?.id ??
    (await c.post("/rooms", { code: "P7-R1", name: "قاعة الإعلاميات", spaceTypeId: types.find((t: { code: string }) => t.code === "CLASSROOM").id, status: "GOOD" })).id;
  const existing = (await c.get("/assets?q=P7&pageSize=50")).items as { name: string }[];
  const add = async (name: string, categoryId: string, status = "AVAILABLE", value = 3000) =>
    existing.some((a) => a.name === name) ||
    (await c.post("/assets", { name, categoryId, trackingMode: "INDIVIDUAL", quantity: 1, status, roomId: room, acquisitionDate: new Date().toISOString().slice(0, 10), acquisitionValue: value }));
  await add("P7 حاسوب محمول", it, "AVAILABLE", 6500);
  await add("P7 جهاز عرض", it, "DAMAGED", 4200);
  await add("P7 طاولة مزدوجة", fu, "AVAILABLE", 900);
  return { c, it, room };
}

test("لوحة القيادة: رسوم بيانية من بيانات الخادم مع عرض جدولي", async ({ page }) => {
  await login(page);
  await fixtures(page);
  await page.reload(); // اللوحة حُمّلت قبل إنشاء البيانات
  const byCat = page.getByTestId("chart-assetsByCategory");
  await expect(byCat).toContainText("معدات معلوماتية");
  await expect(byCat).toContainText("أثاث مدرسي");
  await expect(page.getByTestId("chart-acquisitions").locator("svg")).toBeVisible();
  // التبديل إلى الأرقام
  await byCat.getByRole("button", { name: "عرض الأرقام" }).click();
  await expect(byCat.getByRole("table")).toContainText("2");
  await byCat.getByRole("button", { name: "◧" }).click();
  await shot(page, "01-dashboard-charts");
});

test("التقارير: معاينة، PDF عربي وExcel يؤرشفان برقم، والتنزيل من الأرشيف", async ({ page }) => {
  await login(page);
  await page.goto("/#/reports");
  await expect(page.getByTestId("report-select")).toBeVisible();
  await page.getByTestId("report-preview-btn").click();
  const frame = page.frameLocator('[data-testid="report-preview"]');
  await expect(frame.locator("body")).toContainText("P7 حاسوب محمول");
  await shot(page, "02-report-preview");

  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByTestId("report-pdf-btn").click()]);
  expect(pdf.suggestedFilename()).toMatch(/^RPT-\d{4}-\d{5}\.pdf$/);
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe("%PDF-");
  const [xl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("report-xlsx-btn").click()]);
  expect(xl.suggestedFilename()).toMatch(/\.xlsx$/);

  await page.getByTestId("tab-archive").click();
  const table = page.getByTestId("archive-table");
  await expect(table).toContainText(pdf.suggestedFilename().replace(".pdf", ""));
  await shot(page, "03-report-archive");
  const number = pdf.suggestedFilename().replace(".pdf", "");
  const [again] = await Promise.all([page.waitForEvent("download"), page.getByTestId(`archive-dl-${number}`).click()]);
  expect(again.suggestedFilename()).toBe(pdf.suggestedFilename());
});

test("استيراد Excel: قالب، رفع بمطابقة تلقائية، تحقق بلا كتابة، تقرير أخطاء، اعتماد", async ({ page }) => {
  await login(page);
  await fixtures(page);
  await page.goto("/#/imports");
  await page.getByTestId("import-entity").click();
  await page.getByRole("option", { name: "الممتلكات والتجهيزات" }).click();
  const [tpl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("import-template").click()]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await tpl.path())!);
  const ws = wb.worksheets[0]!;
  expect(ws.getRow(1).getCell(1).value).toBe("اسم الممتلك *");
  // نملأ القالب نفسه: سطران صالحان وسطر بتصنيف غير موجود
  ws.addRow(["P7 مستورد: سبورة تفاعلية", "", "P7IT", "", "", 1, "صالح"]);
  ws.addRow(["P7 مستورد: خزانة", "", "P7FU"]);
  ws.addRow(["P7 مستورد: خطأ", "", "XX-NONE"]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  await shot(page, "04-import-start");

  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("import-upload").click()]);
  await chooser.setFiles({ name: "biens-p7.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: buf });
  await expect(page.getByTestId("import-status")).toHaveText("مرفوع");
  await expect(page.getByTestId("map-name")).toHaveValue("اسم الممتلك *");
  await shot(page, "05-import-mapping");
  await page.getByTestId("import-validate").click();
  await expect(page.getByTestId("import-accepted")).toHaveText("2");
  await expect(page.getByTestId("import-rejected")).toHaveText("1");
  await expect(page.getByTestId("import-errors")).toContainText("غير موجود في المؤسسة");
  const before = (await (await apiClient(page.request)).get("/assets?q=مستورد&pageSize=50")).total;
  expect(before).toBe(0); // التحقق لا يكتب شيئاً
  const [errs] = await Promise.all([page.waitForEvent("download"), page.getByTestId("import-errors-file").click()]);
  expect(errs.suggestedFilename()).toMatch(/^import-errors-.*\.xlsx$/);
  await expect(page.getByTestId("import-commit")).toBeDisabled();
  await page.getByTestId("import-partial").check();
  await shot(page, "06-import-validated");
  await page.getByTestId("import-commit").click();
  await page.getByTestId("import-commit-confirm").click();
  await expect(page.getByTestId("import-done")).toContainText("تم استيراد 2 سجل");
  expect((await (await apiClient(page.request)).get("/assets?q=مستورد&pageSize=50")).total).toBe(2);
  await expect(page.getByTestId("import-history")).toContainText("biens-p7.xlsx");
  await shot(page, "07-import-done");
});

test("الوثائق: رفع PDF مرتبط بممتلك، إصدار جديد، تنزيل، وأرشفة بدل الحذف", async ({ page }) => {
  await login(page);
  await fixtures(page);
  await page.goto("/#/documents");
  await page.getByTestId("doc-add").click();
  const form = page.getByTestId("doc-form");
  await form.getByTestId("doc-title").fill("P7 فاتورة اقتناء الحواسيب");
  await form.getByRole("textbox", { name: "الصنف" }).click();
  await page.getByRole("option", { name: "فاتورة" }).click();
  await form.getByTestId("doc-link-pick").click();
  await form.getByTestId("doc-link-pick").fill("حاسوب");
  await page.getByRole("option", { name: /P7 حاسوب محمول/ }).click();
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const [ch] = await Promise.all([page.waitForEvent("filechooser"), form.getByTestId("doc-file").click()]);
  await ch.setFiles({ name: "facture-p7.pdf", mimeType: "application/pdf", buffer: pdf });
  await shot(page, "08-document-form");
  await form.getByTestId("doc-save").click();

  const modal = page.getByTestId("doc-modal");
  await expect(modal.getByTestId("doc-links")).toContainText("P7 حاسوب محمول");
  await expect(modal.getByTestId("doc-versions")).toContainText("v1");
  const [c2] = await Promise.all([page.waitForEvent("filechooser"), modal.getByTestId("doc-version-file").click()]);
  await c2.setFiles({ name: "facture-p7-signee.pdf", mimeType: "application/pdf", buffer: Buffer.concat([pdf, Buffer.from("% signed\n")]) });
  await modal.getByTestId("doc-version-note").fill("النسخة الموقعة");
  await modal.getByTestId("doc-version-save").click();
  await expect(modal.getByTestId("doc-versions")).toContainText("v2");
  await expect(modal.getByTestId("doc-versions")).toContainText("النسخة الموقعة");
  const [dl] = await Promise.all([page.waitForEvent("download"), modal.getByTestId("doc-dl-v1").click()]);
  expect(dl.suggestedFilename()).toBe("facture-p7.pdf");
  await shot(page, "09-document-versions");

  await modal.getByTestId("doc-archive").click();
  await modal.getByTestId("doc-archive-reason").fill("تمت التسوية");
  await modal.getByTestId("doc-archive-confirm").click();
  await expect(modal).toContainText("المؤرشفة");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("doc-table")).toHaveCount(0);
  await page.getByText("المؤرشفة", { exact: true }).click();
  await expect(page.getByTestId("doc-table")).toContainText("P7 فاتورة اقتناء الحواسيب");
  await shot(page, "10-documents-archived");
});
