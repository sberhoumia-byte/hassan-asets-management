import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * المرحلة 6 على الخادم الحقيقي: مسارات المصادقة، الطلبية من الحاجة إلى الإغلاق، الصيانة بانتقالاتها،
 * العهدة ومحضرها، ودورة جرد كاملة بالعد ومسح QR والفروقات والمحضر.
 * الملف مستقل: ينشئ عبر الواجهة البرمجية ما يحتاجه (برموز P6-*) إن لم يكن موجوداً.
 */
test.describe.configure({ mode: "serial" });

const ADMIN = { name: "مدير الاختبار", username: "admin", password: "Passw0rd123" };
const year = new Date().getFullYear();
const shots = process.env.SCREENSHOTS ? "../../docs/UI/screenshots/phase6" : null;
const hashIs = (page: Page, frag: string) => page.waitForFunction((f) => location.hash.includes(f), frag);
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

async function pick(page: Page, label: string | RegExp, option: string | RegExp) {
  const dlg = page.getByRole("dialog").last();
  await dlg.getByRole("textbox", { name: label }).click();
  await page.getByRole("option", { name: option }).first().click();
}

/** بيانات الأساس لهذا الملف (تُنشأ مرة واحدة). */
async function fixtures(page: Page) {
  const c = await apiClient(page.request);
  const spaceTypes = await c.get("/lookups?listKey=SPACE_TYPE");
  const classroom = spaceTypes.find((t: { code: string }) => t.code === "CLASSROOM").id;
  const rooms = await c.get("/rooms");
  const room = async (code: string, name: string) => rooms.find((r: { code: string }) => r.code === code)?.id ?? (await c.post("/rooms", { code, name, spaceTypeId: classroom, status: "GOOD" })).id;
  const r1 = await room("P6-R1", "قاعة الإعلاميات");
  const r2 = await room("P6-R2", "قاعة المطالعة");
  const cats = await c.get("/categories");
  const cat = cats.find((x: { code: string }) => x.code === "P6EQ")?.id ?? (await c.post("/categories", { code: "P6EQ", nameAr: "تجهيزات معلوماتية" })).id;
  const staff = await c.get("/staff");
  const person = async (name: string) => staff.find((s: { fullNameAr: string }) => s.fullNameAr === name)?.id ?? (await c.post("/staff", { fullNameAr: name, type: "TEACHER" })).id;
  const t1 = await person("سعاد الإدريسي");
  const t2 = await person("يوسف البقالي");
  const assets = (await c.get("/assets?q=P6&pageSize=50")).items as { id: string; name: string; qrToken: string; inventoryNumber: string }[];
  const asset = async (name: string) => assets.find((a) => a.name === name) ?? (await c.post("/assets", { name, categoryId: cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE", roomId: r1 }));
  const pc = await asset("P6 حاسوب مكتبي");
  const printer = await asset("P6 طابعة ليزر");
  const sups = await c.get("/suppliers");
  const sup = sups.find((s: { name: string }) => s.name === "P6 مورد التجهيزات")?.id ?? (await c.post("/suppliers", { name: "P6 مورد التجهيزات" })).id;
  const whs = await c.get("/warehouses");
  const wh = whs.find((w: { code: string }) => w.code === "P6W")?.id ?? (await c.post("/warehouses", { code: "P6W", name: "مخزن اللوازم" })).id;
  const units = await c.get("/lookups?listKey=UNIT_OF_MEASURE");
  const pcs = units.find((u: { code: string }) => u.code === "PCS").id;
  const items = await c.get("/stock/items");
  const toner = items.find((i: { code: string }) => i.code === "P6-TONER")?.id ?? (await c.post("/stock/items", { code: "P6-TONER", name: "خرطوشة حبر", unitId: pcs, minQuantity: 0, tracksExpiry: false })).id;
  return { c, r1, r2, cat, t1, t2, pc, printer, sup, wh, toner };
}

test("مسارات المصادقة: مسار افتراضي بخطوة تتطلب دور المدير", async ({ page }) => {
  await login(page);
  await page.goto("/#/settings/workflows");
  await page.getByTestId("new-workflow").click();
  const dlg = page.getByRole("dialog");
  await page.getByTestId("wf-name").fill("مسار ميزانية المؤسسة");
  await page.getByTestId("wf-step-0").fill("تأشيرة مدير المؤسسة");
  await page.getByTestId("wf-add-step").click();
  await page.getByTestId("wf-step-1").fill("مصادقة المقتصد");
  await shot(page, "07-workflow-form");
  await page.getByTestId("wf-save").click();
  await expect(dlg).toBeHidden();
  const row = page.getByTestId("wf-row-مسار ميزانية المؤسسة");
  await expect(row).toContainText("تأشيرة مدير المؤسسة");
  await expect(row).toContainText("مدير المؤسسة");
  await expect(row).toContainText("افتراضي");
});

test("الطلبية: حاجة ← تقدير ← مصادقة بالترتيب ← طلب ← تسلم جزئي ← إدخال ← فوترة ← إغلاق", async ({ page }) => {
  await login(page);
  const f = await fixtures(page);
  await page.getByTestId("nav-purchasing").click();
  await hashIs(page, "/purchasing");
  await page.getByTestId("new-po").click();
  await page.getByTestId("po-save").click();
  await expect(page.getByRole("dialog").getByText("هذا الحقل مطلوب").first()).toBeVisible();
  await page.getByTestId("po-title").fill("تجهيز قاعة الإعلاميات");
  await page.getByTestId("po-item-desc-0").fill("حاسوب محمول");
  await page.getByTestId("po-item-qty-0").fill("2");
  await page.getByTestId("po-item-cost-0").fill("6500");
  await page.getByTestId("po-add-item").click();
  await page.getByTestId("po-item-desc-1").fill("خرطوشة حبر");
  await page.getByTestId("po-item-kind-1").click();
  await page.getByRole("option", { name: "مخزون" }).click();
  await page.getByTestId("po-item-qty-1").fill("10");
  await page.getByTestId("po-item-cost-1").fill("350");
  await page.getByTestId("po-item-stock-1").click();
  await page.getByRole("option", { name: /P6-TONER/ }).click();
  await expect(page.getByRole("dialog")).toContainText(/16.500,00/);
  await shot(page, "05-po-form");
  await page.getByTestId("po-save").click();
  await hashIs(page, "/purchasing/");
  await expect(page.getByTestId("po-status")).toHaveText("مقدَّرة");

  // الإرسال للمصادقة: المسار الافتراضي (لا مصدر تمويل)
  await page.getByTestId("po-submit").click();
  await page.getByTestId("submit-confirm").click();
  await expect(page.getByTestId("po-status")).toHaveText("قيد المصادقة");
  await expect(page.getByTestId("po-edit")).toHaveCount(0);
  // الرفض دون تعليل ممنوع
  await page.getByTestId("reject-1").click();
  await page.getByTestId("decide-confirm").click();
  await expect(page.getByRole("dialog")).toContainText("الرفض يتطلب تعليلاً");
  await page.getByRole("dialog").getByRole("button", { name: "إلغاء" }).click();
  await page.getByTestId("approve-1").click();
  await page.getByTestId("decide-comment").fill("موافق، في حدود الاعتمادات");
  await page.getByTestId("decide-confirm").click();
  await expect(page.getByTestId("approve-2")).toBeVisible();
  await page.getByTestId("approve-2").click();
  await page.getByTestId("decide-confirm").click();
  await expect(page.getByTestId("po-status")).toHaveText("مصادق عليها");
  await expect(page.getByTestId("po-approvals")).toContainText("موافق، في حدود الاعتمادات");

  await page.getByTestId("po-order").click();
  await pick(page, "المورد", "P6 مورد التجهيزات");
  await page.getByTestId("order-ref").fill(`BC-${year}-014`);
  await page.getByTestId("order-confirm").click();
  await expect(page.getByTestId("po-status")).toHaveText("مطلوبة");

  // تسلم جزئي: حاسوب واحد، و10 خراطيش قُبلت منها 8
  await page.getByTestId("po-deliver").click();
  await page.getByTestId("recv-0").fill("1");
  await page.getByTestId("acc-0").fill("1");
  await page.getByTestId("acc-1").fill("12");
  await page.getByTestId("delivery-save").click();
  await expect(page.getByRole("dialog")).toContainText("الكمية المقبولة لا تتجاوز الكمية المستلمة");
  await page.getByTestId("acc-1").fill("8");
  await page.getByTestId("delivery-conformity").getByText("مطابق جزئياً").click();
  await page.getByTestId("delivery-save").click();
  await expect(page.getByTestId("po-status")).toHaveText("مسلَّمة جزئياً");
  await expect(page.getByTestId("po-items")).toContainText("8 / 10");
  await page.getByTestId("po-deliver").click();
  await page.getByTestId("delivery-save").click();
  await expect(page.getByTestId("po-status")).toHaveText("مسلَّمة");

  // لا إغلاق قبل الإدخال
  await page.getByTestId("po-close").click();
  await expect(page.getByText("أسطر مقبولة لم تُدخل بعد")).toBeVisible();
  const postButtons = page.locator('[data-testid^="post-"]');
  while ((await postButtons.count()) > 0) {
    await postButtons.first().click();
    const dlg = page.getByRole("dialog");
    if (await dlg.getByTestId("post-warehouse").count()) await pick(page, "المخزن", /مخزن اللوازم/);
    else await pick(page, "التصنيف", /تجهيزات معلوماتية/);
    await page.getByTestId("post-confirm").click();
    await expect(dlg).toBeHidden();
  }
  await shot(page, "06-po-detail");
  await page.getByTestId("po-invoice").click();
  await page.getByTestId("invoice-number").fill(`FA-${year}-0091`);
  await page.getByTestId("invoice-save").click();
  await expect(page.getByTestId("po-status")).toHaveText("مفوترة");
  await page.getByTestId("po-close").click();
  await expect(page.getByTestId("po-status")).toHaveText("مغلقة ومؤرشفة");

  // الأثر: 10 خراطيش في المخزن، وحاسوبان ببطاقتين
  const stock = (await f.c.get("/stock/items")).find((i: { id: string }) => i.id === f.toner);
  expect(stock.total).toBe(10);
  const laptops = await f.c.get(`/assets?q=${encodeURIComponent("حاسوب محمول")}`);
  expect(laptops.total).toBe(2);
});

test("الصيانة: تبليغ من بطاقة الممتلك ← دراسة ← تدخل بتكلفة ← تم الإصلاح ← إغلاق", async ({ page }) => {
  await login(page);
  const f = await fixtures(page);
  await page.goto(`/#/assets/${f.pc.id}`);
  await page.getByTestId("asset-report-damage").click();
  await hashIs(page, "/maintenance");
  await expect(page.getByTestId("mnt-target-asset")).toHaveValue(/P6 حاسوب مكتبي/);
  await page.getByTestId("mnt-description").fill("الحاسوب لا يشتغل بعد انقطاع الكهرباء");
  await page.getByTestId("mnt-damage").click();
  await page.getByRole("option", { name: "عطب معلوماتي" }).click();
  await page.getByTestId("mnt-urgency").click();
  await page.getByRole("option", { name: "مرتفع" }).click();
  await shot(page, "01-maintenance-form");
  await page.getByTestId("mnt-save").click();
  const detail = page.getByTestId("mnt-detail");
  await expect(detail).toContainText("جديد");
  // انتقال ممنوع غير معروض، والإغلاق المبكر يتطلب ملاحظة
  await expect(page.getByTestId("mnt-to-REPAIRED")).toHaveCount(0);
  await page.getByTestId("mnt-to-CLOSED").click();
  await page.getByTestId("mnt-confirm").click();
  await expect(page.getByRole("dialog").last()).toContainText("الإغلاق دون إصلاح يتطلب ملاحظة تبرره");
  await page.getByRole("dialog").last().getByRole("button", { name: "إلغاء" }).click();
  await page.getByTestId("mnt-to-UNDER_REVIEW").click();
  await page.getByTestId("mnt-confirm").click();
  await expect(detail).toContainText("قيد الدراسة");
  await page.getByTestId("mnt-add-record").click();
  await page.getByTestId("record-contractor").fill("ورشة الإصلاح المعلوماتي");
  await page.getByTestId("record-cost").fill("450");
  await page.getByTestId("record-save").click();
  await expect(page.getByRole("dialog").last()).toContainText("هذا الحقل مطلوب");
  await page.getByTestId("record-repaired-at").fill(new Date().toISOString().slice(0, 10));
  await page.getByTestId("record-save").click();
  await expect(detail).toContainText("تم الإصلاح");
  await expect(page.getByTestId("mnt-records")).toContainText("ورشة الإصلاح المعلوماتي");
  await expect(detail).toContainText("450,00");
  await shot(page, "02-maintenance-detail");
  await page.getByTestId("mnt-to-CLOSED").click();
  await page.getByTestId("mnt-confirm").click();
  await expect(detail).toContainText("مغلق");
  await page.keyboard.press("Escape");
  const a = await f.c.get(`/assets/${f.pc.id}`);
  expect(a.status).toBe("AVAILABLE");
  const hist = await f.c.get(`/assets/${f.pc.id}/history`);
  expect(hist.filter((h: { action: string }) => h.action === "ASSET_MAINTENANCE_STATUS")).toHaveLength(3); // معطل ← قيد الإصلاح ← صالح
});

test("الصيانة الوقائية: جدولة حلّ موعدها تظهر في التنبيهات ويُولَّد منها طلب", async ({ page }) => {
  await login(page);
  await fixtures(page);
  await page.goto("/#/maintenance?tab=schedules");
  await page.getByTestId("new-schedule").click();
  await page.getByTestId("schedule-title").fill("فحص دوري للطابعة");
  await pick(page, "ممتلك", /P6 طابعة ليزر/);
  await page.getByTestId("schedule-due-at").fill(new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10));
  await page.getByTestId("schedule-save").click();
  const row = page.getByTestId("schedule-row-فحص دوري للطابعة");
  await expect(row.getByTestId("schedule-due")).toBeVisible();
  await shot(page, "03-maintenance-schedules");
  await page.goto("/#/");
  await expect(page.getByText("صيانة وقائية حلّ موعدها: 1")).toBeVisible();
  await page.goto("/#/maintenance?tab=schedules");
  await page.getByTestId("generate-فحص دوري للطابعة").click();
  await expect(row.getByTestId("schedule-due")).toHaveCount(0);
  await page.goto("/#/");
  await expect(page.getByText("صيانة وقائية حلّ موعدها")).toHaveCount(0);
  await page.goto("/#/maintenance");
  await expect(page.getByTestId("mnt-table")).toContainText("فحص دوري للطابعة");
  await expect(page.getByTestId("mnt-table")).toContainText("وقائية");
});

test("العهدة: إسناد بمحضر موقع، ثم تحويل ونقل، ورفض تكرار نفس المستلم", async ({ page }) => {
  await login(page);
  const f = await fixtures(page);
  await page.getByTestId("nav-custody").click();
  await hashIs(page, "/custody");
  await page.getByTestId("new-custody").click();
  await page.getByTestId("custody-asset").click();
  await page.getByTestId("custody-asset").fill("P6 طابعة");
  await page.getByRole("option", { name: /P6 طابعة ليزر/ }).click();
  await expect(page.getByRole("dialog")).toContainText("دون مسؤول");
  await pick(page, "المستلِم", /سعاد الإدريسي/);
  await page.getByTestId("custody-save").click();
  await hashIs(page, "/report");
  const doc = page.getByTestId("custody-report");
  await expect(doc).toContainText("محضر إسناد");
  await expect(doc).toContainText("سعاد الإدريسي");
  await expect(doc.getByTestId("signatures")).toContainText("توقيع المستلِم");
  await shot(page, "04-custody-report");

  // نفس المستلم مرفوض، ثم تحويل ونقل من بطاقة الممتلك
  await page.goto(`/#/custody?new=1&asset=${f.printer.id}`);
  await expect(page.getByTestId("custody-asset")).toHaveValue(/P6 طابعة ليزر/);
  await pick(page, "المستلِم", /سعاد الإدريسي/);
  await page.getByTestId("custody-save").click();
  await expect(page.getByRole("dialog")).toContainText("في عهدة هذا الموظف أصلاً");
  await page.getByTestId("custody-action").click();
  await page.getByRole("option", { name: "تحويل بين عهدتين" }).click();
  await pick(page, "المستلِم", /يوسف البقالي/);
  await pick(page, /الفضاء الجديد/, /قاعة المطالعة/);
  await page.getByTestId("custody-save").click();
  await expect(page.getByTestId("custody-report")).toContainText("محضر تحويل عهدة");
  await expect(page.getByTestId("custody-report")).toContainText("قاعة المطالعة");
  const a = await f.c.get(`/assets/${f.printer.id}`);
  expect(a.responsible).toBe("يوسف البقالي");
  expect(a.room).toContain("قاعة المطالعة");
  await page.goto(`/#/custody?asset=${f.printer.id}`);
  await expect(page.getByTestId("custody-table").locator("tbody tr")).toHaveCount(2);
});

test("الجرد: فتح بلقطة ← عدّ يدوي ومسح QR ← فروقات ← مصادقة بمحضر ← إغلاق", async ({ page }) => {
  await login(page);
  const f = await fixtures(page);
  await page.getByTestId("nav-inventory").click();
  await page.getByTestId("new-inv").click();
  await page.getByTestId("inv-type").click();
  await page.getByRole("option", { name: "جرد استثنائي" }).click();
  await page.getByTestId("inv-end").fill(new Date(Date.now() - 86400_000).toISOString().slice(0, 10));
  await page.getByTestId("inv-save").click();
  await expect(page.getByRole("dialog")).toContainText("تاريخ النهاية يجب ألا يسبق تاريخ البداية");
  await page.getByTestId("inv-end").fill(new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10));
  await pick(page, "الفضاءات المشمولة", /قاعة الإعلاميات/);
  await page.keyboard.press("Escape");
  await page.getByTestId("inv-save").click();
  await hashIs(page, "/inventory/");
  await expect(page.getByTestId("inv-status")).toHaveText("مسودة");
  await page.getByTestId("inv-open").click();
  await expect(page.getByTestId("inv-status")).toHaveText("مفتوحة");
  const lines = page.getByTestId("inv-lines");
  await expect(lines).toContainText("P6 حاسوب مكتبي");
  await expect(lines).toContainText("خرطوشة حبر");

  // الحاسوب يُعدّ يدوياً: وُجد في قاعة المطالعة (في غير مكانه)
  await page.getByTestId(`count-${f.pc.inventoryNumber}`).click();
  await pick(page, "وُجد في", /قاعة المطالعة/);
  await page.getByTestId("count-condition").fill("شاشة مخدوشة");
  await page.getByTestId("count-save").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(lines).toContainText("شاشة مخدوشة");
  // الطابعة (نُقلت خارج النطاق) تُمسح بالرمز: «غير متوقع»
  await page.getByTestId("inv-scan").fill(`${page.url().split("#")[0]}#/scan/${f.printer.qrToken}`);
  await page.getByTestId("inv-scan").press("Enter");
  await page.getByTestId("count-save").click();
  await expect(lines).toContainText("غير متوقع");
  await shot(page, "08-inventory-counting");
  await page.getByTestId("inv-complete").click();
  await expect(page.getByTestId("inv-status")).toHaveText("انتهى العد");
  await page.getByTestId("tab-disc").click();
  await expect(page.getByTestId("disc-misplaced")).toContainText("1");
  await expect(page.getByTestId("disc-unexpected")).toContainText("1");
  await shot(page, "09-inventory-discrepancies");
  await page.getByTestId("inv-validate").click();
  await page.getByTestId("inv-validate-confirm").click();
  await expect(page.getByRole("dialog")).toContainText("هذا الحقل مطلوب");
  await page.getByTestId("inv-report-notes").fill("يُرجع الحاسوب إلى قاعة الإعلاميات؛ الطابعة في عهدة يوسف البقالي.");
  await page.getByTestId("inv-validate-confirm").click();
  await expect(page.getByTestId("inv-status")).toHaveText("مصادق عليها");
  await page.getByTestId("inv-report").click();
  await hashIs(page, "/report");
  const doc = page.getByTestId("inv-report-doc");
  await expect(doc).toContainText("محضر جرد استثنائي");
  await expect(doc).toContainText("يُرجع الحاسوب إلى قاعة الإعلاميات");
  await expect(doc.getByTestId("signatures")).toContainText("توقيع لجنة الجرد");
  await expect(page.getByTestId("report-document")).toContainText("تفاصيل الفروقات");
  await shot(page, "10-inventory-report");
  await page.goBack();
  await page.getByTestId("inv-close").click();
  await expect(page.getByTestId("inv-status")).toHaveText("مغلقة");
});

test("لوحة القيادة: الإجراءات السريعة للجرد والصيانة مفعّلة", async ({ page }) => {
  await login(page);
  await page.getByTestId("quick-newMaintenance").click();
  await hashIs(page, "/maintenance");
  await expect(page.getByTestId("mnt-form")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/#/");
  await page.getByTestId("quick-newInventory").click();
  await hashIs(page, "/inventory");
  await expect(page.getByTestId("inv-form")).toBeVisible();
});
