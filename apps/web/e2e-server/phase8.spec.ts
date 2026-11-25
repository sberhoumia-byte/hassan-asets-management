import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

/**
 * المرحلة 8 على الخادم الحقيقي: التنبيهات (جرس، تفضيلات، تشغيل يدوي)، سجل التدقيق،
 * المخطط التفاعلي (رسم وربط وألوان الحالة)، والعمل دون اتصال (طابور ← مزامنة ← تعارض) بقطع الشبكة فعلياً.
 * الملف مستقل: ينشئ ما يحتاجه برموز P8-*.
 */
test.describe.configure({ mode: "serial" });

const ADMIN = { name: "مدير الاختبار", username: "admin", password: "Passw0rd123" };
const shots = process.env.SCREENSHOTS ? "../../docs/UI/screenshots/phase8" : null;
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

/** صورة PNG حقيقية تشبه مخططاً بسيطاً: أرضية فاتحة وجدران داكنة. */
function planPng(w = 900, h = 560) {
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcT[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  const wallX = [20, 300, 600, 880];
  const wallY = [20, 260, 300, 540];
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const wall = (wallX.some((v) => Math.abs(x - v) < 4) && y >= 20 && y <= 540 && !(y > 260 && y < 300)) || (wallY.some((v) => Math.abs(y - v) < 4) && x >= 20 && x <= 880);
      const yard = y > 300;
      const [r, g, b] = wall ? [73, 80, 87] : yard ? [233, 236, 220] : [248, 249, 250];
      const i = y * (w * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** بيانات اختبار معزولة: فضاءان، مرفق، ممتلك معطوب، مادة مخزون تحت الحد، مخزن. */
async function fixtures(page: Page) {
  const c = await apiClient(page.request);
  const types = await c.get("/lookups?listKey=SPACE_TYPE");
  const cls = types.find((t: { code: string }) => t.code === "CLASSROOM").id;
  const rooms = await c.get("/rooms");
  const room = async (code: string, name: string, status = "GOOD") => rooms.find((r: { code: string }) => r.code === code)?.id ?? (await c.post("/rooms", { code, name, spaceTypeId: cls, status })).id;
  const r1 = await room("P8-R1", "القسم الأول");
  const r2 = await room("P8-R2", "القسم الثاني");
  const r3 = await room("P8-R3", "المخزن القديم", "OUT_OF_SERVICE");
  const cats = await c.get("/categories");
  const cat = cats.find((x: { code: string }) => x.code === "P8C")?.id ?? (await c.post("/categories", { code: "P8C", nameAr: "أثاث المرحلة 8" })).id;
  const assets = (await c.get("/assets?q=P8&pageSize=50")).items as { name: string; inventoryNumber: string }[];
  const asset = async (name: string, roomId: string, status: string) =>
    assets.find((a) => a.name === name) ?? (await c.post("/assets", { name, categoryId: cat, trackingMode: "INDIVIDUAL", quantity: 1, status, roomId }));
  const desk = await asset("P8 مكتب الأستاذ", r1, "AVAILABLE");
  await asset("P8 سبورة مكسورة", r2, "DAMAGED");
  const whs = await c.get("/warehouses");
  const wh = whs.find((w: { code: string }) => w.code === "P8-W")?.id ?? (await c.post("/warehouses", { code: "P8-W", name: "مخزن المرحلة 8" })).id;
  const unit = (await c.get("/lookups?listKey=UNIT_OF_MEASURE")).find((x: { code: string }) => x.code === "PCS").id;
  const items = await c.get("/stock/items");
  let item = items.find((x: { code: string }) => x.code === "P8-CRAIE")?.id;
  if (!item) {
    item = (await c.post("/stock/items", { code: "P8-CRAIE", name: "طباشير أبيض", unitId: unit, minQuantity: 10, tracksExpiry: false })).id;
    await c.post("/stock/movements/in", { itemId: item, warehouseId: wh, quantity: 6 });
  }
  return { c, r1, r2, r3, desk, wh, item };
}

test("التنبيهات: فحص يدوي ← جرس بعدد غير المقروء ← فتح العنصر ← التفضيلات", async ({ page }) => {
  await login(page);
  await fixtures(page);
  await page.goto("/#/settings/notifications");
  await page.getByTestId("notif-run").click();
  await expect(page.getByText(/تم الفحص/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("notif-count")).toBeVisible();
  await page.getByTestId("notif-bell").click();
  const item = page.getByTestId("notif-STOCK_LOW").filter({ hasText: "طباشير أبيض" });
  await expect(item).toContainText("تحت الحد الأدنى: 6 من 10");
  await shot(page, "01-notifications-bell");
  await item.click();
  await expect(page).toHaveURL(/#\/stock/);
  await page.goto("/#/settings/notifications");
  await page.getByTestId("pref-STOCK_LOW").click({ force: true });
  await expect(page.getByTestId("pref-STOCK_LOW")).not.toBeChecked();
  await shot(page, "02-notification-preferences");
  await page.reload();
  await expect(page.getByTestId("pref-STOCK_LOW")).not.toBeChecked();
  await page.getByTestId("pref-STOCK_LOW").click({ force: true });
  await expect(page.getByTestId("pref-STOCK_LOW")).toBeChecked();
});

test("سجل التدقيق: تصفية بالفعل وتفاصيل قبل/بعد، قراءة فقط", async ({ page }) => {
  await login(page);
  await page.goto("/#/settings/audit");
  await expect(page.getByTestId("audit-table")).toBeVisible();
  await page.getByTestId("audit-action").click();
  await page.getByRole("option", { name: "STOCK_IN", exact: true }).click();
  const rows = page.getByTestId("audit-table").locator("tbody tr");
  await expect(rows.first()).toContainText("STOCK_IN");
  await shot(page, "03-audit-log");
  await rows.first().click();
  await expect(page.getByRole("dialog")).toContainText("طباشير");
  await shot(page, "04-audit-detail");
});

test("المخطط التفاعلي: خلفية، رسم وربط الفضاءات، ألوان الحالة من البيانات الحية", async ({ page }) => {
  await login(page);
  await fixtures(page);
  await page.goto("/#/floorplan");
  await page.getByTestId("fp-new").click();
  await page.getByTestId("fp-name").fill("P8 الطابق الأرضي");
  const [ch] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("fp-bg").click()]);
  await ch.setFiles({ name: "plan.png", mimeType: "image/png", buffer: planPng() });
  await expect(page.getByTestId("fp-bg-name")).toHaveText("plan.png");
  await page.getByTestId("fp-form-save").click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByTestId("fp-edit").click();
  await expect(page.getByTestId("fp-hint")).toBeVisible();
  await expect(page.getByTestId("fp-canvas").locator("canvas").first()).toBeVisible();
  const box = (await page.getByTestId("fp-canvas").boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
  };
  const link = async (name: RegExp) => {
    await page.getByTestId("fp-link").click();
    await page.getByRole("option", { name }).click();
  };
  // ثلاثة فضاءات: سليم، فيه ممتلك معطوب، خارج الخدمة
  for (const [fx, code] of [[0.03, /P8-R1/], [0.36, /P8-R2/], [0.69, /P8-R3/]] as const) {
    await page.getByTestId("fp-tool-RECTANGLE").click();
    await drag(at(fx, 0.05), at(fx + 0.28, 0.44));
    await link(code);
  }
  // علامة المدخل
  await page.getByTestId("fp-tool-MARKER").click();
  await page.mouse.click(at(0.5, 0.5).x, at(0.5, 0.5).y);
  await page.getByTestId("fp-label").fill("المدخل الرئيسي");
  await expect(page.getByTestId("fp-table").locator("tbody tr")).toHaveCount(4);
  await shot(page, "05-floorplan-edit");
  await page.getByTestId("fp-save").click();
  await expect(page.getByTestId("fp-edit")).toBeVisible();

  const table = page.getByTestId("fp-table");
  await expect(table.locator("tbody tr").filter({ hasText: "P8-R1" })).toContainText("سليم");
  await expect(table.locator("tbody tr").filter({ hasText: "P8-R2" })).toContainText("يحتاج متابعة");
  await expect(table.locator("tbody tr").filter({ hasText: "P8-R3" })).toContainText("خارج الخدمة");
  await expect(table.locator("tbody tr").filter({ hasText: "المدخل الرئيسي" })).toContainText("غير مرتبط");
  // النقر على الفضاء في المخطط يعرض حالته
  await page.mouse.click(at(0.5, 0.25).x, at(0.5, 0.25).y);
  await expect(page.getByTestId("fp-level")).toHaveText(/يحتاج متابعة/);
  await expect(page.getByTestId("fp-panel")).toContainText("منها معطوبة أو قيد الإصلاح: 1");
  await shot(page, "06-floorplan-view");
});

test("دون اتصال: صرف وعدّ جرد يُحفظان محلياً، يُرسلان عند العودة مرة واحدة، والتعارض يظهر", async ({ page, context, request }) => {
  await login(page);
  const f = await fixtures(page);
  // عميل مستقل عن المتصفح (قطع الشبكة يخص سياق المتصفح فقط)
  const srv = await apiClient(request);
  const balance = async () => ((await srv.get("/stock/items")) as { code: string; balances: { quantity: number }[] }[]).find((x: { code: string }) => x.code === "P8-CRAIE").balances.reduce((a: number, b: { quantity: number }) => a + b.quantity, 0);
  const start = await balance();
  // دورة جرد مفتوحة على القسم الأول
  const today = new Date().toISOString().slice(0, 10);
  const inv = await f.c.post("/inventory-sessions", { type: "EXCEPTIONAL", startDate: today, endDate: today, includesStock: false, roomIds: [f.r1], assigneeIds: [] });
  await f.c.post(`/inventory-sessions/${inv.id}/open`, {});

  // الصفحتان حُمّلتا أثناء الاتصال (لا تخزين لاستجابات الخادم في Service Worker؛ تبقى في ذاكرة الجلسة)
  await page.goto("/#/stock");
  await expect(page.getByTestId("item-total-P8-CRAIE")).toBeVisible();
  await page.goto(`/#/inventory/${inv.id}`);
  await expect(page.getByTestId("inv-lines")).toContainText("P8 مكتب الأستاذ");

  await context.setOffline(true);
  await expect(page.getByTestId("outbox-btn")).toHaveAttribute("data-online", "0");
  // عدّ جرد دون اتصال
  await page.getByTestId(`count-${f.desk.inventoryNumber}`).click();
  await expect(page.getByTestId("count-offline")).toBeVisible();
  await page.getByTestId("count-save").click();
  await expect(page.getByTestId(`pending-${f.desk.inventoryNumber}`)).toBeVisible();

  await page.getByTestId("nav-stock").click();
  await expect(page.getByTestId("item-total-P8-CRAIE")).toBeVisible();
  const dlg = page.getByRole("dialog");
  // صرف 2 (يكفي الرصيد) وصرف 50 (لن يكفي عند المزامنة)
  for (const q of ["2", "50"]) {
    await page.getByTestId("new-movement").click();
    await page.getByTestId("mv-out").click();
    await expect(page.getByTestId("mv-offline")).toBeVisible();
    await pick(page, "المادة", /طباشير أبيض/);
    // المخزن النشط الوحيد يُختار تلقائياً؛ وإلا نختاره (النقر على المختار مسبقاً يلغي اختياره)
    if (!/مخزن المرحلة 8/.test(await dlg.getByRole("textbox", { name: "المخزن" }).inputValue())) await pick(page, "المخزن", /مخزن المرحلة 8/);
    await dlg.getByLabel("الكمية").fill(q);
    await dlg.getByLabel("المستفيد / الغرض").fill("قسم المستوى الثالث");
    await page.getByTestId("mv-save").click();
    await expect(dlg).toBeHidden();
  }
  await page.getByTestId("outbox-btn").click();
  await expect(page.getByTestId("outbox-list").getByTestId("outbox-PENDING")).toHaveCount(3);
  await shot(page, "07-offline-queue");
  expect(await balance()).toBe(start); // لم يصل شيء للخادم بعد

  await context.setOffline(false);
  await expect(page.getByTestId("outbox-list").getByTestId("outbox-APPLIED")).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByTestId("outbox-list").getByTestId("outbox-CONFLICT")).toHaveCount(1);
  await expect(page.getByTestId("outbox-list")).toContainText("الرصيد لم يعد كافياً عند المزامنة");
  await shot(page, "08-offline-synced");
  expect(await balance()).toBe(start - 2);
  await page.keyboard.press("Escape");
  await page.goto(`/#/inventory/${inv.id}`);
  await expect(page.getByTestId(`line-${f.desk.inventoryNumber}`)).toBeVisible();
  await expect(page.getByTestId(`pending-${f.desk.inventoryNumber}`)).toHaveCount(0);
  await expect(page.getByTestId(`line-${f.desk.inventoryNumber}`).locator("td").nth(4)).toHaveText("1");

  // مزامنة ثانية (إعادة تحميل + محاولة) لا تكرر شيئاً
  await page.reload();
  await page.getByTestId("outbox-btn").click();
  await expect(page.getByTestId("outbox-sync")).toBeDisabled();
  expect(await balance()).toBe(start - 2);
  const history = await srv.get("/sync");
  expect(history.filter((h: { status: string }) => h.status === "APPLIED")).toHaveLength(2);
});
