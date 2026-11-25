import { expect, test, type Page } from "@playwright/test";

/** المرحلة 9 على الخادم الحقيقي: نسخة احتياطية مشفرة ← تحقق ← تنزيل ← استعادة بكلمة المرور والعبارة. */
test.describe.configure({ mode: "serial" });

const ADMIN = { name: "مدير الاختبار", username: "admin", password: "Passw0rd123" };
const shots = process.env.SCREENSHOTS ? "../../docs/UI/screenshots/phase9" : null;
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

test("النسخ الاحتياطي: إنشاء، تحقق، تنزيل، ثم استعادة تلغي ما أُضيف بعدها", async ({ page, request }) => {
  await login(page);
  const tok = (await (await request.post("/api/v1/auth/login", { data: { username: ADMIN.username, password: ADMIN.password } })).json()).accessToken;
  const headers = { Authorization: `Bearer ${tok}` };
  const sid = (await (await request.get("/api/v1/schools", { headers })).json())[0].id;
  const cats = await (await request.get(`/api/v1/schools/${sid}/categories`, { headers })).json();
  const cat = cats.find((c: { code: string }) => c.code === "P9C")?.id ?? (await (await request.post(`/api/v1/schools/${sid}/categories`, { headers, data: { code: "P9C", nameAr: "تصنيف المرحلة 9" } })).json()).id;
  const count = async () => (await (await request.get(`/api/v1/schools/${sid}/assets?q=P9&pageSize=50`, { headers })).json()).total as number;

  await page.goto("/#/settings/backup");
  await page.getByTestId("backup-create").click();
  const row = page.getByTestId("backup-table").locator("tbody tr").first();
  await expect(row).toContainText("منجزة");
  await row.getByRole("button", { name: "تحقق" }).click();
  await expect(page.getByTestId("backup-verified")).toContainText("النسخة سليمة");
  await shot(page, "01-backup-verified");
  await page.keyboard.press("Escape");
  await expect(row).toContainText("متحقق منها");
  const [dl] = await Promise.all([page.waitForEvent("download"), row.getByRole("button", { name: "تنزيل" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^hassan-backup-.*\.hbk$/);
  await shot(page, "02-backup-list");

  // بيانات بعد النسخة ← تختفي بالاستعادة
  const before = await count();
  await request.post(`/api/v1/schools/${sid}/assets`, { headers, data: { name: "P9 ممتلك بعد النسخة", categoryId: cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE" } });
  expect(await count()).toBe(before + 1);

  await row.getByRole("button", { name: "استعادة" }).click();
  const form = page.getByTestId("restore-form");
  await expect(page.getByTestId("restore-go")).toBeDisabled();
  await form.getByTestId("restore-password").fill("wrong-password-9");
  await form.getByTestId("restore-confirm").fill("استعادة النسخة");
  await shot(page, "03-restore-confirm");
  await page.getByTestId("restore-go").click();
  await expect(page.getByTestId("restore-error")).toContainText("كلمة المرور");
  expect(await count()).toBe(before + 1);
  await form.getByTestId("restore-password").fill(ADMIN.password);
  await page.getByTestId("restore-go").click();
  await expect(form).toBeHidden({ timeout: 20_000 });
  expect(await count()).toBe(before);
  await expect(page.getByTestId("backup-table")).toContainText("استُعيدت");
  await expect(page.getByTestId("backup-table").locator("tbody tr")).toHaveCount(2); // النسخة + نسخة الأمان
});
