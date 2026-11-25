import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type request from "supertest";
import { deflateSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { auth, bootApp, userWithRole } from "./helpers";
import type { PrismaService } from "../src/prisma/prisma.service";
import { imageSize } from "../src/floorplan/floorplan.service";

/**
 * المرحلة 8 (تتمة): المخطط التفاعلي (خلفية، أشكال نسبية، ألوان الحالة من البيانات الحية)
 * والمزامنة دون اتصال (عدم التكرار، التعارض، الرفض، الصلاحية لكل عملية).
 */
let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let admin = "";
let sid = "";
const s = { unit: "", wh: "", item: "", room1: "", room2: "", room3: "", fac: "", cat: "", asset: "" };
const u = {} as Record<"viewer" | "stock" | "inv", { token: string; id: string }>;
const base = () => `/api/v1/schools/${sid}`;
const get = (p: string, token = admin) => http.get(`${base()}${p}`).set(auth(token));
const post = (p: string, body: object = {}, token = admin) => http.post(`${base()}${p}`).set(auth(token)).send(body);
const put = (p: string, body: object = {}, token = admin) => http.put(`${base()}${p}`).set(auth(token)).send(body);
const today = () => new Date().toISOString().slice(0, 10);

/** صورة PNG حقيقية بالأبعاد المطلوبة. */
function png(w: number, h: number) {
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
  const raw = Buffer.alloc((w * 3 + 1) * h, 0xee);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;

beforeAll(async () => {
  ({ app, http, prisma, admin, schoolId: sid } = await bootApp());
  const types = (await get("/lookups?listKey=SPACE_TYPE")).body as { id: string; code: string }[];
  const cls = types.find((t) => t.code === "CLASSROOM")!.id;
  s.room1 = (await post("/rooms", { code: "R1", name: "القسم 1", spaceTypeId: cls, status: "GOOD" })).body.id;
  s.room2 = (await post("/rooms", { code: "R2", name: "القسم 2", spaceTypeId: cls, status: "GOOD" })).body.id;
  s.room3 = (await post("/rooms", { code: "R3", name: "القسم 3", spaceTypeId: cls, status: "OUT_OF_SERVICE" })).body.id;
  const ftypes = (await get("/lookups?listKey=FACILITY_TYPE")).body as { id: string; code: string }[];
  s.fac = (await post("/facilities", { code: "F1", name: "الساحة", facilityTypeId: ftypes[0]!.id, status: "GOOD" })).body.id;
  s.cat = (await post("/categories", { code: "P8", nameAr: "أثاث" })).body.id;
  s.asset = (await post("/assets", { name: "سبورة", categoryId: s.cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "DAMAGED", roomId: s.room2 })).body.id;
  await post("/assets", { name: "طاولة", categoryId: s.cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE", roomId: s.room1 });
  s.unit = (await get("/lookups?listKey=UNIT_OF_MEASURE")).body.find((x: { code: string }) => x.code === "PCS").id;
  s.wh = (await post("/warehouses", { code: "W1", name: "المستودع" })).body.id;
  s.item = (await post("/stock/items", { code: "CRAIE", name: "طباشير", unitId: s.unit, minQuantity: 0, tracksExpiry: false })).body.id;
  await post("/stock/movements/in", { itemId: s.item, warehouseId: s.wh, quantity: 10 });
  u.viewer = await userWithRole(http, admin, sid, "viewer8b", ["VIEWER"]);
  u.stock = await userWithRole(http, admin, sid, "stock8b", ["STOCK_MANAGER"]);
  u.inv = await userWithRole(http, admin, sid, "inv8b", ["INVENTORY_MANAGER"]);
});

afterAll(async () => {
  await app?.close();
});

describe("المخطط التفاعلي", () => {
  let plan = "";
  it("أبعاد الصورة تُقرأ من ترويستها", () => {
    expect(imageSize(png(120, 80))).toEqual({ width: 120, height: 80 });
    expect(imageSize(Buffer.from("not an image"))).toBeNull();
  });

  it("إنشاء بخلفية PNG، رفض ملف ليس صورة، وتنزيل الخلفية", async () => {
    expect((await post("/floor-plans", { name: "x", background: `data:image/png;base64,${Buffer.from("%PDF-1.4").toString("base64")}` })).status).toBe(400);
    expect((await post("/floor-plans", { name: "x", background: dataUrl(png(20, 20)) })).status).toBe(400); // صغيرة جداً
    const r = await post("/floor-plans", { name: "الطابق الأرضي", background: dataUrl(png(400, 250)) });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: "الطابق الأرضي", hasBackground: true, widthPx: 400, heightPx: 250, shapes: [] });
    plan = r.body.id;
    const bg = await get(`/floor-plans/${plan}/background`);
    expect(bg.headers["content-type"]).toBe("image/png");
    expect(bg.body.subarray(1, 4).toString()).toBe("PNG");
    expect((await post("/floor-plans", { name: "y" }, u.viewer.token)).status).toBe(403);
  });

  it("الأشكال: تحقق من الهندسة والنطاق النسبي ومن تبعية الفضاء للمؤسسة", async () => {
    const bad = [
      { kind: "RECTANGLE", geometry: { x: 0.1, y: 0.1, r: 0.2 } }, // هندسة لا تطابق النوع
      { kind: "MARKER", geometry: { x: 1.4, y: 0.1 } }, // خارج المخطط
      { kind: "POLYGON", geometry: { points: [0.1, 0.1, 0.2, 0.2] } }, // أقل من 3 نقاط
      { kind: "MARKER", geometry: { x: 0.1, y: 0.1 }, roomId: randomUUID() }, // فضاء غير موجود
    ];
    for (const b of bad) expect((await put(`/floor-plans/${plan}/shapes`, { shapes: [b] })).status).toBe(400);
  });

  it("ألوان الحالة تُحسب من البيانات الحية: سليم، تنبيه (معطوب/صيانة)، خارج الخدمة، غير مرتبط", async () => {
    const r = await put(`/floor-plans/${plan}/shapes`, {
      shapes: [
        { kind: "RECTANGLE", geometry: { x: 0.05, y: 0.05, w: 0.3, h: 0.3 }, roomId: s.room1, label: "Q1" },
        { kind: "POLYGON", geometry: { points: [0.4, 0.05, 0.7, 0.05, 0.7, 0.35, 0.4, 0.35] }, roomId: s.room2 },
        { kind: "CIRCLE", geometry: { x: 0.85, y: 0.2, r: 0.1 }, roomId: s.room3 },
        { kind: "RECTANGLE", geometry: { x: 0.05, y: 0.5, w: 0.9, h: 0.4 }, facilityId: s.fac },
        { kind: "MARKER", geometry: { x: 0.5, y: 0.45 }, label: "المدخل" },
      ],
    });
    expect(r.status).toBe(200);
    const by = (i: number) => r.body.shapes[i].status;
    expect(by(0)).toMatchObject({ level: "GOOD", targetCode: "R1", assets: 1, damagedAssets: 0 });
    expect(by(1)).toMatchObject({ level: "WARN", targetCode: "R2", damagedAssets: 1 });
    expect(by(2)).toMatchObject({ level: "BAD", spaceStatus: "OUT_OF_SERVICE" });
    expect(by(3)).toMatchObject({ level: "GOOD", targetCode: "F1" });
    expect(by(4)).toMatchObject({ level: "NONE" });
    // طلب صيانة مفتوح على الساحة يحولها إلى تنبيه
    await post("/maintenance/requests", { targetType: "facility", targetId: s.fac, type: "CORRECTIVE", description: "حفرة في الأرضية", urgency: "HIGH" });
    const g = await get(`/floor-plans/${plan}`, u.viewer.token);
    expect(g.body.shapes.find((x: { facilityId?: string }) => x.facilityId === s.fac).status).toMatchObject({ level: "WARN", openMaintenance: 1 });
    expect((await put(`/floor-plans/${plan}/shapes`, { shapes: [] }, u.viewer.token)).status).toBe(403);
    expect((await get("/floor-plans")).body[0]).toMatchObject({ id: plan, shapeCount: 5 });
  });

  it("تعديل الاسم وإزالة الخلفية، والحذف يُبقي الأشكال في سجل التدقيق", async () => {
    const r = await put(`/floor-plans/${plan}`, { name: "الطابق الأرضي (معدل)", background: "" });
    expect(r.body).toMatchObject({ name: "الطابق الأرضي (معدل)", hasBackground: false });
    expect((await get(`/floor-plans/${plan}/background`)).status).toBe(404);
    expect((await http.delete(`${base()}/floor-plans/${plan}`).set(auth(admin))).status).toBe(200);
    expect((await get(`/floor-plans/${plan}`)).status).toBe(404);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: plan, action: "FLOORPLAN_DELETE" } });
    expect((log.before as { shapes: unknown[] }).shapes).toHaveLength(5);
  });
});

describe("المزامنة دون اتصال", () => {
  const op = (operation: string, payload: object, at = new Date()) => ({ clientOpId: randomUUID(), operation, payload, clientCreatedAt: at.toISOString() });
  const sync = (operations: object[], token = admin, deviceId = "tablet-1") => post("/sync", { deviceId, operations }, token);
  const balance = async () => (await prisma.stockBalance.findMany({ where: { itemId: s.item } })).reduce((a, b) => a + Number(b.quantity), 0);

  it("نفس الدفعة مرتين (أو متزامنة) تُطبَّق مرة واحدة", async () => {
    const before = await balance();
    const batch = [op("stock.out", { itemId: s.item, warehouseId: s.wh, quantity: 2, reason: "توزيع دون اتصال" }), op("stock.in", { itemId: s.item, warehouseId: s.wh, quantity: 1 })];
    const r1 = await sync(batch, u.stock.token);
    expect(r1.status).toBe(200);
    expect(r1.body.results.map((x: { status: string }) => x.status)).toEqual(["APPLIED", "APPLIED"]);
    const r2 = await sync(batch, u.stock.token);
    expect(r2.body.results.every((x: { status: string; replayed: boolean }) => x.status === "APPLIED" && x.replayed)).toBe(true);
    await Promise.all([sync(batch, u.stock.token), sync(batch, u.stock.token)]);
    expect(await balance()).toBe(before - 1);
    expect(await prisma.stockMovement.count({ where: { clientOpId: { in: batch.map((b) => b.clientOpId) } } })).toBe(2);
  });

  it("رصيد غير كاف وقت المزامنة: تعارض لا يُطبَّق، ولا يمنع بقية الدفعة", async () => {
    const before = await balance();
    const r = await sync([op("stock.out", { itemId: s.item, warehouseId: s.wh, quantity: 999, reason: "x" }), op("stock.out", { itemId: s.item, warehouseId: s.wh, quantity: 1, reason: "y" })], u.stock.token);
    expect(r.body.results[0]).toMatchObject({ status: "CONFLICT", error: "STOCK_INSUFFICIENT" });
    expect(r.body.results[1].status).toBe("APPLIED");
    expect(await balance()).toBe(before - 1);
  });

  it("الصلاحية والتحقق لكل عملية، وعملية مستخدم آخر لا تُكشف", async () => {
    const o = op("stock.out", { itemId: s.item, warehouseId: s.wh, quantity: 1, reason: "z" });
    expect((await sync([o], u.viewer.token)).body.results[0]).toMatchObject({ status: "REJECTED", error: "FORBIDDEN" });
    expect((await sync([o], u.stock.token)).body.results[0]).toMatchObject({ status: "REJECTED", error: "FOREIGN_OPERATION" });
    expect((await sync([op("stock.out", { itemId: s.item, warehouseId: s.wh, quantity: 1 })], u.stock.token)).body.results[0]).toMatchObject({ status: "REJECTED", error: "VALIDATION_ERROR" });
    expect((await sync([op("asset.delete", {})], u.stock.token)).status).toBe(400);
    expect((await sync([], u.stock.token)).status).toBe(400);
    const h = await get("/sync", u.stock.token);
    expect(h.body.length).toBeGreaterThanOrEqual(5);
    expect(h.body.every((x: { deviceId: string }) => x.deviceId === "tablet-1")).toBe(true);
  });

  it("عدّ جرد دون اتصال: يُطبَّق، ولا يكتب فوق عدّ أحدث من مستخدم آخر", async () => {
    const inv = (await post("/inventory-sessions", { type: "ANNUAL", startDate: today(), endDate: today(), includesStock: false, roomIds: [s.room1, s.room2], assigneeIds: [] })).body.id;
    await post(`/inventory-sessions/${inv}/open`);
    const lines = (await get(`/inventory-sessions/${inv}/lines`)).body as { id: string; countedQty?: number }[];
    const [a, b] = lines;
    const old = new Date(Date.now() - 3600_000);
    const r = await sync([op("inventory.count", { sessionId: inv, lineId: a!.id, countedQty: 1 }, old)], u.inv.token);
    expect(r.body.results[0]).toMatchObject({ status: "APPLIED", resultRef: a!.id });
    // المدير عدّ السطر الثاني الآن، ثم وصل عدّ قديم من جهاز آخر
    await post(`/inventory-sessions/${inv}/counts`, { lineId: b!.id, countedQty: 1 });
    const c = await sync([op("inventory.count", { sessionId: inv, lineId: b!.id, countedQty: 0 }, old)], u.inv.token);
    expect(c.body.results[0]).toMatchObject({ status: "CONFLICT", error: "COUNT_NEWER" });
    const after = (await get(`/inventory-sessions/${inv}/lines`)).body as { id: string; countedQty?: number }[];
    expect(after.find((l) => l.id === b!.id)!.countedQty).toBe(1);
    // الجلسة أُغلقت للعد قبل وصول العملية
    await post(`/inventory-sessions/${inv}/complete`);
    expect((await sync([op("inventory.count", { sessionId: inv, lineId: a!.id, countedQty: 1 })], u.inv.token)).body.results[0]).toMatchObject({ status: "CONFLICT", error: "SESSION_NOT_OPEN" });
  });
});
