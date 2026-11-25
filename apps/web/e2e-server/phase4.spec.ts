import { expect, test, type Page } from "@playwright/test";

/**
 * المرحلة 4 على الخادم الحقيقي: المرجعيات، الموردون، الممتلكات (رقم جرد تلقائي، تكرار، QR، سجل، استبعاد)،
 * والمخزون (إدخال، منع الصرف الزائد، تحويل، عكس). الاختبارات متسلسلة وتتشارك القاعدة.
 */
test.describe.configure({ mode: "serial" });

const ADMIN = { name: "مدير الاختبار", username: "admin", password: "Passw0rd123" };
const hashIs = (page: Page, frag: string) => page.waitForFunction((f) => location.hash.includes(f), frag);

async function login(page: Page) {
  // يكفي هذا الملف وحده: إن لم يُجرَ الإعداد الأول بعد، يُنشأ المدير عبر الواجهة البرمجية
  const st = await (await page.request.get("/api/v1/auth/setup-status")).json();
  if (st.needsSetup)
    await page.request.post("/api/v1/auth/setup", { data: { fullNameAr: ADMIN.name, username: ADMIN.username, password: ADMIN.password, confirmPassword: ADMIN.password } });
  await page.goto("/#/login");
  await page.getByLabel("اسم المستخدم").fill(ADMIN.username);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(ADMIN.password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("header-school")).toBeVisible();
}

async function pick(page: Page, label: string | RegExp, option: string | RegExp) {
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("textbox", { name: label }).click();
  await page.getByRole("option", { name: option }).first().click();
}

const year = new Date().getFullYear();
let qrToken = "";

test("المرجعيات: تصنيف خاص بالمؤسسة ومعاينة صيغة رقم الجرد", async ({ page }) => {
  await login(page);
  await page.goto("/#/settings/catalog");
  await expect(page.getByTestId("pattern-preview")).toHaveText(`ECOLE-${year}-00001`);
  await page.getByTestId("add-category").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("الرمز").fill("INFO");
  await dlg.getByLabel("الاسم بالعربية").fill("معدات معلوماتية");
  await dlg.getByLabel("الاسم بالفرنسية").fill("Matériel informatique");
  await page.getByTestId("category-save").click();
  await expect(page.getByTestId("categories-table")).toContainText("معدات معلوماتية");
  // تكرار الرمز يُرفض على الحقل نفسه
  await page.getByTestId("add-category").click();
  await dlg.getByLabel("الرمز").fill("INFO");
  await dlg.getByLabel("الاسم بالعربية").fill("مكرر");
  await page.getByTestId("category-save").click();
  await expect(dlg.getByText("هذا الرمز مستعمل مسبقاً")).toBeVisible();
  await dlg.getByRole("button", { name: "إلغاء" }).click();
});

test("الموردون: إضافة مع تحقق ICE ثم أرشفة واسترجاع", async ({ page }) => {
  await login(page);
  await page.getByTestId("nav-suppliers").click();
  await hashIs(page, "/suppliers");
  await page.getByTestId("add-supplier").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("الاسم أو المقاولة").fill("مكتبة الأمل");
  await dlg.getByLabel("ICE").fill("12345");
  await page.getByTestId("supplier-save").click();
  await expect(dlg.getByText("يتكون من 15 رقماً")).toBeVisible();
  await dlg.getByLabel("ICE").fill("001234567000089");
  await page.getByTestId("supplier-save").click();
  await expect(page.getByTestId("supplier-row-مكتبة الأمل")).toContainText("001234567000089");
  // أرشفة ثم استرجاع: لا حذف
  await page.getByTestId("archive-مكتبة الأمل").click();
  await page.getByTestId("confirm-archive").click();
  await expect(page.getByTestId("supplier-row-مكتبة الأمل")).toHaveCount(0);
  await page.getByText("مستبعدة").click();
  await page.getByTestId("archive-مكتبة الأمل").click();
  await page.getByTestId("confirm-archive").click();
  await page.getByText("قيد الاستعمال").click();
  await expect(page.getByTestId("supplier-row-مكتبة الأمل")).toBeVisible();
});

test("الممتلكات: رقم جرد تلقائي، رفض التكرار، QR، سجل التعديل والاستبعاد", async ({ page }) => {
  await login(page);
  await page.getByTestId("nav-assets").click();
  await hashIs(page, "/assets");
  await expect(page.getByTestId("assets-empty")).toBeVisible();

  await page.getByTestId("add-asset").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("التسمية").fill("حاسوب مكتبي");
  await pick(page, "التصنيف", /معدات معلوماتية/);
  await dlg.getByLabel("الرقم التسلسلي").fill("SN-001");
  await pick(page, "المورد", "مكتبة الأمل");
  const created = page.waitForResponse((r) => r.url().includes("/assets") && r.request().method() === "POST");
  await page.getByTestId("asset-save").click();
  qrToken = (await (await created).json()).qrToken;
  // بعد الحفظ تُفتح البطاقة مع QR
  await expect(page.getByTestId("asset-details")).toContainText(`ECOLE-${year}-00001`);
  await expect(page.getByTestId("asset-qr").locator("img")).toBeVisible();
  await page.keyboard.press("Escape");

  // رقم جرد يدوي مكرر يُرفض على الحقل
  await page.getByTestId("add-asset").click();
  await dlg.getByLabel("التسمية").fill("طابعة");
  await dlg.getByLabel("رقم الجرد").fill(`ECOLE-${year}-00001`);
  await pick(page, "التصنيف", /معدات معلوماتية/);
  await page.getByTestId("asset-save").click();
  await expect(dlg.getByText("رقم الجرد مستعمل لممتلك آخر")).toBeVisible();
  await dlg.getByLabel("رقم الجرد").fill("");
  await page.getByTestId("asset-save").click();
  await expect(page.getByTestId("asset-details")).toContainText(`ECOLE-${year}-00002`);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("assets-table").getByRole("row")).toHaveCount(3);

  // تعديل الحالة يظهر في السجل بالقيمة القديمة والجديدة
  await page.getByTestId(`asset-row-ECOLE-${year}-00001`).click();
  await page.getByTestId("asset-edit").click();
  await pick(page, "الحالة", "معطل");
  await page.getByTestId("asset-save").click();
  await expect(page.getByTestId("asset-details")).toContainText("معطل");
  await page.getByTestId("asset-history-tab").click();
  await expect(page.getByTestId("asset-history")).toContainText("صالح");
  await expect(page.getByTestId("asset-history")).toContainText("إنشاء البطاقة");

  // الاستبعاد يتطلب سبباً ولا يحذف
  await page.getByRole("tab", { name: "البطاقة" }).click();
  await page.getByTestId("asset-archive").click();
  await page.getByTestId("archive-confirm").click();
  await expect(page.getByText("هذا الحقل مطلوب")).toBeVisible();
  await page.getByTestId("archive-reason").fill("عطب غير قابل للإصلاح");
  await page.getByTestId("archive-confirm").click();
  await expect(page.getByTestId("asset-details")).toContainText("مستبعد");
  await expect(page.getByTestId("asset-edit")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId(`asset-row-ECOLE-${year}-00001`)).toHaveCount(0);
  await page.getByText("مستبعدة").click();
  await expect(page.getByTestId(`asset-row-ECOLE-${year}-00001`)).toBeVisible();
});

test("مسح رمز QR يفتح البطاقة، والرمز المجهول يُرفض", async ({ page }) => {
  await login(page);
  await page.goto(`/#/scan/${qrToken}`);
  await hashIs(page, "/assets/");
  await expect(page.getByRole("dialog")).toContainText("حاسوب مكتبي");
  await page.goto("/#/scan/00000000-0000-4000-8000-000000000000");
  await expect(page.getByTestId("scan-error")).toBeVisible();
});

test("المخزون: إدخال، منع الصرف الزائد، صرف، تحويل، ثم عكس حركة", async ({ page }) => {
  await login(page);
  await page.getByTestId("nav-stock").click();
  await hashIs(page, "/stock");
  const dlg = page.getByRole("dialog");

  // المخازن
  await page.getByTestId("tab-warehouses").click();
  for (const [code, name] of [["W1", "المستودع الرئيسي"], ["W2", "خزانة الإدارة"]]) {
    await page.getByTestId("add-warehouse").click();
    await dlg.getByLabel("الرمز").fill(code!);
    await dlg.getByLabel("اسم المخزن").fill(name!);
    await page.getByTestId("warehouse-save").click();
    await expect(page.getByTestId("warehouses-table")).toContainText(name!);
  }

  // مادة بحد أدنى 5: نافدة قبل أي إدخال
  await page.getByTestId("tab-items").click();
  await page.getByTestId("add-item").click();
  await dlg.getByLabel("الرمز").fill("PAP-A4");
  await dlg.getByLabel("اسم المادة").fill("ورق A4");
  await pick(page, "وحدة القياس", "رزمة ورق");
  await dlg.getByLabel("الحد الأدنى").fill("5");
  await page.getByTestId("item-save").click();
  await expect(page.getByTestId("item-level-PAP-A4")).toHaveText("نافد");

  // إدخال 10
  await page.getByTestId("new-movement").click();
  await page.getByTestId("mv-in").click();
  await pick(page, "المادة", /ورق A4/);
  await pick(page, "المخزن", /المستودع الرئيسي/);
  await dlg.getByLabel("الكمية").fill("10");
  await page.getByTestId("mv-save").click();
  await expect(page.getByText(`MV-${year}-00001`)).toBeVisible();
  await expect(page.getByTestId("item-total-PAP-A4")).toContainText("10");
  await expect(page.getByTestId("item-level-PAP-A4")).toHaveText("كافٍ");

  // صرف 15 > 10 مرفوض برسالة واضحة، والرصيد لا يتغير
  await page.getByTestId("new-movement").click();
  await page.getByTestId("mv-out").click();
  await pick(page, "المادة", /ورق A4/);
  await pick(page, "المخزن", /المستودع الرئيسي/);
  await expect(page.getByTestId("mv-available")).toContainText("10");
  await dlg.getByLabel("الكمية").fill("15");
  await dlg.getByLabel("المستفيد / الغرض").fill("قسم السادس");
  await page.getByTestId("mv-save").click();
  await expect(dlg.getByText("الرصيد غير كافٍ: المتوفر 10")).toBeVisible();
  await dlg.getByLabel("الكمية").fill("6");
  await page.getByTestId("mv-save").click();
  await expect(page.getByTestId("item-total-PAP-A4")).toContainText("4");
  await expect(page.getByTestId("item-level-PAP-A4")).toHaveText("منخفض");

  // تحويل 2 إلى خزانة الإدارة: الإجمالي ثابت
  await page.getByTestId("new-movement").click();
  await page.getByTestId("mv-transfer").click();
  await pick(page, "المادة", /ورق A4/);
  await pick(page, "من مخزن", /المستودع الرئيسي/);
  await pick(page, "إلى مخزن", /خزانة الإدارة/);
  await dlg.getByLabel("الكمية").fill("2");
  await page.getByTestId("mv-save").click();
  const row = page.getByTestId("item-row-PAP-A4");
  await expect(row).toContainText("خزانة الإدارة: 2");
  await expect(page.getByTestId("item-total-PAP-A4")).toContainText("4");

  // عكس الصرف من سجل الحركات يعيد الكمية، والحركة الأصلية تبقى
  await page.getByTestId("tab-movements").click();
  await page.getByTestId(`reverse-MV-${year}-00002`).click();
  await page.getByTestId("reverse-reason").fill("صرف مسجل خطأ");
  await page.getByTestId("reverse-confirm").click();
  await expect(page.getByTestId(`mv-row-MV-${year}-00002`)).toContainText("عُكست بالحركة");
  await expect(page.getByTestId(`reverse-MV-${year}-00002`)).toHaveCount(0);
  await page.getByTestId("tab-items").click();
  await expect(page.getByTestId("item-total-PAP-A4")).toContainText("10");

  // التنبيهات ولوحة القيادة
  await page.getByTestId("nav-dashboard").click();
  await expect(page.getByTestId("activity-list")).toContainText("عكس حركة مخزون");
});
