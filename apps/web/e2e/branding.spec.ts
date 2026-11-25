import { expect, test } from "@playwright/test";
import { PNG_1PX, setupAdmin } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupAdmin(page);
  await page.getByTestId("tab-branding").click();
  await expect(page.getByTestId("live-preview")).toBeVisible();
});

test("تعديل سطر يظهر فوراً في المعاينة، وبعد الحفظ في التقارير وسجل التعديلات", async ({ page }) => {
  await page.getByTestId("linesAr-4").fill("مؤسسة حسان بن ثابت – نسخة معدلة");
  await expect(page.getByTestId("live-preview").getByTestId("letterhead")).toContainText("نسخة معدلة");

  // قبل الحفظ: معاينة الطباعة (المرتبطة بالإعداد المركزي) لا تتأثر
  await page.getByTestId("tab-printPreview").click();
  await expect(page.getByTestId("letterhead").first()).not.toContainText("نسخة معدلة");

  await page.getByTestId("tab-branding").click();
  await page.getByTestId("linesAr-4").fill("مؤسسة حسان بن ثابت – نسخة معدلة");
  await page.getByTestId("branding-save").click();
  await expect(page.getByText("تم حفظ الهوية البصرية")).toBeVisible();

  await page.getByTestId("tab-printPreview").click();
  await expect(page.getByTestId("letterhead").first()).toContainText("نسخة معدلة");

  await page.getByTestId("tab-branding").click();
  await page.getByRole("tab", { name: "السجل" }).click();
  await expect(page.getByTestId("history-table")).toContainText("حفظ التعديلات");
});

test("الترويسة في جميع صفحات تقرير متعدد الصفحات، أو الأولى فقط، مع ترقيم الصفحات", async ({ page }) => {
  await page.getByTestId("tab-printPreview").click();
  await page.getByTestId("rows-control").getByText("120").click();
  const pages = page.getByTestId("a4-page");
  const n = await pages.count();
  expect(n).toBeGreaterThan(2);
  await expect(page.getByTestId("report-document").getByTestId("letterhead")).toHaveCount(n);
  await expect(pages.last().getByTestId("page-footer")).toContainText(`صفحة ${n} من ${n}`);

  await page.getByTestId("tab-branding").click();
  await page.getByTestId("btab-print").click();
  await page.getByTestId("placement-first").click();
  await page.getByTestId("branding-save").click();
  await page.getByTestId("tab-printPreview").click();
  await page.getByTestId("rows-control").getByText("120").click();
  await expect(page.getByTestId("report-document").getByTestId("letterhead")).toHaveCount(1);
  await expect(page.getByTestId("a4-page").first().getByTestId("letterhead")).toHaveCount(1);
});

test("الطباعة الفعلية (PDF من Chromium) تنتج صفحات A4 بعدد صفحات المعاينة", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium");
  await page.getByTestId("tab-printPreview").click();
  await page.getByTestId("rows-control").getByText("60").click();
  const n = await page.getByTestId("a4-page").count();
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pageCount).toBe(n);
});

test("رفع الشعار يظهر في الترويسة والواجهة، والحذف يتطلب تأكيداً", async ({ page }) => {
  await page.getByTestId("btab-logo").click();
  await page.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(page.getByTestId("logo-preview")).toBeVisible();
  await expect(page.getByTestId("live-preview").getByTestId("letterhead-logo")).toBeVisible();
  await page.getByTestId("branding-save").click();
  await expect(page.locator("header").getByTestId("school-logo").locator("img")).toBeVisible();

  await page.getByTestId("delete-logo").click();
  await expect(page.getByRole("dialog")).toContainText("حذف الشعار");
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("logo-preview")).toHaveCount(0);
});

test("رفض ملف ليس صورة حتى لو كان امتداده png", async ({ page }) => {
  await page.getByTestId("btab-logo").click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("%PDF-1.4 not an image"),
  });
  await expect(page.getByText("نوع الملف غير مقبول")).toBeVisible();
  await expect(page.getByTestId("logo-preview")).toHaveCount(0);
});

test("استعادة الافتراضي بعد التأكيد", async ({ page }) => {
  await page.getByTestId("linesAr-0").fill("سطر مؤقت");
  await page.getByTestId("branding-save").click();
  await page.getByTestId("branding-reset").click();
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("linesAr-0")).toHaveValue("المملكة المغربية");
});
