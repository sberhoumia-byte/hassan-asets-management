import { expect, type Page } from "@playwright/test";

export const ADMIN = { name: "مدير الاختبار", username: "admin", password: "Passw0rd123" };

export const hashIs = (page: Page, frag: string) =>
  page.waitForFunction((f) => location.hash.includes(f), frag);

/** كل اختبار يبدأ بسياق متصفح جديد (IndexedDB فارغة) فينطلق من الإعداد الأول. */
export async function setupAdmin(page: Page) {
  await page.goto("/");
  await hashIs(page, "/setup");
  await page.getByLabel("الاسم الكامل").fill(ADMIN.name);
  await page.getByLabel("اسم المستخدم").fill(ADMIN.username);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(ADMIN.password);
  await page.getByLabel("تأكيد كلمة المرور").fill(ADMIN.password);
  await page.getByTestId("setup-submit").click();
  await hashIs(page, "/settings/school");
  await expect(page.getByTestId("header-school")).toContainText("حسان بن ثابت");
}

/** صورة PNG صغيرة صالحة (1×1) لاختبار رفع الشعار. */
export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
