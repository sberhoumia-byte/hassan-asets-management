import { test } from "@playwright/test";

/** لقطات توثيقية للشاشات الجديدة (تُشغَّل فقط مع SCREENSHOTS=1، بعد flow.spec.ts). */
test.skip(!process.env.SCREENSHOTS, "SCREENSHOTS=1 لتوليد اللقطات");
const out = "../../docs/UI/screenshots/phase3";

test("لقطات المرحلة 3", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByLabel("اسم المستخدم").fill("admin");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("Passw0rd123");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("nav-users").click();
  await page.getByTestId("users-table").waitFor();
  await page.screenshot({ path: `${out}/01-users.png` });
  await page.getByTestId("access-viewer1").click();
  await page.getByTestId("perm-module-branding").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/02-permissions.png` });
  await page.keyboard.press("Escape");
  await page.getByTestId("add-user").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/03-add-user.png` });
});
