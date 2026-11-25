import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type request from "supertest";
import { randomUUID } from "node:crypto";
import { auth, bootApp } from "./helpers";
import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * المرحلة 9: الأداء على بيانات حجمية (بيانات اختبار فقط في مخطط معزول):
 * 5000 أصل، 300 مادة مخزون، 30000 حركة. كل مسار رئيسي يجب أن يجيب في أقل من الحد.
 */
const N_ASSETS = 5000;
const N_ITEMS = 300;
const N_MOVES = 30000;
const LIMIT_MS = 1500;

let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let admin = "";
let sid = "";
const base = () => `/api/v1/schools/${sid}`;
const timings: Record<string, number> = {};

async function timed(name: string, req: () => PromiseLike<{ status: number; body: unknown }>) {
  await req(); // تسخين
  const t0 = performance.now();
  const r = await req();
  timings[name] = Math.round(performance.now() - t0);
  expect(r.status, name).toBeLessThan(300);
  return r;
}

beforeAll(async () => {
  ({ app, http, prisma, admin, schoolId: sid } = await bootApp());
  const g = (p: string) => http.get(`${base()}${p}`).set(auth(admin));
  const cats: { id: string }[] = [];
  for (const [code, nameAr] of [["MOB", "أثاث"], ["INF", "معلوميات"], ["DID", "وسائل ديداكتيكية"]]) cats.push((await http.post(`${base()}/categories`).set(auth(admin)).send({ code, nameAr })).body);
  const unit = ((await g("/lookups?listKey=UNIT_OF_MEASURE")).body as { id: string; code: string }[]).find((x) => x.code === "PCS")!.id;
  const wh = (await http.post(`${base()}/warehouses`).set(auth(admin)).send({ code: "W1", name: "مستودع" })).body.id as string;
  const userId = (await prisma.user.findFirstOrThrow({ where: { username: "admin" } })).id;
  const statuses = ["AVAILABLE", "AVAILABLE", "UNDER_REPAIR", "DAMAGED"] as const;
  await prisma.asset.createMany({
    data: Array.from({ length: N_ASSETS }, (_, i) => ({
      schoolId: sid, inventoryNumber: `PERF-${String(i).padStart(5, "0")}`, name: `أصل اختبار ${i}`,
      categoryId: cats[i % cats.length]!.id, status: statuses[i % statuses.length], acquisitionValue: 100 + (i % 50),
    })) as never,
  });
  const items = Array.from({ length: N_ITEMS }, (_, i) => ({ id: randomUUID(), schoolId: sid, code: `ITM${i}`, name: `مادة ${i}`, unitId: unit, minQuantity: 5 }));
  await prisma.inventoryItem.createMany({ data: items });
  const moves = Array.from({ length: N_MOVES }, (_, i) => ({
    schoolId: sid, number: `PM-${i}`, type: (i % 3 === 0 ? "OUT" : "IN") as never, direction: i % 3 === 0 ? -1 : 1,
    itemId: items[i % N_ITEMS]!.id, warehouseId: wh, quantity: 1, createdById: userId,
    occurredAt: new Date(Date.now() - (i % 365) * 86400_000), reason: "بيانات أداء",
  }));
  for (let i = 0; i < moves.length; i += 5000) await prisma.stockMovement.createMany({ data: moves.slice(i, i + 5000) });
  await prisma.stockBalance.createMany({ data: items.map((it) => ({ itemId: it.id, warehouseId: wh, quantity: N_MOVES / N_ITEMS / 3 })) });
}, 120_000);

afterAll(async () => {
  console.table(timings);
  await app?.close();
});

describe("الأداء على بيانات حجمية", () => {
  const get = (p: string) => () => http.get(`${base()}${p}`).set(auth(admin));
  const post = (p: string, b: object) => () => http.post(`${base()}${p}`).set(auth(admin)).send(b);

  it("قوائم الأصول: صفحة، بحث، تصفية", async () => {
    const r = await timed("assets page", get("/assets?pageSize=50"));
    expect((r.body as { total: number }).total).toBe(N_ASSETS);
    await timed("assets search", get("/assets?q=4999"));
    await timed("assets status", get("/assets?status=DAMAGED&page=10"));
  });

  it("المخزون: المواد والحركات والتنبيهات", async () => {
    await timed("stock items", get("/stock/items"));
    await timed("stock movements", get("/stock/movements?pageSize=50"));
    await timed("stock alerts", get("/stock/alerts"));
  });

  it("لوحة القيادة والتقارير", async () => {
    await timed("dashboard stats", get("/dashboard/stats"));
    await timed("dashboard charts", get("/dashboard/charts"));
    await timed("dashboard alerts", get("/dashboard/alerts"));
    await timed("report ASSETS", post("/reports/ASSETS/preview", {}));
    // بلا تصفية يتجاوز سقف 5000 سطر فيُرفض بدل إنهاك الخادم، ومع فترة شهر يُنتج
    const big = await post("/reports/STOCK_MOVEMENTS/preview", {})();
    expect(big.status).toBe(422);
    expect(big.body.error.code).toBe("REPORT_TOO_LARGE");
    const from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    await timed("report STOCK_MOVEMENTS (30d)", post("/reports/STOCK_MOVEMENTS/preview", { filters: { from } }));
  });

  it("كل المسارات تحت الحد", () => {
    const slow = Object.entries(timings).filter(([, ms]) => ms > LIMIT_MS);
    expect(slow).toEqual([]);
  });
});
