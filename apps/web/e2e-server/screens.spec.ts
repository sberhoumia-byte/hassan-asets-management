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

test("لقطات المرحلة 4", async ({ page }) => {
  const dir = "../../docs/UI/screenshots/phase4";
  const year = new Date().getFullYear();
  await page.goto("/#/login");
  await page.getByLabel("اسم المستخدم").fill("admin");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("Passw0rd123");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("header-school").waitFor();

  await page.goto("/#/assets");
  await page.getByTestId("assets-table").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/01-assets.png` });
  await page.getByTestId(`asset-row-ECOLE-${year}-00002`).click();
  await page.getByTestId("asset-qr").locator("img").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/02-asset-card-qr.png` });
  await page.keyboard.press("Escape");
  await page.getByTestId("add-asset").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/03-asset-form.png` });
  await page.keyboard.press("Escape");

  await page.goto("/#/stock");
  await page.getByTestId("items-table").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/04-stock-items.png` });
  await page.getByTestId("new-movement").click();
  await page.getByTestId("mv-out").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("textbox", { name: "المادة" }).click();
  await page.getByRole("option", { name: /ورق A4/ }).click();
  await dlg.getByRole("textbox", { name: "المخزن" }).click();
  await page.getByRole("option", { name: /المستودع الرئيسي/ }).click();
  await dlg.getByLabel("الكمية").fill("50");
  await dlg.getByLabel("المستفيد / الغرض").fill("قسم السادس");
  await page.getByTestId("mv-save").click();
  await dlg.getByText("الرصيد غير كافٍ").waitFor();
  await page.screenshot({ path: `${dir}/05-oversell-refused.png` });
  await page.keyboard.press("Escape");
  await page.getByTestId("tab-movements").click();
  await page.getByTestId("movements-table").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/06-stock-movements.png` });
  await page.getByTestId("tab-alerts").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/07-stock-alerts.png` });

  await page.goto("/#/suppliers");
  await page.getByTestId("suppliers-table").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/08-suppliers.png` });
  await page.goto("/#/settings/catalog");
  await page.getByTestId("categories-table").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/09-catalog-settings.png`, fullPage: true });
});

test("لقطات المرحلة 5", async ({ page }) => {
  const dir = "../../docs/UI/screenshots/phase5";
  const year = new Date().getFullYear();
  const shot = async (name: string, fullPage = false) => {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage });
  };
  await page.goto("/#/login");
  await page.getByLabel("اسم المستخدم").fill("admin");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("Passw0rd123");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("header-school").waitFor();

  await page.goto("/#/spaces");
  await page.getByTestId("rooms-table").waitFor();
  await shot("01-rooms");
  await page.getByTestId("view-S01").click();
  await page.getByTestId("room-contents").waitFor();
  await shot("02-room-contents");
  await page.keyboard.press("Escape");
  await page.goto("/#/facilities");
  await page.getByTestId("facilities-table").waitFor();
  await shot("03-facilities");

  await page.goto("/#/resources");
  await page.getByTestId("resources-table").waitFor();
  await shot("04-resources");
  await page.getByTestId("resource-row-PROJ").click();
  await page.getByTestId("units-tab").click();
  await page.getByTestId("units-table").waitFor();
  await shot("05-resource-units");
  await page.keyboard.press("Escape");

  await page.goto("/#/loans");
  await page.getByTestId("loans-view").getByText("الكل").click();
  await page.getByTestId(`loan-row-LN-${year}-00001`).waitFor();
  await shot("06-loans");
  await page.getByTestId("new-loan").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("textbox", { name: "الوسيلة" }).click();
  await page.getByRole("option", { name: /BALL/ }).click();
  await dlg.getByLabel("الكمية").fill("9");
  await dlg.getByRole("textbox", { name: "المستعير" }).click();
  await page.getByRole("option", { name: /أحمد العلوي/ }).click();
  await page.getByTestId("loan-save").click();
  await dlg.getByText("الكمية غير متوفرة").waitFor();
  await shot("07-quantity-refused");
  await page.keyboard.press("Escape");
  await page.getByTestId(`receipt-LN-${year}-00002`).click();
  await page.getByTestId("loan-receipt").waitFor();
  await shot("08-return-receipt", true);
  await page.goto("/#/settings/staff");
  await page.getByTestId("staff-table").waitFor();
  await shot("09-staff");
});
