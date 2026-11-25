import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type request from "supertest";
import { auth, bootApp, userWithRole } from "./helpers";
import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * المرحلة 6: الصيانة، العهدة، الجرد، الطلبيات — اختبارات المسارات وانتقالات الحالات على PostgreSQL حقيقي.
 * كل مسار يُختبر بانتقالاته المسموحة والممنوعة وأثره على الممتلك/الفضاء/المخزون.
 */
let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let admin = "";
let sid = "";
const s = {
  room1: "",
  room2: "",
  cat: "",
  asset: "",
  asset2: "",
  teacher: "",
  teacher2: "",
  supplier: "",
  wh: "",
  item: "",
  unit: "",
  director: { token: "", id: "" },
  stockMgr: { token: "", id: "" },
  viewer: { token: "", id: "" },
  viewer2: { token: "", id: "" },
};
const base = () => `/api/v1/schools/${sid}`;
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const year = new Date().getFullYear();
const get = (path: string, token = admin) => http.get(`${base()}${path}`).set(auth(token));
const post = (path: string, body: object = {}, token = admin) => http.post(`${base()}${path}`).set(auth(token)).send(body);
const put = (path: string, body: object, token = admin) => http.put(`${base()}${path}`).set(auth(token)).send(body);
const assetOf = (id: string) => prisma.asset.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  ({ app, http, prisma, admin, schoolId: sid } = await bootApp());
  const types = (await get("/lookups?listKey=SPACE_TYPE")).body as { id: string; code: string }[];
  const classroom = types.find((t) => t.code === "CLASSROOM")!.id;
  s.room1 = (await post("/rooms", { code: "R1", name: "القسم 1", spaceTypeId: classroom, status: "GOOD" })).body.id;
  s.room2 = (await post("/rooms", { code: "R2", name: "القسم 2", spaceTypeId: classroom, status: "GOOD" })).body.id;
  s.cat = (await post("/categories", { code: "MOB", nameAr: "أثاث" })).body.id;
  s.teacher = (await post("/staff", { fullNameAr: "أستاذة أولى", type: "TEACHER" })).body.id;
  s.teacher2 = (await post("/staff", { fullNameAr: "أستاذ ثان", type: "TEACHER" })).body.id;
  s.asset = (await post("/assets", { name: "سبورة بيضاء", categoryId: s.cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE", roomId: s.room1 })).body.id;
  s.asset2 = (await post("/assets", { name: "خزانة", categoryId: s.cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE", roomId: s.room1 })).body.id;
  s.supplier = (await post("/suppliers", { name: "مورد الاختبار" })).body.id;
  s.wh = (await post("/warehouses", { code: "W1", name: "المستودع" })).body.id;
  s.unit = (await get("/lookups?listKey=UNIT_OF_MEASURE")).body.find((u: { code: string }) => u.code === "PCS").id;
  s.item = (await post("/stock/items", { code: "CHALK", name: "طباشير", unitId: s.unit, minQuantity: 0, tracksExpiry: false })).body.id;
  await post("/stock/movements/in", { itemId: s.item, warehouseId: s.wh, quantity: 20, unitCost: 2 });
  s.director = await userWithRole(http, admin, sid, "director1", ["DIRECTOR"]);
  s.stockMgr = await userWithRole(http, admin, sid, "stock1", ["STOCK_MANAGER"]);
  s.viewer = await userWithRole(http, admin, sid, "viewer1", ["VIEWER"]);
  s.viewer2 = await userWithRole(http, admin, sid, "viewer2", ["VIEWER"]);
});
afterAll(async () => {
  await app?.close();
});

// =====================================================================
describe("الصيانة: المسار والانتقالات", () => {
  let req1 = "";

  it("التبليغ عن عطب ممتلك يرقّم الطلب ويجعل الممتلك «معطَّباً»", async () => {
    const dmg = (await get("/lookups?listKey=DAMAGE_TYPE")).body.find((d: { code: string }) => d.code === "FURNITURE").id;
    const r = await post("/maintenance/requests", { targetType: "asset", targetId: s.asset, type: "CORRECTIVE", damageTypeId: dmg, description: "إطار مكسور", urgency: "HIGH", clientOpId: "op-m1" });
    expect(r.status).toBe(201);
    expect(r.body.number).toBe(`MR-${year}-00001`);
    req1 = r.body.id;
    expect((await assetOf(s.asset)).status).toBe("DAMAGED");
    // إعادة الإرسال بنفس المعرف لا تنشئ طلباً ثانياً
    const again = await post("/maintenance/requests", { targetType: "asset", targetId: s.asset, type: "CORRECTIVE", description: "إطار مكسور", urgency: "HIGH", clientOpId: "op-m1" });
    expect(again.body).toMatchObject({ id: req1, replayed: true });
    expect((await get("/maintenance/requests")).body.total).toBe(1);
    // التنبيه في لوحة القيادة (استعجال مرتفع)
    const alerts = (await get("/dashboard/alerts")).body as { kind: string; count: number }[];
    expect(alerts.find((a) => a.kind === "maintenanceUrgent")?.count).toBe(1);
  });

  it("هدف من خارج المؤسسة أو نوع غير معروف مرفوض", async () => {
    const r = await post("/maintenance/requests", { targetType: "asset", targetId: "00000000-0000-4000-8000-000000000000", type: "CORRECTIVE", description: "x", urgency: "LOW" });
    expect(r.body.error.details.fields.targetId).toBe("errors.invalidChoice");
    const r2 = await post("/maintenance/requests", { targetType: "car", targetId: s.asset, type: "CORRECTIVE", description: "x", urgency: "LOW" });
    expect(r2.status).toBe(400);
  });

  it("الانتقالات الممنوعة تُرفض، والإغلاق المبكر يتطلب ملاحظة", async () => {
    const bad = await post(`/maintenance/requests/${req1}/transition`, { to: "REPAIRED" });
    expect(bad.body.error).toMatchObject({ code: "INVALID_TRANSITION", details: { from: "NEW", to: "REPAIRED" } });
    const noNote = await post(`/maintenance/requests/${req1}/transition`, { to: "CLOSED" });
    expect(noNote.body.error.details.fields.note).toBe("errors.closeNeedsNote");
    // لا تدخل على طلب جديد قبل دراسته
    expect((await post(`/maintenance/requests/${req1}/records`, { outcome: "IN_REPAIR" })).body.error.code).toBe("RECORD_NOT_ALLOWED");
    expect((await post(`/maintenance/requests/${req1}/transition`, { to: "UNDER_REVIEW" })).body.status).toBe("UNDER_REVIEW");
  });

  it("التدخل بفاتورة ينقل إلى «تم الإصلاح» ويعيد الممتلك متاحاً، ثم الإغلاق يجمّد الطلب", async () => {
    // «تم الإصلاح» يتطلب تاريخ الإصلاح
    const noDate = await post(`/maintenance/requests/${req1}/records`, { outcome: "REPAIRED", cost: 300 });
    expect(noDate.body.error.details.fields.repairedAt).toBe("errors.required");
    const rec = await post(`/maintenance/requests/${req1}/records`, {
      contractor: "نجار الحي",
      cost: 350,
      interventionReport: "تغيير الإطار",
      startedAt: today(),
      repairedAt: today(),
      outcome: "REPAIRED",
      invoice: { supplierId: s.supplier, invoiceNumber: "F-100", invoiceDate: today(), amount: 350 },
    });
    expect(rec.status).toBe(201);
    const d = (await get(`/maintenance/requests/${req1}`)).body;
    expect(d).toMatchObject({ status: "REPAIRED", totalCost: 350 });
    expect(d.records[0]).toMatchObject({ contractor: "نجار الحي", outcome: "REPAIRED", invoice: { number: "F-100", amount: 350 } });
    expect((await assetOf(s.asset)).status).toBe("AVAILABLE");
    // فاتورة مكررة لنفس المورد
    const r2 = (await post("/maintenance/requests", { targetType: "asset", targetId: s.asset2, type: "CORRECTIVE", description: "باب", urgency: "LOW" })).body.id;
    await post(`/maintenance/requests/${r2}/transition`, { to: "UNDER_REVIEW" });
    const dup = await post(`/maintenance/requests/${r2}/records`, { outcome: "IN_REPAIR", invoice: { supplierId: s.supplier, invoiceNumber: "F-100", invoiceDate: today(), amount: 10 } });
    expect(dup.body.error.code).toBe("DUPLICATE_INVOICE");
    // من «قيد الدراسة» مع نتيجة «قيد الإصلاح» ينتقل تلقائياً ويصبح الممتلك «قيد الإصلاح»
    expect((await post(`/maintenance/requests/${r2}/records`, { outcome: "IN_REPAIR", contractor: "ورشة" })).status).toBe(201);
    expect((await get(`/maintenance/requests/${r2}`)).body.status).toBe("IN_REPAIR");
    expect((await assetOf(s.asset2)).status).toBe("UNDER_REPAIR");

    expect((await post(`/maintenance/requests/${req1}/transition`, { to: "CLOSED" })).body.status).toBe("CLOSED");
    expect((await put(`/maintenance/requests/${req1}`, { description: "تعديل", urgency: "LOW" })).body.error.code).toBe("MAINTENANCE_CLOSED");
    expect((await post(`/maintenance/requests/${req1}/transition`, { to: "UNDER_REVIEW" })).body.error.code).toBe("INVALID_TRANSITION");
    expect((await post(`/maintenance/requests/${req1}/records`, { outcome: "IN_REPAIR" })).body.error.code).toBe("RECORD_NOT_ALLOWED");
    expect((await get("/maintenance/requests?open=1")).body.total).toBe(1);
  });

  it("عطب فضاء: «يحتاج صيانة» ثم «خارج الخدمة» إن تعذر الإصلاح", async () => {
    const r = (await post("/maintenance/requests", { targetType: "room", targetId: s.room2, type: "EMERGENCY", description: "تسرب ماء", urgency: "CRITICAL" })).body.id;
    const room = () => prisma.room.findUniqueOrThrow({ where: { id: s.room2 } });
    expect((await room()).status).toBe("NEEDS_MAINTENANCE");
    await post(`/maintenance/requests/${r}/transition`, { to: "UNDER_REVIEW" });
    expect((await post(`/maintenance/requests/${r}/transition`, { to: "UNREPAIRABLE" })).body.status).toBe("UNREPAIRABLE");
    expect((await room()).status).toBe("OUT_OF_SERVICE");
    expect((await post(`/maintenance/requests/${r}/transition`, { to: "CLOSED" })).body.status).toBe("CLOSED");
    // نعيد الفضاء للحالة الجيدة لبقية الاختبارات
    await prisma.room.update({ where: { id: s.room2 }, data: { status: "GOOD" } });
  });

  it("الصيانة الوقائية: جدولة حلّ موعدها تنبّه، والتوليد ينشئ طلباً وقائياً ويؤجل الموعد", async () => {
    const sc = await post("/maintenance/schedules", { title: "فحص السبورة", targetType: "asset", targetId: s.asset, intervalDays: 90, nextDueAt: inDays(3), remindDaysBefore: 7 });
    expect(sc.status).toBe(201);
    const list = (await get("/maintenance/schedules")).body;
    expect(list[0]).toMatchObject({ title: "فحص السبورة", dueSoon: true, overdue: false });
    const alerts = (await get("/dashboard/alerts")).body as { kind: string; count: number }[];
    expect(alerts.find((a) => a.kind === "maintenanceDue")?.count).toBe(1);
    const g = await post(`/maintenance/schedules/${sc.body.id}/generate`);
    expect(g.status).toBe(201);
    const d = (await get(`/maintenance/requests/${g.body.id}`)).body;
    expect(d).toMatchObject({ type: "PREVENTIVE", status: "NEW", schedule: { title: "فحص السبورة" } });
    expect((await assetOf(s.asset)).status).toBe("AVAILABLE"); // الوقائية لا تعطّب الممتلك
    expect((await get("/maintenance/schedules")).body[0].nextDueAt).toBe(inDays(93));
    await put(`/maintenance/schedules/${sc.body.id}`, { title: "فحص السبورة", targetType: "asset", targetId: s.asset, intervalDays: 90, nextDueAt: inDays(93), remindDaysBefore: 7, isActive: false });
    expect((await post(`/maintenance/schedules/${sc.body.id}/generate`)).body.error.code).toBe("SCHEDULE_INACTIVE");
  });

  it("الصلاحيات: المطّلع يرى ولا ينشئ", async () => {
    expect((await get("/maintenance/requests", s.viewer.token)).status).toBe(200);
    expect((await post("/maintenance/requests", { targetType: "asset", targetId: s.asset, type: "CORRECTIVE", description: "x", urgency: "LOW" }, s.viewer.token)).status).toBe(403);
  });
});

// =====================================================================
describe("العهدة: التسليم والنقل والتحويل والإرجاع", () => {
  it("الإسناد يحدّث المسؤول ويظهر في سجل الممتلك، وتكراره لنفس الشخص مرفوض", async () => {
    const r = await post("/custody", { action: "ASSIGNMENT", assetId: s.asset, toStaffId: s.teacher, notes: "بداية الموسم" });
    expect(r.status).toBe(201);
    expect(r.body.number).toBe(`CU-${year}-00001`);
    expect((await assetOf(s.asset)).responsibleStaffId).toBe(s.teacher);
    const hist = (await get(`/assets/${s.asset}/history`)).body as { action: string }[];
    expect(hist[0]!.action).toBe("CUSTODY_ASSIGNMENT");
    expect((await post("/custody", { action: "ASSIGNMENT", assetId: s.asset, toStaffId: s.teacher })).body.error.code).toBe("SAME_CUSTODIAN");
    // الحقول المطلوبة حسب نوع العملية
    expect((await post("/custody", { action: "HANDOVER", assetId: s.asset })).body.error.details.fields.toStaffId).toBe("errors.required");
    expect((await post("/custody", { action: "RELOCATION", assetId: s.asset })).body.error.details.fields.toRoomId).toBe("errors.required");
  });

  it("التحويل بين عهدتين ثم النقل بين فضاءين يحفظ سجل المواقع", async () => {
    expect((await post("/custody", { action: "TRANSFER", assetId: s.asset, toStaffId: s.teacher2 })).status).toBe(201);
    expect((await post("/custody", { action: "RELOCATION", assetId: s.asset, toRoomId: s.room1 })).body.error.code).toBe("SAME_ROOM");
    expect((await post("/custody", { action: "RELOCATION", assetId: s.asset, toRoomId: s.room2 })).status).toBe(201);
    const a = await assetOf(s.asset);
    expect([a.responsibleStaffId, a.roomId]).toEqual([s.teacher2, s.room2]);
    const locs = await prisma.assetLocation.findMany({ where: { assetId: s.asset }, orderBy: { fromDate: "asc" } });
    expect(locs.map((l) => [l.roomId, l.toDate === null])).toEqual([[s.room1, false], [s.room2, true]]);
  });

  it("الإرجاع يفرغ العهدة، ولا إرجاع ولا تحويل بلا مسؤول حالي", async () => {
    expect((await post("/custody", { action: "RETURN", assetId: s.asset, toRoomId: s.room1 })).status).toBe(201);
    const a = await assetOf(s.asset);
    expect([a.responsibleStaffId, a.roomId]).toEqual([null, s.room1]);
    expect((await post("/custody", { action: "RETURN", assetId: s.asset })).body.error.code).toBe("NO_CURRENT_CUSTODIAN");
    expect((await post("/custody", { action: "TRANSFER", assetId: s.asset, toStaffId: s.teacher })).body.error.code).toBe("NO_CURRENT_CUSTODIAN");
    const list = (await get(`/custody?assetId=${s.asset}`)).body;
    expect(list.total).toBe(4);
    expect(new Set(list.items.map((x: { action: string }) => x.action))).toEqual(new Set(["ASSIGNMENT", "TRANSFER", "RELOCATION", "RETURN"]));
    const one = (await get(`/custody/${list.items[0].id}`)).body;
    expect(one.by).toBe("مدير النظام");
  });

  it("تزامن: إسنادان متزامنان لنفس الشخص ينجح أحدهما فقط", async () => {
    const [x, y] = await Promise.all([
      post("/custody", { action: "HANDOVER", assetId: s.asset2, toStaffId: s.teacher }),
      post("/custody", { action: "HANDOVER", assetId: s.asset2, toStaffId: s.teacher }),
    ]);
    expect([x.status, y.status].sort()).toEqual([201, 422]);
    expect(await prisma.custodyRecord.count({ where: { assetId: s.asset2 } })).toBe(1);
  });

  it("المطّلع لا ينشئ عملية عهدة", async () => {
    expect((await post("/custody", { action: "HANDOVER", assetId: s.asset, toStaffId: s.teacher }, s.viewer.token)).status).toBe(403);
  });
});

// =====================================================================
describe("الجرد: اللقطة والعدّ والفروقات والمصادقة", () => {
  let inv = "";
  type L = { id: string; kind: string; ref: string; name: string; expectedQty: number; countedQty?: number; issues: string[]; isUnexpected: boolean };
  const lines = async (q = "") => (await get(`/inventory-sessions/${inv}/lines${q}`)).body as L[];

  it("الإنشاء: تاريخ النهاية قبل البداية مرفوض، والمسودة قابلة للتعديل", async () => {
    const bad = await post("/inventory-sessions", { type: "ANNUAL", startDate: today(), endDate: inDays(-1), includesStock: true, roomIds: [s.room1], assigneeIds: [] });
    expect(bad.body.error.details.fields.endDate).toBe("errors.endBeforeStart");
    const r = await post("/inventory-sessions", { type: "ANNUAL", startDate: today(), endDate: inDays(7), includesStock: true, roomIds: [s.room1], assigneeIds: [s.viewer.id] });
    expect(r.status).toBe(201);
    expect(r.body.number).toBe(`INV-${year}-001`);
    inv = r.body.id;
    expect((await put(`/inventory-sessions/${inv}`, { type: "ANNUAL", startDate: today(), endDate: inDays(10), includesStock: true, roomIds: [s.room1], assigneeIds: [s.viewer.id] })).status).toBe(200);
    expect((await post(`/inventory-sessions/${inv}/counts`, { lineId: "00000000-0000-4000-8000-000000000000", countedQty: 1 })).body.error.code).toBe("SESSION_NOT_OPEN");
  });

  it("الفتح يأخذ لقطة نظرية ثابتة: ممتلكات الفضاء المحدد ومواد المخزون بأرصدتها", async () => {
    expect((await post(`/inventory-sessions/${inv}/validate`, { reportNotes: "x" })).body.error.code).toBe("INVALID_TRANSITION");
    expect((await post(`/inventory-sessions/${inv}/open`)).body.status).toBe("OPEN");
    const ls = await lines();
    // R1 فيه السبورة (أُرجعت إليه) والخزانة؛ المخزون: الطباشير 20
    expect(ls.map((l) => [l.kind, l.name, l.expectedQty]).sort()).toEqual([
      ["ASSET", "خزانة", 1],
      ["ASSET", "سبورة بيضاء", 1],
      ["STOCK_ITEM", "طباشير", 20],
    ]);
    // اللقطة لا تتغير بإضافة ممتلك بعد الفتح، والتعديل ممنوع خارج المسودة
    await post("/assets", { name: "كرسي جديد", categoryId: s.cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE", roomId: s.room1 });
    expect(await lines()).toHaveLength(3);
    expect((await put(`/inventory-sessions/${inv}`, { type: "ANNUAL", startDate: today(), endDate: inDays(10), includesStock: false, roomIds: [], assigneeIds: [] })).body.error.code).toBe("SESSION_NOT_DRAFT");
    expect((await post(`/inventory-sessions/${inv}/open`)).body.error.code).toBe("INVALID_TRANSITION");
  });

  it("العدّ: المكلَّف فقط (أو صاحب صلاحية المصادقة)، وبالسطر أو بمسح QR", async () => {
    const ls = await lines();
    const board = ls.find((l) => l.name === "سبورة بيضاء")!;
    // مطّلع غير مكلَّف
    expect((await post(`/inventory-sessions/${inv}/counts`, { lineId: board.id, countedQty: 1 }, s.viewer2.token)).status).toBe(403);
    // المكلَّف: السبورة وُجدت في R2 (في غير مكانها)
    const c = await post(`/inventory-sessions/${inv}/counts`, { lineId: board.id, countedQty: 1, foundRoomId: s.room2, conditionFound: "خدوش", clientOpId: "op-c1" }, s.viewer.token);
    expect(c.body).toMatchObject({ lineId: board.id, replayed: false });
    expect((await post(`/inventory-sessions/${inv}/counts`, { lineId: board.id, countedQty: 1, clientOpId: "op-c1" }, s.viewer.token)).body.replayed).toBe(true);
    // الخزانة مفقودة
    const cab = ls.find((l) => l.name === "خزانة")!;
    await post(`/inventory-sessions/${inv}/counts`, { lineId: cab.id, countedQty: 0, notes: "لم يُعثر عليها" });
    // ممتلك خارج اللقطة يُمسح: سطر «غير متوقع»
    const chair = await prisma.asset.findFirstOrThrow({ where: { name: "كرسي جديد" } });
    const u = await post(`/inventory-sessions/${inv}/counts`, { qrToken: chair.qrToken, countedQty: 1, foundRoomId: s.room1 });
    expect(u.body.unexpected).toBe(true);
    expect((await post(`/inventory-sessions/${inv}/counts`, { qrToken: "00000000-0000-4000-8000-000000000000", countedQty: 1 })).body.error.code).toBe("QR_UNKNOWN");
    expect((await post(`/inventory-sessions/${inv}/counts`, { countedQty: 1 })).body.error.details.fields.lineId).toBe("errors.required");
    expect((await lines("?filter=pending")).map((l) => l.name)).toEqual(["طباشير"]);
  });

  it("الفروقات: مفقود، في غير مكانه، غير متوقع، غير معدود بعد انتهاء العد", async () => {
    expect((await post(`/inventory-sessions/${inv}/complete`)).body.status).toBe("COUNTING_DONE");
    expect((await post(`/inventory-sessions/${inv}/counts`, { lineId: "00000000-0000-4000-8000-000000000000", countedQty: 1 })).body.error.code).toBe("SESSION_NOT_OPEN");
    const d = (await get(`/inventory-sessions/${inv}/discrepancies`)).body;
    const names = (k: string) => d[k].map((l: L) => l.name);
    expect(names("missing")).toEqual(["خزانة"]);
    expect(names("misplaced")).toEqual(["سبورة بيضاء"]);
    expect(names("unexpected")).toEqual(["كرسي جديد"]);
    expect(names("notCounted")).toEqual(["طباشير"]);
    expect(names("condition")).toEqual(["سبورة بيضاء"]);
    expect(d.totals).toEqual({ lines: 4, counted: 3 });
    // إعادة الفتح لعدّ المخزون: فائض
    expect((await post(`/inventory-sessions/${inv}/reopen`)).body.status).toBe("OPEN");
    const chalk = (await lines()).find((l) => l.name === "طباشير")!;
    await post(`/inventory-sessions/${inv}/counts`, { lineId: chalk.id, countedQty: 22 });
    await post(`/inventory-sessions/${inv}/complete`);
    expect((await get(`/inventory-sessions/${inv}/discrepancies`)).body.surplus.map((l: L) => l.name)).toEqual(["طباشير"]);
    // الجرد لا يغيّر الرصيد مباشرة (لا تلاعب بالأرصدة)
    const bal = await prisma.stockBalance.aggregate({ where: { itemId: s.item }, _sum: { quantity: true } });
    expect(Number(bal._sum.quantity)).toBe(20);
  });

  it("المصادقة بمحضر، ثم الإغلاق والأرشفة؛ الدورات السابقة محفوظة", async () => {
    expect((await post(`/inventory-sessions/${inv}/validate`, {})).body.error.details.fields.reportNotes).toBe("errors.required");
    // المطّلع لا يصادق
    expect((await post(`/inventory-sessions/${inv}/validate`, { reportNotes: "x" }, s.viewer.token)).status).toBe(403);
    expect((await post(`/inventory-sessions/${inv}/close`)).body.error.code).toBe("INVALID_TRANSITION");
    expect((await post(`/inventory-sessions/${inv}/validate`, { reportNotes: "خزانة مفقودة تُبلَّغ للإدارة" }, s.director.token)).body.status).toBe("VALIDATED");
    expect((await post(`/inventory-sessions/${inv}/reopen`)).body.error.code).toBe("INVALID_TRANSITION");
    expect((await post(`/inventory-sessions/${inv}/close`)).body.status).toBe("CLOSED");
    expect((await post(`/inventory-sessions/${inv}/archive`)).body.status).toBe("ARCHIVED");
    const g = (await get(`/inventory-sessions/${inv}`)).body;
    expect(g).toMatchObject({ status: "ARCHIVED", reportNotes: "خزانة مفقودة تُبلَّغ للإدارة", validatedBy: "director1", stats: { lines: 4, counted: 4 } });
    expect((await get("/inventory-sessions")).body).toHaveLength(1);
    const audit = await prisma.auditLog.findMany({ where: { entityId: inv }, orderBy: { id: "asc" } });
    expect(audit.map((a) => a.action)).toEqual([
      "INVENTORY_CREATE",
      "INVENTORY_UPDATE",
      "INVENTORY_OPEN",
      "INVENTORY_COUNTING_DONE",
      "INVENTORY_OPEN",
      "INVENTORY_COUNTING_DONE",
      "INVENTORY_VALIDATED",
      "INVENTORY_CLOSED",
      "INVENTORY_ARCHIVED",
    ]);
  });
});

// =====================================================================
describe("الطلبيات: مسار مصادقة مرن، التسلم الجزئي، الإدخال، الفوترة والإغلاق", () => {
  let wfDefault = "";
  let po = "";
  let association = "";
  type Po = { id: string; status: string; items: { id: string; targetKind: string; accepted: number }[]; approvals: { stepId: string; decision: string; decidedBy?: string }[]; deliveries: { items: { id: string; purchaseOrderItemId: string; postedAt?: string }[] }[] };
  const getPo = async (id = po) => (await get(`/purchase-orders/${id}`)).body as Po;
  const items = [
    { description: "طاولة تلميذ", quantity: 2, estimatedUnitCost: 500, targetKind: "ASSET" },
    { description: "علب طباشير", quantity: 10, estimatedUnitCost: 3, targetKind: "STOCK", inventoryItemId: "" },
  ];

  it("مسارات المصادقة: افتراضي بخطوتين، وآخر بلا خطوات لمصدر تمويل محدد", async () => {
    association = (await get("/lookups?listKey=FUNDING_SOURCE")).body.find((f: { code: string }) => f.code === "ASSOCIATION").id;
    const bad = await post("/approval-workflows", { name: "خطأ", steps: [{ name: "خطوة", requiredRoleCode: "NO_SUCH_ROLE" }] });
    expect(bad.body.error.details.fields["steps.0.requiredRoleCode"]).toBe("errors.invalidChoice");
    // المسار يُعدّ من الإعدادات فقط
    expect((await post("/approval-workflows", { name: "x", steps: [] }, s.stockMgr.token)).status).toBe(403);
    wfDefault = (await post("/approval-workflows", { name: "ميزانية المؤسسة", steps: [{ name: "تأشيرة المدير", requiredRoleCode: "DIRECTOR" }, { name: "مصادقة نهائية" }] })).body.id;
    await post("/approval-workflows", { name: "جمعية الآباء", fundingSourceId: association, managingBody: "جمعية آباء وأمهات وأولياء التلاميذ", steps: [] });
    const list = (await get("/approval-workflows")).body;
    expect(list.map((w: { name: string; steps: unknown[] }) => [w.name, w.steps.length])).toEqual([
      ["جمعية الآباء", 0],
      ["ميزانية المؤسسة", 2],
    ]);
  });

  it("الطلبية: التحقق من الأسطر، والحالة حسب اكتمال التقدير", async () => {
    expect((await post("/purchase-orders", { title: "فارغة", items: [] })).body.error.details.fields.items).toBe("errors.atLeastOneItem");
    const noStock = await post("/purchase-orders", { title: "x", items: [{ description: "y", quantity: 1, targetKind: "STOCK" }] });
    expect(noStock.body.error.details.fields["items.0.inventoryItemId"]).toBe("errors.required");
    items[1]!.inventoryItemId = s.item;
    const r = await post("/purchase-orders", { title: "تجهيز القسم 1", needDescription: "طاولات ومستهلكات", items });
    expect(r.status).toBe(201);
    expect(r.body.number).toBe(`PO-${year}-0001`);
    po = r.body.id;
    expect((await getPo()).status).toBe("ESTIMATED");
    const need = await post("/purchase-orders", { title: "حاجة دون تقدير", items: [{ description: "مكنسة", quantity: 1, targetKind: "ASSET" }] });
    expect((await getPo(need.body.id)).status).toBe("NEED_RECORDED");
    // لا تسلم قبل الطلب
    expect((await post(`/purchase-orders/${po}/deliveries`, { receivedAt: today(), conformity: "CONFORM", items: [{ purchaseOrderItemId: po, quantityReceived: 1, quantityAccepted: 1 }] })).body.error.code).toBe("INVALID_TRANSITION");
  });

  it("المصادقة بالترتيب وبالدور المطلوب؛ الرفض يتطلب تعليلاً؛ المسار المستعمل لا يُعدَّل", async () => {
    expect((await post(`/purchase-orders/${po}/submit`)).body.status).toBe("PENDING_APPROVAL");
    expect((await put(`/purchase-orders/${po}`, { title: "تعديل", items })).body.error.code).toBe("PO_LOCKED");
    expect((await put(`/approval-workflows/${wfDefault}`, { name: "ميزانية المؤسسة", steps: [] })).body.error.code).toBe("WORKFLOW_IN_USE");
    const [step1, step2] = (await getPo()).approvals.map((a) => a.stepId);
    expect((await post(`/purchase-orders/${po}/approvals/${step2}`, { decision: "APPROVED" })).body.error.code).toBe("STEP_OUT_OF_ORDER");
    // الخطوة الأولى تتطلب دور المدير
    expect((await post(`/purchase-orders/${po}/approvals/${step1}`, { decision: "APPROVED" }, s.stockMgr.token)).status).toBe(403);
    expect((await post(`/purchase-orders/${po}/approvals/${step1}`, { decision: "REJECTED" }, s.director.token)).body.error.details.fields.comment).toBe("errors.rejectNeedsComment");
    expect((await post(`/purchase-orders/${po}/approvals/${step1}`, { decision: "APPROVED", comment: "موافق" }, s.director.token)).body.status).toBe("PENDING_APPROVAL");
    // الخطوة الثانية بلا دور: تتطلب صلاحية purchasing.approve
    expect((await post(`/purchase-orders/${po}/approvals/${step2}`, { decision: "APPROVED" }, s.stockMgr.token)).status).toBe(403);
    expect((await post(`/purchase-orders/${po}/approvals/${step2}`, { decision: "APPROVED" })).body.status).toBe("APPROVED");
    const a = (await getPo()).approvals;
    expect(a.map((x) => [x.decision, x.decidedBy])).toEqual([
      ["APPROVED", "director1"],
      ["APPROVED", "مدير النظام"],
    ]);
  });

  it("اختيار المسار حسب مصدر التمويل: مسار بلا خطوات يصادق مباشرة؛ الغموض يتطلب اختياراً صريحاً؛ الإلغاء بتعليل", async () => {
    const b = (await post("/purchase-orders", { title: "هبة الجمعية", fundingSourceId: association, items: [{ description: "كرة", quantity: 5, estimatedUnitCost: 80, targetKind: "ASSET" }] })).body.id;
    expect((await post(`/purchase-orders/${b}/submit`)).body.status).toBe("APPROVED");
    // مسار افتراضي ثان: لم يعد الاختيار التلقائي ممكناً
    const wf2 = (await post("/approval-workflows", { name: "افتراضي ثان", steps: [{ name: "مصادقة" }] })).body.id;
    const c = (await post("/purchase-orders", { title: "ثالثة", items: [{ description: "حاسوب", quantity: 1, estimatedUnitCost: 4000, targetKind: "ASSET" }] })).body.id;
    expect((await post(`/purchase-orders/${c}/submit`)).body.error).toMatchObject({ code: "WORKFLOW_AMBIGUOUS", details: { count: 2 } });
    expect((await post(`/purchase-orders/${c}/submit`, { workflowId: wf2 })).body.status).toBe("PENDING_APPROVAL");
    expect((await post(`/purchase-orders/${c}/cancel`, {})).body.error.details.fields.reason).toBe("errors.required");
    expect((await post(`/purchase-orders/${c}/cancel`, { reason: "تغيير الأولويات" })).body.status).toBe("CANCELLED");
    expect((await post(`/purchase-orders/${c}/cancel`, { reason: "مرة ثانية" })).body.error.code).toBe("INVALID_TRANSITION");
    await put(`/approval-workflows/${wf2}`, { name: "افتراضي ثان", isActive: false, steps: [{ name: "مصادقة" }] });
  });

  it("الطلب ثم التسلم الجزئي: المقبول لا يتجاوز المستلم ولا المتبقي", async () => {
    expect((await post(`/purchase-orders/${po}/order`, { supplierId: s.supplier, orderDocRef: "BC-12" })).body.status).toBe("ORDERED");
    const [desk, chalk] = (await getPo()).items;
    const over = await post(`/purchase-orders/${po}/deliveries`, { receivedAt: today(), conformity: "PARTIAL", items: [{ purchaseOrderItemId: chalk!.id, quantityReceived: 5, quantityAccepted: 6 }] });
    expect(over.body.error.details.fields["items.0.quantityAccepted"]).toBe("errors.acceptedExceedsReceived");
    const d1 = await post(`/purchase-orders/${po}/deliveries`, {
      receivedAt: today(),
      conformity: "PARTIAL",
      conformityNotes: "علبتان تالفتان",
      items: [
        { purchaseOrderItemId: desk!.id, quantityReceived: 1, quantityAccepted: 1 },
        { purchaseOrderItemId: chalk!.id, quantityReceived: 10, quantityAccepted: 8 },
      ],
      clientOpId: "op-d1",
    });
    expect(d1.body).toMatchObject({ number: `DL-${year}-0001`, status: "PARTIALLY_DELIVERED" });
    expect((await post(`/purchase-orders/${po}/deliveries`, { receivedAt: today(), conformity: "CONFORM", items: [{ purchaseOrderItemId: desk!.id, quantityReceived: 1, quantityAccepted: 1 }], clientOpId: "op-d1" })).body.replayed).toBe(true);
    const exceed = await post(`/purchase-orders/${po}/deliveries`, { receivedAt: today(), conformity: "CONFORM", items: [{ purchaseOrderItemId: chalk!.id, quantityReceived: 3, quantityAccepted: 3 }] });
    expect(exceed.body.error).toMatchObject({ code: "DELIVERY_EXCEEDS", details: { remaining: 2 } });
    const d2 = await post(`/purchase-orders/${po}/deliveries`, {
      receivedAt: today(),
      conformity: "CONFORM",
      items: [
        { purchaseOrderItemId: desk!.id, quantityReceived: 1, quantityAccepted: 1 },
        { purchaseOrderItemId: chalk!.id, quantityReceived: 2, quantityAccepted: 2 },
      ],
    });
    expect(d2.body.status).toBe("DELIVERED");
    expect((await getPo()).items.map((i) => i.accepted)).toEqual([2, 10]);
    // لا إغلاق قبل إدخال المقبول
    expect((await post(`/purchase-orders/${po}/close`)).body.error).toMatchObject({ code: "UNPOSTED_ITEMS", details: { count: 4 } });
  });

  it("الإدخال مرة واحدة: المستهلكات إلى المخزن بحركة مرتبطة، والتجهيز إلى بطاقات ممتلكات", async () => {
    const dl = (await getPo()).deliveries.flatMap((d) => d.items);
    const [desk, chalk] = (await getPo()).items;
    const chalkLines = dl.filter((x) => x.purchaseOrderItemId === chalk!.id);
    const deskLines = dl.filter((x) => x.purchaseOrderItemId === desk!.id);
    expect((await post("/deliveries/post", { deliveryItemId: chalkLines[0]!.id })).body.error.details.fields.warehouseId).toBe("errors.required");
    const p1 = await post("/deliveries/post", { deliveryItemId: chalkLines[0]!.id, warehouseId: s.wh });
    expect(p1.body.postedAs).toBe("STOCK");
    expect((await post("/deliveries/post", { deliveryItemId: chalkLines[0]!.id, warehouseId: s.wh })).body.error.code).toBe("ALREADY_POSTED");
    await post("/deliveries/post", { deliveryItemId: chalkLines[1]!.id, warehouseId: s.wh });
    const bal = await prisma.stockBalance.aggregate({ where: { itemId: s.item }, _sum: { quantity: true } });
    expect(Number(bal._sum.quantity)).toBe(30); // 20 + 8 + 2
    expect(await prisma.stockMovement.count({ where: { deliveryItemId: chalkLines[0]!.id } })).toBe(1);

    expect((await post("/deliveries/post", { deliveryItemId: deskLines[0]!.id })).body.error.details.fields.categoryId).toBe("errors.required");
    for (const l of deskLines) {
      const r = await post("/deliveries/post", { deliveryItemId: l.id, categoryId: s.cat, trackingMode: "INDIVIDUAL", roomId: s.room1 });
      expect(r.body).toMatchObject({ postedAs: "ASSETS" });
      expect(r.body.created).toHaveLength(1);
    }
    const desks = await prisma.asset.findMany({ where: { purchaseOrderItemId: desk!.id } });
    expect(desks.map((a) => [a.name, Number(a.acquisitionValue), a.supplierId, a.roomId])).toEqual([
      ["طاولة تلميذ", 500, s.supplier, s.room1],
      ["طاولة تلميذ", 500, s.supplier, s.room1],
    ]);
  });

  it("الفوترة ثم الإغلاق؛ الفاتورة المكررة مرفوضة", async () => {
    expect((await post(`/purchase-orders/${po}/invoices`, { invoiceNumber: "F-200", invoiceDate: today(), amount: 1030 })).status).toBe(201);
    expect((await getPo()).status).toBe("INVOICED");
    expect((await post(`/purchase-orders/${po}/invoices`, { invoiceNumber: "F-200", invoiceDate: today(), amount: 1 })).body.error.code).toBe("DUPLICATE_INVOICE");
    expect((await post(`/purchase-orders/${po}/close`)).body.status).toBe("CLOSED");
    expect((await post(`/purchase-orders/${po}/cancel`, { reason: "متأخر" })).body.error.code).toBe("INVALID_TRANSITION");
    const statuses = (await prisma.auditLog.findMany({ where: { entityId: po, action: { startsWith: "PO_" } }, orderBy: { id: "asc" } })).map((x) => x.action);
    expect(statuses.filter((x) => !["PO_DECISION", "PO_DELIVERY", "PO_POSTED", "PO_INVOICE"].includes(x))).toEqual([
      "PO_CREATE",
      "PO_PENDING_APPROVAL",
      "PO_APPROVED",
      "PO_ORDERED",
      "PO_PARTIALLY_DELIVERED",
      "PO_DELIVERED",
      "PO_INVOICED",
      "PO_CLOSED",
    ]);
  });

  it("مدير المخزون يطّلع على الطلبيات ولا ينشئها", async () => {
    expect((await get("/purchase-orders", s.stockMgr.token)).status).toBe(200);
    expect((await post("/purchase-orders", { title: "x", items: [{ description: "y", quantity: 1, targetKind: "ASSET" }] }, s.stockMgr.token)).status).toBe(403);
  });
});
