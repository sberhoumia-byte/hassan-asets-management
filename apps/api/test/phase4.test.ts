import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type request from "supertest";
import { auth, bootApp, userWithRole } from "./helpers";
import type { PrismaService } from "../src/prisma/prisma.service";

/** المرحلة 4: الممتلكات والمخزون والموردون — على PostgreSQL حقيقي (مخطط معزول لهذا الملف). */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let admin = "";
let sid = "";
const s = { cat: "", unit: "", wh1: "", wh2: "", item: "", supplier: "", asset: "", stockMgr: "", assetMgr: "", viewer: "", schoolB: "" };
const base = () => `/api/v1/schools/${sid}`;

beforeAll(async () => {
  ({ app, http, prisma, admin, schoolId: sid } = await bootApp());
});
afterAll(async () => {
  await app?.close();
});

describe("المراجع: التصنيفات والقوائم والموردون", () => {
  it("ينشئ تصنيفاً ويمنع تكرار الرمز والحلقات", async () => {
    const a = await http.post(`${base()}/categories`).set(auth(admin)).send({ code: "IT", nameAr: "معدات معلوماتية" });
    expect(a.status).toBe(201);
    s.cat = a.body.id;
    const child = await http.post(`${base()}/categories`).set(auth(admin)).send({ code: "IT-PC", nameAr: "حواسيب", parentId: s.cat });
    expect(child.status).toBe(201);
    expect((await http.post(`${base()}/categories`).set(auth(admin)).send({ code: "IT", nameAr: "مكرر" })).body.error.code).toBe("DUPLICATE_CODE");
    const cyc = await http.put(`${base()}/categories/${s.cat}`).set(auth(admin)).send({ code: "IT", nameAr: "معدات معلوماتية", parentId: child.body.id });
    expect(cyc.body.error.code).toBe("CATEGORY_CYCLE");
  });

  it("وحدات القياس العامة متاحة، ويمكن إضافة قيمة خاصة بالمؤسسة", async () => {
    const units = (await http.get(`${base()}/lookups?listKey=UNIT_OF_MEASURE`).set(auth(admin))).body;
    s.unit = units.find((u: { code: string }) => u.code === "PCS").id;
    const r = await http.post(`${base()}/lookups/ASSET_TYPE`).set(auth(admin)).send({ code: "PC", labelAr: "حاسوب مكتبي" });
    expect(r.status).toBe(201);
    expect((await http.post(`${base()}/lookups/NOT_A_LIST`).set(auth(admin)).send({ code: "X", labelAr: "س" })).status).toBe(400);
  });

  it("الموردون: إنشاء، منع تكرار ICE، أرشفة", async () => {
    const r = await http.post(`${base()}/suppliers`).set(auth(admin)).send({ name: "مكتبة الاختبار", ice: "001234567000089", phone: "0528000000" });
    expect(r.status).toBe(201);
    s.supplier = r.body.id;
    expect((await http.post(`${base()}/suppliers`).set(auth(admin)).send({ name: "آخر", ice: "001234567000089" })).body.error.code).toBe("DUPLICATE_ICE");
    expect((await http.post(`${base()}/suppliers`).set(auth(admin)).send({ name: "خطأ", ice: "123" })).body.error.details.fields.ice).toBe("errors.ice");
    const tmp = await http.post(`${base()}/suppliers`).set(auth(admin)).send({ name: "مورد مؤقت" });
    await http.post(`${base()}/suppliers/${tmp.body.id}/archive`).set(auth(admin));
    const active = (await http.get(`${base()}/suppliers`).set(auth(admin))).body.map((x: { name: string }) => x.name);
    expect(active).toEqual(["مكتبة الاختبار"]);
    expect((await http.get(`${base()}/suppliers?archived=1`).set(auth(admin))).body).toHaveLength(1);
  });
});

describe("الممتلكات", () => {
  const asset = () => ({ name: "حاسوب مكتبي", categoryId: s.cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE", supplierId: s.supplier, acquisitionDate: "2026-10-01", acquisitionValue: 4500 });

  it("يولّد رقم الجرد تلقائياً حسب الصيغة ويتزايد", async () => {
    const a = await http.post(`${base()}/assets`).set(auth(admin)).send(asset());
    expect(a.status).toBe(201);
    const y = new Date().getFullYear();
    expect(a.body.inventoryNumber).toBe(`ECOLE-${y}-00001`);
    expect(a.body.qrToken).toMatch(/^[0-9a-f-]{36}$/);
    s.asset = a.body.id;
    const b = await http.post(`${base()}/assets`).set(auth(admin)).send(asset());
    expect(b.body.inventoryNumber).toBe(`ECOLE-${y}-00002`);
  });

  it("صيغة الترقيم قابلة للتعديل وتتطلب {SEQ}", async () => {
    expect((await http.put(`${base()}/settings/numbering`).set(auth(admin)).send({ inventoryNumberPattern: "INV-{YEAR}" })).status).toBe(400);
    await http.put(`${base()}/settings/numbering`).set(auth(admin)).send({ inventoryNumberPattern: "HIT/{YEAR}/{SEQ:4}" });
    const a = await http.post(`${base()}/assets`).set(auth(admin)).send(asset());
    expect(a.body.inventoryNumber).toBe(`HIT/${new Date().getFullYear()}/0003`);
  });

  it("يمنع تكرار رقم الجرد اليدوي، حتى مع طلبين متزامنين", async () => {
    expect((await http.post(`${base()}/assets`).set(auth(admin)).send({ ...asset(), inventoryNumber: "MAN-1" })).status).toBe(201);
    const dup = await http.post(`${base()}/assets`).set(auth(admin)).send({ ...asset(), inventoryNumber: "MAN-1" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_INVENTORY_NUMBER");
    const race = await Promise.all([1, 2, 3, 4].map(() => http.post(`${base()}/assets`).set(auth(admin)).send({ ...asset(), inventoryNumber: "RACE-1" })));
    expect(race.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    expect(await prisma.asset.count({ where: { inventoryNumber: "RACE-1" } })).toBe(1);
  });

  it("عشرون إنشاءً متزامناً بأرقام تلقائية: كلها فريدة", async () => {
    const rs = await Promise.all(Array.from({ length: 20 }, () => http.post(`${base()}/assets`).set(auth(admin)).send(asset())));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(new Set(rs.map((r) => r.body.inventoryNumber)).size).toBe(20);
  });

  it("التحقق: الصنف الفردي كميته 1، والمراجع من نفس المؤسسة", async () => {
    const r = await http.post(`${base()}/assets`).set(auth(admin)).send({ ...asset(), quantity: 3 });
    expect(r.body.error.details.fields.quantity).toBe("errors.individualQty");
    const bad = await http.post(`${base()}/assets`).set(auth(admin)).send({ ...asset(), supplierId: "00000000-0000-4000-8000-000000000000" });
    expect(bad.body.error.details.fields.supplierId).toBe("errors.invalidChoice");
  });

  it("التعديل والصورة والتاريخ", async () => {
    const r = await http.put(`${base()}/assets/${s.asset}`).set(auth(admin)).send({ ...asset(), name: "حاسوب مكتبي HP", status: "DAMAGED", photoDataUrl: PNG });
    expect(r.status).toBe(200);
    const g = (await http.get(`${base()}/assets/${s.asset}`).set(auth(admin))).body;
    expect(g.name).toBe("حاسوب مكتبي HP");
    expect(g.photoDataUrl).toBe(PNG);
    const h = (await http.get(`${base()}/assets/${s.asset}/history`).set(auth(admin))).body;
    expect(h[0].action).toBe("ASSET_UPDATE");
    expect(h[0].changes.map((c: { field: string }) => c.field)).toEqual(expect.arrayContaining(["name", "status"]));
    expect(h.at(-1).action).toBe("ASSET_CREATE");
  });

  it("الاستبعاد بسبب إلزامي، ولا تعديل بعده، ولا حذف", async () => {
    expect((await http.post(`${base()}/assets/${s.asset}/archive`).set(auth(admin)).send({})).status).toBe(400);
    const a = await http.post(`${base()}/assets/${s.asset}/archive`).set(auth(admin)).send({ reason: "عطب غير قابل للإصلاح" });
    expect(a.body.status).toBe("DISPOSED");
    expect((await http.put(`${base()}/assets/${s.asset}`).set(auth(admin)).send(asset())).body.error.code).toBe("ASSET_ARCHIVED");
    const active = (await http.get(`${base()}/assets?pageSize=200`).set(auth(admin))).body;
    expect(active.items.find((x: { id: string }) => x.id === s.asset)).toBeUndefined();
    expect((await http.get(`${base()}/assets?archived=1`).set(auth(admin))).body.total).toBe(1);
  });

  it("البحث والترقيم الصفحي", async () => {
    const r = (await http.get(`${base()}/assets?q=hp&archived=1`).set(auth(admin))).body;
    expect(r.total).toBe(1);
    const p = (await http.get(`${base()}/assets?pageSize=5&page=2`).set(auth(admin))).body;
    expect(p.items).toHaveLength(5);
    expect(p.total).toBeGreaterThan(20);
  });

  it("رمز QR يُحل إلى الممتلك لمن يصل إلى مؤسسته فقط", async () => {
    const a = (await http.get(`${base()}/assets/${s.asset}`).set(auth(admin))).body;
    expect((await http.get(`/api/v1/scan/${a.qrToken}`).set(auth(admin))).body).toEqual({ kind: "asset", id: s.asset, schoolId: sid });
    // مستخدم في مؤسسة أخرى لا يعرف حتى بوجوده
    const b = await http.post("/api/v1/schools").set(auth(admin)).send({ directorateId: (await prisma.school.findUniqueOrThrow({ where: { id: sid } })).directorateId, nameAr: "مؤسسة ب" });
    s.schoolB = b.body.id;
    const other = await userWithRole(http, admin, s.schoolB, "otheruser", ["DIRECTOR"]);
    expect((await http.get(`/api/v1/scan/${a.qrToken}`).set(auth(other.token))).status).toBe(404);
    expect((await http.get(`${base()}/assets/${s.asset}`).set(auth(other.token))).status).toBe(403);
    // ومحاولة قراءة ممتلك مؤسسة أ عبر مسار مؤسسة ب
    expect((await http.get(`/api/v1/schools/${s.schoolB}/assets/${s.asset}`).set(auth(other.token))).status).toBe(404);
  });
});

describe("المخزون", () => {
  const mv = (path: string, body: object, token = admin) => http.post(`${base()}/stock/movements/${path}`).set(auth(token)).send(body);
  const total = async () => (await http.get(`${base()}/stock/items`).set(auth(admin))).body.find((i: { id: string }) => i.id === s.item);

  it("المخازن والمواد", async () => {
    s.wh1 = (await http.post(`${base()}/warehouses`).set(auth(admin)).send({ code: "W1", name: "المستودع الرئيسي" })).body.id;
    s.wh2 = (await http.post(`${base()}/warehouses`).set(auth(admin)).send({ code: "W2", name: "خزانة الإدارة" })).body.id;
    const i = await http.post(`${base()}/stock/items`).set(auth(admin)).send({ code: "PAP-A4", name: "ورق A4", unitId: s.unit, minQuantity: 5, tracksExpiry: false });
    expect(i.status).toBe(201);
    s.item = i.body.id;
    expect((await total()).level).toBe("out"); // رصيد صفر مع حد أدنى 5 => نافد
  });

  it("الإدخال يزيد الرصيد برقم حركة متسلسل", async () => {
    const r = await mv("in", { itemId: s.item, warehouseId: s.wh1, quantity: 10, unitCost: 45.5, supplierId: s.supplier });
    expect(r.status).toBe(201);
    expect(r.body.movements[0]).toMatch(/^MV-\d{4}-00001$/);
    const t = await total();
    expect(t.total).toBe(10);
    expect(t.level).toBe("ok");
  });

  it("منع الصرف الزائد برسالة واضحة، والرصيد لا يتغير", async () => {
    const r = await mv("out", { itemId: s.item, warehouseId: s.wh1, quantity: 11, reason: "قسم 3" });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({ code: "STOCK_INSUFFICIENT", details: { available: 10, requested: 11 } });
    expect((await total()).total).toBe(10);
    expect((await mv("out", { itemId: s.item, warehouseId: s.wh1, quantity: 2 })).body.error.details.fields.reason).toBe("errors.required");
  });

  it("صرف متزامن: 10 طلبات × 3 على رصيد 10 ← تنجح 3 فقط والرصيد لا يصبح سالباً", async () => {
    const rs = await Promise.all(Array.from({ length: 10 }, (_, k) => mv("out", { itemId: s.item, warehouseId: s.wh1, quantity: 3, reason: `قسم ${k}` })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(3);
    expect(rs.filter((r) => r.status === 422)).toHaveLength(7);
    const t = await total();
    expect(t.total).toBe(1);
    expect(t.level).toBe("low");
  });

  it("إعادة إرسال نفس العملية (clientOpId) لا تكررها", async () => {
    const body = { itemId: s.item, warehouseId: s.wh1, quantity: 4, clientOpId: "op-abc-1" };
    const [a, b] = await Promise.all([mv("in", body), mv("in", body)]);
    expect([a.body.movements[0], b.body.movements[0]]).toEqual([a.body.movements[0], a.body.movements[0]]);
    expect((await total()).total).toBe(5);
    expect(await prisma.stockMovement.count({ where: { clientOpId: "op-abc-1" } })).toBe(1);
  });

  it("التحويل حركتان مرتبطتان، ويمنع التحويل لنفس المخزن", async () => {
    const r = await mv("transfer", { itemId: s.item, fromWarehouseId: s.wh1, toWarehouseId: s.wh2, quantity: 2 });
    expect(r.body.movements).toHaveLength(2);
    const t = await total();
    expect(t.balances).toEqual(expect.arrayContaining([{ warehouseId: s.wh1, quantity: 3 }, { warehouseId: s.wh2, quantity: 2 }]));
    expect((await mv("transfer", { itemId: s.item, fromWarehouseId: s.wh1, toWarehouseId: s.wh1, quantity: 1 })).body.error.details.fields.toWarehouseId).toBe("errors.sameWarehouse");
  });

  it("التسوية تتطلب stock.adjust وسبباً، وتسجل الفرق حركةً", async () => {
    const sm = await userWithRole(http, admin, sid, "stockmgr", ["STOCK_MANAGER"]);
    s.stockMgr = sm.token;
    const denied = await mv("adjust", { itemId: s.item, warehouseId: s.wh1, countedQuantity: 2, reason: "جرد" }, s.stockMgr);
    expect(denied.status).toBe(403);
    expect(denied.body.error.details.permission).toBe("stock.adjust");
    const r = await mv("adjust", { itemId: s.item, warehouseId: s.wh1, countedQuantity: 2, reason: "جرد شهري: نقص ورقة" });
    expect(r.status).toBe(201);
    expect((await mv("adjust", { itemId: s.item, warehouseId: s.wh1, countedQuantity: 2, reason: "جرد" })).body.error.code).toBe("NO_DIFFERENCE");
    const list = (await http.get(`${base()}/stock/movements?type=ADJUSTMENT`).set(auth(admin))).body.items;
    expect(list[0]).toMatchObject({ direction: -1, quantity: 1 });
  });

  it("العكس بدل الحذف: مرة واحدة فقط، ويعكس طرفي التحويل معاً", async () => {
    const list = (await http.get(`${base()}/stock/movements?type=TRANSFER_IN`).set(auth(admin))).body.items;
    const r = await http.post(`${base()}/stock/movements/${list[0].id}/reverse`).set(auth(s.stockMgr)).send({ reason: "خطأ في المخزن" });
    expect(r.status).toBe(200);
    expect(r.body.movements).toHaveLength(2);
    const t = await total();
    expect(t.balances).toEqual(expect.arrayContaining([{ warehouseId: s.wh1, quantity: 4 }, { warehouseId: s.wh2, quantity: 0 }]));
    const again = await http.post(`${base()}/stock/movements/${list[0].id}/reverse`).set(auth(admin)).send({ reason: "مرة ثانية" });
    expect(again.body.error.code).toBe("ALREADY_REVERSED");
    const rev = (await http.get(`${base()}/stock/movements?type=REVERSAL`).set(auth(admin))).body.items;
    expect(await http.post(`${base()}/stock/movements/${rev[0].id}/reverse`).set(auth(admin)).send({ reason: "س" }).then((x) => x.body.error.code)).toBe("CANNOT_REVERSE_REVERSAL");
  });

  it("عكس إدخال سبق صرفه مرفوض إن كان سيجعل الرصيد سالباً", async () => {
    const r = await mv("in", { itemId: s.item, warehouseId: s.wh2, quantity: 5 });
    await mv("out", { itemId: s.item, warehouseId: s.wh2, quantity: 4, reason: "قسم 1" });
    const m = (await http.get(`${base()}/stock/movements?warehouseId=${s.wh2}&type=IN`).set(auth(admin))).body.items.find((x: { number: string }) => x.number === r.body.movements[0]);
    const rev = await http.post(`${base()}/stock/movements/${m.id}/reverse`).set(auth(admin)).send({ reason: "إدخال خاطئ" });
    expect(rev.body.error.code).toBe("STOCK_INSUFFICIENT");
  });

  it("الرصيد = مجموع الحركات دائماً، ولا يُعدَّل مباشرة", async () => {
    const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT bool_and(b.quantity = COALESCE((SELECT SUM(m.quantity * m.direction) FROM stock_movements m WHERE m."itemId" = b."itemId" AND m."warehouseId" = b."warehouseId"), 0)) AS ok
      FROM stock_balances b`;
    expect(rows[0]!.ok).toBe(true);
    await expect(prisma.$executeRaw`UPDATE stock_balances SET quantity = -1`).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM stock_movements`).rejects.toThrow();
  });

  it("التنبيهات: منخفض ونافد وقرب انتهاء الصلاحية، وتظهر في لوحة القيادة", async () => {
    const milk = await http.post(`${base()}/stock/items`).set(auth(admin)).send({ code: "MILK", name: "حليب", unitId: s.unit, minQuantity: 0, tracksExpiry: true });
    const soon = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    await mv("in", { itemId: milk.body.id, warehouseId: s.wh1, quantity: 6, expiryDate: soon });
    expect((await mv("in", { itemId: s.item, warehouseId: s.wh1, quantity: 1, expiryDate: soon })).body.error.details.fields.expiryDate).toBe("errors.noExpiry");
    const ink = await http.post(`${base()}/stock/items`).set(auth(admin)).send({ code: "INK", name: "حبر", unitId: s.unit, minQuantity: 2, tracksExpiry: false });
    const a = (await http.get(`${base()}/stock/alerts`).set(auth(admin))).body;
    expect(a.expiring.map((x: { code: string }) => x.code)).toEqual(["MILK"]);
    expect(a.out.map((x: { id: string }) => x.id)).toContain(ink.body.id);
    const dash = (await http.get(`${base()}/dashboard/alerts`).set(auth(admin))).body;
    expect(dash.find((x: { kind: string }) => x.kind === "stockOut").count).toBeGreaterThanOrEqual(1);
  });

  it("الوحدة لا تتغير بعد وجود حركات", async () => {
    const box = (await http.get(`${base()}/lookups?listKey=UNIT_OF_MEASURE`).set(auth(admin))).body.find((u: { code: string }) => u.code === "BOX").id;
    const r = await http.put(`${base()}/stock/items/${s.item}`).set(auth(admin)).send({ code: "PAP-A4", name: "ورق A4", unitId: box, minQuantity: 5, tracksExpiry: false });
    expect(r.body.error.code).toBe("UNIT_LOCKED");
  });
});

describe("الصلاحيات حسب الدور", () => {
  it("مسؤول الممتلكات: الممتلكات نعم، المخزون لا، الموردون اطلاع فقط", async () => {
    const am = await userWithRole(http, admin, sid, "assetmgr", ["ASSET_MANAGER"]);
    expect((await http.get(`${base()}/assets`).set(auth(am.token))).status).toBe(200);
    expect((await http.get(`${base()}/stock/items`).set(auth(am.token))).status).toBe(403);
    expect((await http.get(`${base()}/suppliers`).set(auth(am.token))).status).toBe(200);
    expect((await http.post(`${base()}/suppliers`).set(auth(am.token)).send({ name: "س" })).status).toBe(403);
    // القوائم المرجعية يحتاجها كل نموذج
    expect((await http.get(`${base()}/categories`).set(auth(am.token))).status).toBe(200);
    expect((await http.post(`${base()}/categories`).set(auth(am.token)).send({ code: "X", nameAr: "س" })).status).toBe(403);
  });

  it("الاطلاع فقط: قراءة دون أي كتابة", async () => {
    const v = await userWithRole(http, admin, sid, "viewer4", ["VIEWER"]);
    expect((await http.get(`${base()}/stock/movements`).set(auth(v.token))).status).toBe(200);
    expect((await http.post(`${base()}/stock/movements/in`).set(auth(v.token)).send({ itemId: s.item, warehouseId: s.wh1, quantity: 1 })).status).toBe(403);
    expect((await http.post(`${base()}/assets`).set(auth(v.token)).send({})).status).toBe(403);
  });

  it("مسؤول المخزون يرى في آخر العمليات حركات المخزون باسم المنفذ", async () => {
    const act = (await http.get(`${base()}/dashboard/activity?limit=50`).set(auth(admin))).body;
    expect(act.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(["activity.stockOut", "activity.stockReverse", "activity.assetArchived"]));
  });
});
