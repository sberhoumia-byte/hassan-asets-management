import { expect, test, type Page } from "@playwright/test";

/**
 * مسار كامل على الخادم الحقيقي وقاعدة PostgreSQL (مخطط معزول لكل تشغيل).
 * الاختبارات متسلسلة وتتشارك القاعدة: الإعداد الأول مرة واحدة ثم المستخدمون والصلاحيات.
 */
test.describe.configure({ mode: "serial" });

const ADMIN = { name: "مدير الاختبار", username: "admin", password: "Passw0rd123" };
const VIEWER = { name: "مستخدم اطلاع", username: "viewer1", password: "Viewer2026pass" };
let viewerTemp = "";

const hashIs = (page: Page, frag: string) => page.waitForFunction((f) => location.hash.includes(f), frag);

async function login(page: Page, username: string, password: string) {
  await page.goto("/#/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByTestId("login-submit").click();
}

test("الإعداد الأول يُنشئ المدير في القاعدة، والجلسة تبقى بعد إعادة التحميل", async ({ page }) => {
  await page.goto("/");
  await hashIs(page, "/setup");
  await page.getByLabel("الاسم الكامل").fill(ADMIN.name);
  await page.getByLabel("اسم المستخدم").fill(ADMIN.username);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(ADMIN.password);
  await page.getByLabel("تأكيد كلمة المرور").fill(ADMIN.password);
  await page.getByTestId("setup-submit").click();
  await hashIs(page, "/settings/school");
  await expect(page.getByTestId("header-school")).toContainText("حسان بن ثابت");
  // لا شريط «وضع المراجعة»: البيانات على الخادم
  await expect(page.getByText("وضع المراجعة")).toHaveCount(0);
  // رمز الوصول في الذاكرة فقط؛ بعد إعادة التحميل تُستعاد الجلسة من كوكي التجديد httpOnly
  await page.reload();
  await expect(page.getByTestId("header-school")).toContainText("حسان بن ثابت");
  expect(await page.evaluate(() => document.cookie)).not.toContain("hat_refresh");
  await page.getByTestId("nav-dashboard").click();
  await expect(page.getByTestId("activity-list")).toContainText("إنشاء حساب مدير النظام");
  await expect(page.getByTestId("stat-assets")).toHaveText("0");
});

test("المدير ينشئ مستخدماً بكلمة مرور مؤقتة تظهر مرة واحدة", async ({ page }) => {
  await login(page, ADMIN.username, ADMIN.password);
  await page.getByTestId("nav-users").click();
  await hashIs(page, "/users");
  await page.getByTestId("add-user").click();
  await page.getByLabel("الاسم الكامل بالعربية").fill(VIEWER.name);
  await page.getByRole("dialog").getByLabel("اسم المستخدم").fill(VIEWER.username);
  await page.getByTestId("user-roles").click({ force: true });
  await page.getByRole("option", { name: "اطلاع فقط" }).click();
  await page.keyboard.press("Escape");
  await page.getByTestId("user-create-submit").click();
  viewerTemp = (await page.getByTestId("temp-password").textContent())!.trim();
  expect(viewerTemp).toMatch(/^[A-Za-z]{4}-[A-Za-z]{4}-\d{4}$/);
  await page.getByRole("button", { name: "تم، أغلق" }).click();
  const row = page.getByTestId("users-table").getByRole("row", { name: /viewer1/ });
  await expect(row).toContainText("اطلاع فقط");
  await expect(row).toContainText("كلمة مرور مؤقتة");
});

test("المستخدم الجديد يُجبر على تغيير كلمة المرور ولا يرى إلا ما يحق له", async ({ page }) => {
  await login(page, VIEWER.username, viewerTemp);
  await expect(page.getByText("اختر كلمة مرورك")).toBeVisible();
  await page.getByLabel("كلمة المرور المؤقتة").fill(viewerTemp);
  await page.getByLabel("كلمة المرور الجديدة").fill(VIEWER.password);
  await page.getByLabel("تأكيد كلمة المرور").fill(VIEWER.password);
  await page.getByTestId("force-pw-submit").click();
  await expect(page.getByTestId("header-school")).toContainText("حسان بن ثابت");
  // لا قائمة مستخدمين، ولا أزرار حفظ في الهوية البصرية لدور الاطلاع
  await expect(page.getByTestId("nav-users")).toHaveCount(0);
  await page.goto("/#/settings/branding");
  await expect(page.getByTestId("go-print-preview")).toBeVisible();
  await expect(page.getByTestId("branding-save")).toHaveCount(0);
  await expect(page.getByTestId("branding-reset")).toHaveCount(0);
});

test("منح صلاحية فردية من شاشة الصلاحيات يظهر أثره فعلاً", async ({ page, browser }) => {
  await login(page, ADMIN.username, ADMIN.password);
  await page.getByTestId("nav-users").click();
  await page.getByTestId("access-viewer1").click();
  await page.getByTestId("perm-module-branding").click();
  await page.getByTestId("ov-branding.update").getByText("منح").click();
  await page.getByTestId("access-save").click();
  await expect(page.getByTestId("users-table").getByRole("row", { name: /viewer1/ })).toContainText("1 مخصصة");

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await login(p2, VIEWER.username, VIEWER.password);
  await expect(p2.getByTestId("header-school")).toBeVisible();
  await p2.goto("/#/settings/branding");
  await expect(p2.getByTestId("branding-reset")).toBeVisible();
  await ctx.close();
});

test("حفظ الهوية البصرية يُحفظ في الخادم ويُرقّم الإصدار", async ({ page }) => {
  await login(page, ADMIN.username, ADMIN.password);
  await expect(page.getByTestId("header-school")).toBeVisible();
  await page.goto("/#/settings/branding");
  await page.getByTestId("branding-reset").click();
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByText("تمت استعادة")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "السجل" }).click();
  const hist = page.getByTestId("history-table");
  await expect(hist).toContainText(ADMIN.name);
  await expect(hist).toContainText("استعادة الافتراضي");
});
