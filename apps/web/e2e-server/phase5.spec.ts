import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * المرحلة 5 على الخادم الحقيقي: الموظفون، البنايات والحجرات، الملاعب، الوسائل (فردية وكمية)،
 * الإعارة والإرجاع والوصولات، منع إعارة المعار/المعطوب، الإعارة والإرجاع الجزئيان، احتساب التأخير.
 */
test.describe.configure({ mode: "serial" });

const ADMIN = { name: "مدير الاختبار", username: "admin", password: "Passw0rd123" };
const year = new Date().getFullYear();
const hashIs = (page: Page, frag: string) => page.waitForFunction((f) => location.hash.includes(f), frag);

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

/** عميل للواجهة البرمجية مباشرة (لاختبار القواعد التي تمنعها الواجهة أصلاً). */
async function apiClient(request: APIRequestContext) {
  const r = await request.post("/api/v1/auth/login", { data: { username: ADMIN.username, password: ADMIN.password } });
  const { accessToken } = await r.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const schools = await (await request.get("/api/v1/schools", { headers })).json();
  const sid = schools[0].id as string;
  return {
    sid,
    get: async (p: string) => (await request.get(`/api/v1/schools/${sid}${p}`, { headers })).json(),
    post: (p: string, data: unknown) => request.post(`/api/v1/schools/${sid}${p}`, { headers, data }),
  };
}

async function pick(page: Page, label: string | RegExp, option: string | RegExp) {
  const dlg = page.getByRole("dialog").last();
  await dlg.getByRole("textbox", { name: label }).click();
  await page.getByRole("option", { name: option }).first().click();
}

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

test("الموظفون: إضافة أستاذين ورفض تكرار رقم التأجير", async ({ page }) => {
  await login(page);
  await page.goto("/#/settings/staff");
  for (const [name, num] of [
    ["أحمد العلوي", "T001"],
    ["فاطمة الزهراء", "T002"],
  ]) {
    await page.getByTestId("add-staff").click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("الاسم الكامل بالعربية").fill(name!);
    await dlg.getByLabel("رقم التأجير").fill(num!);
    await page.getByTestId("staff-save").click();
    await expect(page.getByTestId(`staff-row-${name}`)).toBeVisible();
  }
  await page.getByTestId("add-staff").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("الاسم الكامل بالعربية").fill("مكرر");
  await dlg.getByLabel("رقم التأجير").fill("T001");
  await page.getByTestId("staff-save").click();
  await expect(dlg.getByText("رقم التأجير مستعمل لموظف آخر")).toBeVisible();
  await dlg.getByRole("button", { name: "إلغاء" }).click();
});

test("البنايات والحجرات: إضافة، المحتوى، ومنع أرشفة بناية تضم حجرات", async ({ page }) => {
  await login(page);
  await page.getByTestId("nav-spaces").click();
  await hashIs(page, "/spaces");
  await page.getByTestId("tab-buildings").click();
  await page.getByTestId("add-building").click();
  let dlg = page.getByRole("dialog");
  await dlg.getByLabel("الرمز").fill("B1");
  await dlg.getByLabel("التسمية").fill("البناية الرئيسية");
  await dlg.getByLabel("عدد الطوابق").fill("2");
  await page.getByTestId("building-save").click();
  await expect(page.getByTestId("building-row-B1")).toContainText("البناية الرئيسية");

  await page.getByTestId("tab-rooms").click();
  await page.getByTestId("add-room").click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("الرمز").fill("S01");
  await dlg.getByLabel("التسمية").fill("القسم الأول");
  await page.getByTestId("room-save").click();
  await expect(dlg.getByText("هذا الحقل مطلوب")).toBeVisible(); // نوع الفضاء
  await pick(page, "نوع الفضاء", "حجرة دراسية");
  await pick(page, "البناية", /البناية الرئيسية/);
  await dlg.getByLabel("الطاقة الاستيعابية").fill("30");
  await page.getByTestId("room-save").click();
  await expect(page.getByTestId("room-row-S01")).toContainText("حجرة دراسية");
  await expect(page.getByTestId("room-row-S01")).toContainText("البناية الرئيسية");
  await page.getByTestId("view-S01").click();
  await expect(page.getByTestId("room-empty")).toBeVisible();
  await page.keyboard.press("Escape");

  // بناية تضم حجرة نشطة لا تُؤرشف
  await page.getByTestId("tab-buildings").click();
  await page.getByTestId("archive-B1").click();
  await page.getByTestId("confirm-archive").click();
  await expect(page.getByText("لا يمكن أرشفة بناية تضم حجرات نشطة")).toBeVisible();
  await expect(page.getByTestId("building-row-B1")).toBeVisible();
});

test("الملاعب: إضافة ملعب بحالة الأرضية", async ({ page }) => {
  await login(page);
  await page.getByTestId("nav-facilities").click();
  await page.getByTestId("add-facility").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("الرمز").fill("F1");
  await dlg.getByLabel("التسمية").fill("الملعب الرئيسي");
  await pick(page, /^النوع/, "ملعب كرة القدم");
  await dlg.getByLabel("حالة الأرضية").fill("إسمنت متشقق جزئياً");
  await page.getByTestId("facility-save").click();
  await expect(page.getByTestId("facility-row-F1")).toContainText("ملعب كرة القدم");
  await expect(page.getByTestId("facility-row-F1")).toContainText("إسمنت متشقق جزئياً");
});

test("الوسائل: صنف فردي بوحدتين مرقمتين (إحداهما معطوبة) وصنف كمي", async ({ page }) => {
  await login(page);
  await page.getByTestId("nav-resources").click();
  await page.getByTestId("add-resource").click();
  let dlg = page.getByRole("dialog");
  await dlg.getByLabel("الرمز").fill("PROJ");
  await dlg.getByLabel("التسمية").fill("جهاز عرض متنقل");
  await pick(page, "نوع الوسيلة", "جهاز عرض");
  await pick(page, "مكان الحفظ", /القسم الأول/);
  await page.getByTestId("resource-save").click();
  // يفتح البطاقة بعد الحفظ
  await page.getByTestId("units-tab").click();
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("add-unit").click();
    await page.getByTestId("unit-save").click();
  }
  await expect(page.getByTestId("unit-row-PROJ-001")).toBeVisible();
  await expect(page.getByTestId("unit-row-PROJ-002")).toBeVisible();
  await page.getByTestId("edit-unit-PROJ-002").click();
  await pick(page, "الحالة", "معطوبة");
  await page.getByTestId("unit-save").click();
  await expect(page.getByTestId("unit-row-PROJ-002")).toContainText("معطوبة");
  await page.getByTestId("qr-PROJ-001").click();
  await expect(page.getByTestId("unit-qr").locator("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await hashIs(page, "/resources");

  await page.getByTestId("add-resource").click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("الرمز").fill("BALL");
  await dlg.getByLabel("التسمية").fill("كرات القدم");
  await dlg.getByText("بالكمية").click();
  await dlg.getByLabel("الكمية الإجمالية").fill("10");
  await page.getByTestId("resource-save").click();
  await expect(page.getByTestId("availability")).toContainText("10");
  await page.keyboard.press("Escape");

  await expect(page.getByTestId("resource-row-PROJ").getByTestId("available")).toHaveText("1");
  await expect(page.getByTestId("resource-row-BALL").getByTestId("available")).toHaveText("10");
});

test("إعارة وحدة: وصل الإعارة، ثم منع إعارة المعار والمعطوب", async ({ page }) => {
  await login(page);
  await page.goto("/#/resources");
  await page.getByTestId("resource-row-PROJ").click();
  await page.getByTestId("resource-lend").click();
  await hashIs(page, "/loans");
  const dlg = page.getByRole("dialog");
  // الوحدة المعطوبة لا تظهر في الاختيار
  await dlg.getByRole("textbox", { name: "الوحدة" }).click();
  await expect(page.getByRole("option", { name: "PROJ-002" })).toHaveCount(0);
  await page.getByRole("option", { name: "PROJ-001" }).click();
  await pick(page, "المستعير", /أحمد العلوي/);
  await dlg.getByLabel("تاريخ الإرجاع المتوقع").fill(inDays(7));
  await page.getByTestId("loan-save").click();
  await hashIs(page, "/receipt");
  const receipt = page.getByTestId("loan-receipt");
  await expect(receipt).toContainText("وصل إعارة وسيلة تعليمية");
  await expect(receipt).toContainText(`LN-${year}-00001`);
  await expect(receipt).toContainText("PROJ-001");
  await expect(receipt).toContainText("أحمد العلوي");
  await expect(page.getByTestId("signatures")).toContainText("توقيع المستعير");
  await expect(page.getByTestId("letterhead")).toBeVisible();

  // في الواجهة: الصنف بلا متاح لا يُختار
  await page.goto("/#/loans");
  await page.getByTestId("new-loan").click();
  await page.getByRole("dialog").getByRole("textbox", { name: "الوسيلة" }).click();
  await expect(page.getByRole("option", { name: /PROJ/ })).toHaveAttribute("data-combobox-disabled", "true");
  await page.keyboard.press("Escape");

  // في الخادم: رفض صريح حتى لو تجاوز أحدهم الواجهة
  const c = await apiClient(page.request);
  const res = (await c.get("/resources")).find((r: { code: string }) => r.code === "PROJ");
  const detail = await c.get(`/resources/${res.id}`);
  const staff = (await c.get("/staff"))[0];
  const u1 = detail.units.find((u: { inventoryNumber: string }) => u.inventoryNumber === "PROJ-001");
  const u2 = detail.units.find((u: { inventoryNumber: string }) => u.inventoryNumber === "PROJ-002");
  const body = { resourceId: res.id, quantity: 1, borrowerStaffId: staff.id, dueAt: inDays(3) };
  const again = await c.post("/loans", { ...body, unitId: u1.id });
  expect(again.status()).toBe(409);
  expect((await again.json()).error.code).toBe("RESOURCE_ALREADY_ON_LOAN");
  const broken = await c.post("/loans", { ...body, unitId: u2.id });
  expect(broken.status()).toBe(422);
  expect((await broken.json()).error.code).toBe("RESOURCE_NOT_AVAILABLE");
});

test("إعارة كمية: رفض تجاوز المتاح، ثم إرجاع جزئي بوصل إرجاع", async ({ page }) => {
  await login(page);
  await page.goto("/#/loans");
  await page.getByTestId("new-loan").click();
  let dlg = page.getByRole("dialog");
  await pick(page, "الوسيلة", /BALL/);
  await dlg.getByLabel("الكمية").fill("6");
  await pick(page, "المستعير", /فاطمة الزهراء/);
  await page.getByTestId("loan-save").click();
  await hashIs(page, "/receipt");
  await expect(page.getByTestId("loan-receipt")).toContainText(`LN-${year}-00002`);

  await page.goto("/#/loans");
  await page.getByTestId("new-loan").click();
  dlg = page.getByRole("dialog");
  await pick(page, "الوسيلة", /BALL/);
  await dlg.getByLabel("الكمية").fill("5");
  await pick(page, "المستعير", /أحمد العلوي/);
  await page.getByTestId("loan-save").click();
  await expect(dlg.getByText("الكمية غير متوفرة: المتاح 4 والمطلوب 5")).toBeVisible();
  await dlg.getByRole("button", { name: "إلغاء" }).click();

  // إرجاع جزئي: 2 من 6
  const row = page.getByTestId(`loan-row-LN-${year}-00002`);
  await expect(row).toContainText("6 / 6");
  await page.getByTestId(`return-LN-${year}-00002`).click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("الكمية المرجعة").fill("2");
  await page.getByTestId("return-save").click();
  await hashIs(page, "/receipt");
  await expect(page.getByTestId("loan-receipt")).toContainText("وصل إرجاع وسيلة تعليمية");
  await expect(page.getByTestId("receipt-returns")).toContainText("2");
  await expect(page.getByTestId("loan-receipt")).toContainText("المتبقي غير المرجع: 4");

  await page.goto("/#/loans");
  await expect(row).toContainText("4 / 6");
  await expect(row).toContainText("مرجعة جزئياً");
  // إرجاع أكثر من المتبقي مرفوض
  await page.getByTestId(`return-LN-${year}-00002`).click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("الكمية المرجعة").fill("5");
  await page.getByTestId("return-save").click();
  await expect(dlg.getByText("الكمية المرجعة أكبر من المتبقي: المتبقي 4 والمطلوب 5")).toBeVisible();
  await dlg.getByRole("button", { name: "إلغاء" }).click();
  await page.goto("/#/resources");
  await expect(page.getByTestId("resource-row-BALL").getByTestId("available")).toHaveText("6");
});

test("التأخير: إعارة تجاوزت تاريخها بثلاثة أيام تظهر متأخرة، والإرجاع معطوباً يغيّر حالة الوحدة", async ({ page }) => {
  // تقديم تاريخ الإرجاع في قاعدة الاختبار المعزولة فقط (الواجهة والخادم يرفضان تاريخاً ماضياً)
  const schema = process.env.E2E_DB_SCHEMA;
  test.skip(!schema, "يتطلب scripts/e2e-server.mjs");
  const { Client } = createRequire(join(process.cwd(), "../api/package.json"))("pg");
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL!.split("?")[0] });
  await db.connect();
  await db.query(`UPDATE "${schema}".resource_loans SET "loanedAt" = $1, "dueAt" = $2 WHERE number = $3`, [`${inDays(-10)}T09:00:00Z`, `${inDays(-3)}T23:59:59.999Z`, `LN-${year}-00001`]);
  await db.end();

  await login(page);
  await page.goto("/#/loans");
  await page.getByTestId("loans-view").getByText("متأخرة").click();
  const row = page.getByTestId(`loan-row-LN-${year}-00001`);
  await expect(row.getByTestId("loan-late")).toHaveText("متأخرة 3 يوم");
  await expect(page.getByTestId(`loan-row-LN-${year}-00002`)).toHaveCount(0);

  await page.getByTestId(`return-LN-${year}-00001`).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText("متأخرة 3 يوم")).toBeVisible();
  await dlg.getByLabel("الحالة عند الإرجاع").fill("عدسة مخدوشة");
  await page.getByTestId("return-damaged").click();
  await page.getByTestId("return-save").click();
  await hashIs(page, "/receipt");
  await expect(page.getByTestId("loan-receipt")).toContainText("متأخرة 3 يوم");
  await expect(page.getByTestId("receipt-returns")).toContainText("عدسة مخدوشة");

  await page.goto("/#/loans");
  await page.getByTestId("loans-view").getByText("مرجعة").click();
  await expect(page.getByTestId(`loan-row-LN-${year}-00001`)).toContainText("أُرجعت بتأخير 3 يوم");
  await page.goto("/#/resources");
  await page.getByTestId("resource-row-PROJ").click();
  await page.getByTestId("units-tab").click();
  await expect(page.getByTestId("unit-row-PROJ-001")).toContainText("معطوبة");
});

test("مسح QR لوحدة يفتح بطاقة الوسيلة، والممتلك يُسند إلى حجرة ومسؤول", async ({ page }) => {
  await login(page);
  const c = await apiClient(page.request);
  const res = (await c.get("/resources")).find((r: { code: string }) => r.code === "PROJ");
  const detail = await c.get(`/resources/${res.id}`);
  await page.goto(`/#/scan/${detail.units[0].qrToken}`);
  await hashIs(page, `/resources/${res.id}`);
  await expect(page.getByRole("dialog")).toContainText("جهاز عرض متنقل");
  await page.keyboard.press("Escape");

  // ممتلك في الحجرة S01 بمسؤول (تصنيف خاص بهذا الملف حتى يعمل وحده)
  await c.post("/categories", { code: "MOB", nameAr: "أثاث مدرسي" });
  await page.goto("/#/assets");
  await page.getByTestId("add-asset").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("التسمية").fill("سبورة بيضاء");
  await pick(page, "التصنيف", /أثاث مدرسي/);
  await pick(page, "الحجرة / الفضاء", /القسم الأول/);
  await pick(page, "المسؤول عنه", /أحمد العلوي/);
  await page.getByTestId("asset-save").click();
  await expect(page.getByTestId("asset-details")).toContainText("القسم الأول");
  await expect(page.getByTestId("asset-details")).toContainText("أحمد العلوي");
  await page.keyboard.press("Escape");

  // الحجرة لم تعد فارغة: محتواها يظهر وأرشفتها ممنوعة
  await page.goto("/#/spaces");
  await page.getByTestId("view-S01").click();
  await expect(page.getByTestId("room-contents")).toContainText("سبورة بيضاء");
  await expect(page.getByTestId("room-contents")).toContainText("PROJ-001");
  await page.keyboard.press("Escape");
  await page.getByTestId("archive-S01").click();
  await page.getByTestId("confirm-archive").click();
  await expect(page.getByText("لا يمكن أرشفة الحجرة: تحتوي 1 ممتلكاً و2 وحدة وسيلة")).toBeVisible();
});

test("لوحة القيادة: الإعارات النشطة والنشاط والإجراء السريع", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId("stat-activeLoans")).toHaveText("1");
  await expect(page.getByTestId("activity-list")).toContainText("إرجاع وسيلة");
  await page.getByTestId("quick-newLoan").click();
  await hashIs(page, "/loans");
  await expect(page.getByTestId("loan-form")).toBeVisible();
});
