import { expect, test } from "@playwright/test";
import { ADMIN, hashIs, setupAdmin } from "./helpers";

test("الإعداد الأول ثم لوحة القيادة بإحصائيات محسوبة وآخر العمليات", async ({ page }) => {
  await setupAdmin(page);
  await page.getByTestId("nav-dashboard").click();
  await hashIs(page, "#/");
  for (const k of ["assets", "stockItems", "activeLoans", "overdueLoans", "openMaintenance"]) {
    await expect(page.getByTestId(`stat-${k}`)).toHaveText("0");
  }
  await expect(page.getByTestId("activity-list")).toContainText("إنشاء حساب مدير النظام");
  // أزرار الوحدات غير المبنية معطلة وليست شكلية
  await expect(page.getByTestId("quick-addAsset")).toBeDisabled();
});

test("القائمة على اليمين في العربية، قابلة للطي، ومرتبة 18 قسماً", async ({ page }) => {
  await setupAdmin(page);
  const side = await page.locator(".app-grid > nav.sidebar").boundingBox();
  const main = await page.locator("main").boundingBox();
  expect(side!.x).toBeGreaterThan(main!.x);
  await expect(page.locator(".app-grid > nav.sidebar .side-link")).toHaveCount(18);
  const before = side!.width;
  await page.getByTestId("toggle-menu").click();
  await expect.poll(async () => (await page.locator(".app-grid > nav.sidebar").boundingBox())!.width).toBeLessThan(before / 2);
  // الحالة محفوظة بعد إعادة التحميل
  await page.reload();
  await expect.poll(async () => (await page.locator(".app-grid > nav.sidebar").boundingBox())!.width).toBeLessThan(before / 2);
});

test("الخط العربي المضمن محمّل (Noto Sans Arabic / Tajawal / Cairo)", async ({ page }) => {
  await setupAdmin(page);
  await page.evaluate(() => document.fonts.ready);
  const fams = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")));
  expect(fams).toEqual(expect.arrayContaining(["Noto Sans Arabic", "Tajawal", "Cairo"]));
});

test("التبديل إلى الفرنسية يقلب الاتجاه إلى LTR والقائمة إلى اليسار", async ({ page }) => {
  await setupAdmin(page);
  await page.getByTestId("user-menu").click();
  await page.getByTestId("switch-language").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByTestId("nav-dashboard").first()).toContainText("Tableau de bord");
  const side = await page.locator(".app-grid > nav.sidebar").boundingBox();
  const main = await page.locator("main").boundingBox();
  expect(side!.x).toBeLessThan(main!.x);
});

test("تسجيل الخروج، رفض كلمة مرور خاطئة، ثم الدخول", async ({ page }) => {
  await setupAdmin(page);
  await page.getByTestId("user-menu").click();
  await page.getByTestId("logout").click();
  await hashIs(page, "/login");
  await page.getByLabel("اسم المستخدم").fill(ADMIN.username);
  await page.getByLabel("كلمة المرور").fill("wrong-password1");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toContainText("غير صحيحة");
  await page.getByLabel("كلمة المرور").fill(ADMIN.password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("header-school")).toContainText("حسان بن ثابت");
  await expect.poll(() => page.evaluate(() => location.hash)).not.toContain("login");
});

test("الصفحات المحمية تحول إلى تسجيل الدخول دون جلسة", async ({ page }) => {
  await setupAdmin(page);
  await page.getByTestId("user-menu").click();
  await page.getByTestId("logout").click();
  await page.goto("/#/settings/branding");
  await hashIs(page, "/login");
});
