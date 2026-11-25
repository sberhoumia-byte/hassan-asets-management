import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type request from "supertest";
import { auth, bootApp, userWithRole } from "./helpers";
import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * المرحلة 8: التنبيهات المجدولة (المستلمون حسب الصلاحية، عدم التكرار، إعادة التنبيه بعد زوال الشرط، التفضيلات، التزامن)
 * وسجل التدقيق (قراءة فقط، تصفية، صلاحية).
 */
let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let admin = "";
let sid = "";
const s = { unit: "", wh: "", item: "", room: "" };
const u = {} as Record<"stock" | "maint" | "director" | "viewer" | "docs", { token: string; id: string }>;
const base = () => `/api/v1/schools/${sid}`;
const get = (path: string, token = admin) => http.get(`${base()}${path}`).set(auth(token));
const post = (path: string, body: object = {}, token = admin) => http.post(`${base()}${path}`).set(auth(token)).send(body);
const mine = (token: string, q = "") => http.get(`/api/v1/notifications${q}`).set(auth(token));
const run = () => post("/notifications/run");
const types = async (token: string) => ((await mine(token)).body.items as { type: string }[]).map((n) => n.type).sort();
const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  ({ app, http, prisma, admin, schoolId: sid } = await bootApp());
  s.unit = (await get("/lookups?listKey=UNIT_OF_MEASURE")).body.find((x: { code: string }) => x.code === "PCS").id;
  s.wh = (await post("/warehouses", { code: "W1", name: "المستودع" })).body.id;
  s.item = (await post("/stock/items", { code: "CRAIE", name: "طباشير", unitId: s.unit, minQuantity: 10, tracksExpiry: false })).body.id;
  await post("/stock/movements/in", { itemId: s.item, warehouseId: s.wh, quantity: 5 });
  const spaceTypes = (await get("/lookups?listKey=SPACE_TYPE")).body as { id: string; code: string }[];
  s.room = (await post("/rooms", { code: "R1", name: "القسم 1", spaceTypeId: spaceTypes.find((t) => t.code === "CLASSROOM")!.id, status: "GOOD" })).body.id;
  u.stock = await userWithRole(http, admin, sid, "stock8", ["STOCK_MANAGER"]);
  u.maint = await userWithRole(http, admin, sid, "maint8", ["MAINTENANCE_MANAGER"]);
  u.director = await userWithRole(http, admin, sid, "director8", ["DIRECTOR"]);
  u.viewer = await userWithRole(http, admin, sid, "viewer8", ["VIEWER"]);
  u.docs = await userWithRole(http, admin, sid, "docs8", ["DOCUMENT_MANAGER"]);
});

afterAll(async () => {
  await app?.close();
});

describe("التنبيهات المجدولة", () => {
  it("المخزون تحت الحد ينبّه من يملك stock.view فقط، والفحص الثاني لا يكرر", async () => {
    const r = await run();
    expect(r.status).toBe(200);
    expect(r.body.created).toBeGreaterThan(0);
    expect(await types(admin)).toEqual(["STOCK_LOW"]);
    expect(await types(u.stock.token)).toEqual(["STOCK_LOW"]);
    expect(await types(u.maint.token)).toEqual([]); // لا يملك stock.view
    const n = (await mine(u.stock.token)).body.items[0];
    expect(n).toMatchObject({ titleKey: "notif.STOCK_LOW", entityType: "InventoryItem", entityId: s.item, schoolId: sid });
    expect(n.vars).toMatchObject({ name: "طباشير", code: "CRAIE", total: 5, min: 10 });
    expect((await run()).body.created).toBe(0);
  });

  it("زوال الشرط ثم عودته يعيد التنبيه دون حذف القديم", async () => {
    const before = await prisma.notification.count({ where: { userId: u.stock.id, type: "STOCK_LOW" } });
    await post("/stock/movements/in", { itemId: s.item, warehouseId: s.wh, quantity: 20 });
    await run();
    expect(await prisma.notification.count({ where: { userId: u.stock.id, type: "STOCK_LOW", dedupeKey: { not: null } } })).toBe(0);
    await post("/stock/movements/out", { itemId: s.item, warehouseId: s.wh, quantity: 18, reason: "توزيع على الأقسام" });
    expect((await run()).body.created).toBeGreaterThan(0);
    expect(await prisma.notification.count({ where: { userId: u.stock.id, type: "STOCK_LOW" } })).toBe(before + 1);
  });

  it("صيانة مستعجلة، مصادقة منتظرة حسب الدور، ووثيقة تقترب صلاحيتها (المقيدة لمن يراها فقط)", async () => {
    await post("/maintenance/requests", { targetType: "room", targetId: s.room, type: "CORRECTIVE", description: "تسرب ماء من السقف", urgency: "CRITICAL" });
    const wf = (await post("/approval-workflows", { name: "ميزانية المؤسسة", steps: [{ name: "تأشيرة المدير", requiredRoleCode: "DIRECTOR" }] })).body.id;
    const po = (await post("/purchase-orders", { title: "طاولات", items: [{ description: "طاولة", quantity: 2, targetKind: "ASSET", estimatedUnitCost: 500 }] })).body.id;
    expect((await post(`/purchase-orders/${po}/submit`, { workflowId: wf })).status).toBeLessThan(300);
    const pdf = Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64");
    await post("/documents", { title: "عقد الصيانة", expiresAt: inDays(10), fileName: "c.pdf", dataBase64: pdf });
    await post("/documents", { title: "عقد سري", expiresAt: inDays(5), accessLevel: "RESTRICTED", fileName: "s.pdf", dataBase64: pdf });
    await post("/documents", { title: "بعيدة", expiresAt: inDays(200), fileName: "f.pdf", dataBase64: pdf });
    await run();
    // مسؤول الصيانة يملك maintenance.view وdocuments.view (لا stock.view)
    expect(await types(u.maint.token)).toEqual(["DOCUMENT_EXPIRY", "MAINTENANCE_URGENT"]);
    expect(await types(u.director.token)).toContain("APPROVAL_REQUEST");
    expect(await types(u.stock.token)).not.toContain("APPROVAL_REQUEST"); // المصادقة للدور المطلوب لا لكل من يرى الطلبيات
    const docs = (await mine(u.docs.token)).body.items.filter((n: { type: string }) => n.type === "DOCUMENT_EXPIRY").map((n: { vars: { title: string } }) => n.vars.title).sort();
    expect(docs).toEqual(["عقد الصيانة", "عقد سري"].sort());
    const viewerDocs = (await mine(u.viewer.token)).body.items.filter((n: { type: string }) => n.type === "DOCUMENT_EXPIRY").map((n: { vars: { title: string } }) => n.vars.title);
    expect(viewerDocs).toEqual(["عقد الصيانة"]);
  });

  it("التفضيلات: من عطّل نوعاً لا يتلقاه، والأنواع غير المعروفة مرفوضة", async () => {
    const p = await http.get("/api/v1/notifications/preferences").set(auth(u.stock.token));
    expect(p.body.find((x: { type: string }) => x.type === "STOCK_OUT")).toEqual({ type: "STOCK_OUT", enabled: true });
    const bad = await http.put("/api/v1/notifications/preferences").set(auth(u.stock.token)).send({ items: [{ type: "NOPE", enabled: false }] });
    expect(bad.status).toBe(400);
    const r = await http.put("/api/v1/notifications/preferences").set(auth(u.stock.token)).send({ items: [{ type: "STOCK_OUT", enabled: false }] });
    expect(r.body.find((x: { type: string }) => x.type === "STOCK_OUT").enabled).toBe(false);
    // نفاد المخزون
    await post("/stock/movements/out", { itemId: s.item, warehouseId: s.wh, quantity: 7, reason: "توزيع" });
    await run();
    expect(await types(admin)).toContain("STOCK_OUT");
    expect(await types(u.stock.token)).not.toContain("STOCK_OUT");
  });

  it("القراءة: عدد غير المقروء، تعليم واحد أو الكل، ولا وصول لإشعار مستخدم آخر", async () => {
    const l = (await mine(u.maint.token)).body;
    expect(l.unread).toBe(l.items.length);
    const other = (await mine(admin)).body.items[0].id;
    expect((await http.post(`/api/v1/notifications/${other}/read`).set(auth(u.maint.token))).status).toBe(404);
    expect((await http.post(`/api/v1/notifications/${l.items[0].id}/read`).set(auth(u.maint.token))).status).toBe(200);
    expect((await mine(u.maint.token)).body.unread).toBe(l.unread - 1);
    expect((await mine(u.maint.token, "?unread=1")).body.items).toHaveLength(l.unread - 1);
    await http.post("/api/v1/notifications/read-all").set(auth(u.maint.token));
    expect((await mine(u.maint.token)).body.unread).toBe(0);
  });

  it("فحصان متزامنان لا ينشئان نسخاً مكررة، والتشغيل اليدوي بصلاحية الإعدادات فقط", async () => {
    await post("/stock/items", { code: "INK", name: "حبر", unitId: s.unit, minQuantity: 3, tracksExpiry: false });
    const item = (await prisma.inventoryItem.findFirstOrThrow({ where: { code: "INK", schoolId: sid } })).id;
    await post("/stock/movements/in", { itemId: item, warehouseId: s.wh, quantity: 1 });
    await Promise.all([run(), run(), run()]);
    await run();
    const rows = await prisma.notification.findMany({ where: { entityId: item, type: "STOCK_LOW" } });
    expect(new Set(rows.map((r) => r.userId)).size).toBe(rows.length);
    expect((await post("/notifications/run", {}, u.stock.token)).status).toBe(403);
  });
});

describe("سجل التدقيق", () => {
  it("قراءة مع التصفية والصفحات، بصلاحية audit.view فقط، ولا مسار للتعديل أو الحذف", async () => {
    const all = await get("/audit-logs?pageSize=5");
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(5);
    expect(all.body.total).toBeGreaterThan(5);
    const f = (await get("/audit-logs/facets")).body;
    expect(f.actions).toContain("DOCUMENT_CREATE");
    expect(f.users.length).toBeGreaterThan(0);
    expect(f.entityTypes).toContain("Document");
    const docs = await get("/audit-logs?entityType=Document");
    expect(docs.body.items.every((r: { entityType: string }) => r.entityType === "Document")).toBe(true);
    expect(docs.body.total).toBe(3);
    const today = new Date().toISOString().slice(0, 10);
    expect((await get(`/audit-logs?from=${today}&to=${today}&action=DOCUMENT_CREATE`)).body.total).toBe(3);
    expect((await get("/audit-logs?from=2020-01-01&to=2020-01-02")).body.total).toBe(0);
    expect((await get("/audit-logs?from=2026-02-01&to=2026-01-01")).status).toBe(400);
    expect((await get("/audit-logs", u.viewer.token)).status).toBe(403);
    expect((await get("/audit-logs", u.director.token)).status).toBe(200);
    const id = all.body.items[0].id;
    expect((await http.delete(`${base()}/audit-logs/${id}`).set(auth(admin))).status).toBe(404);
    expect((await http.put(`${base()}/audit-logs/${id}`).set(auth(admin)).send({})).status).toBe(404);
  });
});
