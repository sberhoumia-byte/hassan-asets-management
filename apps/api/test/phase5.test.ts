import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type request from "supertest";
import { auth, bootApp, userWithRole } from "./helpers";
import type { PrismaService } from "../src/prisma/prisma.service";

/** المرحلة 5: الفضاءات والملاعب والموظفون والوسائل التعليمية والإعارة — على PostgreSQL حقيقي. */
let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let admin = "";
let sid = "";
const s = { building: "", classroom: "", office: "", room1: "", room2: "", yardType: "", facility: "", cat: "", asset: "", teacher: "", teacher2: "", projector: "", unit1: "", unit2: "", maps: "", loanUnit: "", loanQty: "" };
const base = () => `/api/v1/schools/${sid}`;
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  ({ app, http, prisma, admin, schoolId: sid } = await bootApp());
  const types = (await http.get(`${base()}/lookups?listKey=SPACE_TYPE`).set(auth(admin))).body as { id: string; code: string }[];
  s.classroom = types.find((t) => t.code === "CLASSROOM")!.id;
  s.office = types.find((t) => t.code === "OFFICE")!.id;
  s.yardType = types.find((t) => t.code === "YARD")!.id;
  s.cat = (await http.post(`${base()}/categories`).set(auth(admin)).send({ code: "MOB", nameAr: "أثاث" })).body.id;
});
afterAll(async () => {
  await app?.close();
});

describe("البنايات والفضاءات والملاعب", () => {
  it("بناية وحجرات بفلترة حسب النوع والبناية، ومنع تكرار الرمز", async () => {
    const b = await http.post(`${base()}/buildings`).set(auth(admin)).send({ code: "B1", name: "البناية أ", floors: 1, status: "GOOD" });
    expect(b.status).toBe(201);
    s.building = b.body.id;
    s.room1 = (await http.post(`${base()}/rooms`).set(auth(admin)).send({ code: "R1", name: "القسم 1", buildingId: s.building, spaceTypeId: s.classroom, capacity: 36, areaM2: 56.5, status: "GOOD" })).body.id;
    s.room2 = (await http.post(`${base()}/rooms`).set(auth(admin)).send({ code: "ADM", name: "مكتب المدير", buildingId: s.building, spaceTypeId: s.office, status: "GOOD" })).body.id;
    const yard = await http.post(`${base()}/rooms`).set(auth(admin)).send({ code: "YARD", name: "الساحة", spaceTypeId: s.yardType, status: "NEEDS_MAINTENANCE" });
    expect(yard.status).toBe(201); // فضاء دون بناية
    expect((await http.post(`${base()}/rooms`).set(auth(admin)).send({ code: "R1", name: "مكرر", spaceTypeId: s.classroom, status: "GOOD" })).body.error.code).toBe("DUPLICATE_CODE");
    const classes = (await http.get(`${base()}/rooms?spaceTypeId=${s.classroom}`).set(auth(admin))).body;
    expect(classes.map((r: { code: string }) => r.code)).toEqual(["R1"]);
    expect(classes[0]).toMatchObject({ building: "البناية أ", capacity: 36, areaM2: 56.5 });
    expect((await http.get(`${base()}/rooms?buildingId=${s.building}`).set(auth(admin))).body).toHaveLength(2);
    expect((await http.get(`${base()}/buildings`).set(auth(admin))).body[0].rooms).toBe(2);
  });

  it("الملعب بنوعه، والبناية ذات الفضاءات لا تُؤرشف", async () => {
    const types = (await http.get(`${base()}/lookups?listKey=FACILITY_TYPE`).set(auth(admin))).body as { id: string; code: string }[];
    const f = await http.post(`${base()}/facilities`).set(auth(admin)).send({ code: "F1", name: "ملعب كرة القدم المصغر", facilityTypeId: types.find((t) => t.code === "FOOTBALL")!.id, surfaceCondition: "FAIR", status: "GOOD" });
    expect(f.status).toBe(201);
    s.facility = f.body.id;
    expect((await http.post(`${base()}/buildings/${s.building}/archive`).set(auth(admin))).body.error.code).toBe("BUILDING_HAS_ROOMS");
  });

  it("الممتلك يُربط بفضائه ومسؤوله، ويُحفظ سجل المواقع، ومحتوى الفضاء يظهره", async () => {
    s.teacher = (await http.post(`${base()}/staff`).set(auth(admin)).send({ fullNameAr: "أستاذة الاختبار", type: "TEACHER", staffNumber: "T001" })).body.id;
    const a = await http.post(`${base()}/assets`).set(auth(admin)).send({ name: "مكتب خشبي", categoryId: s.cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE", roomId: s.room1, responsibleStaffId: s.teacher });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ room: "القسم 1", responsible: "أستاذة الاختبار" });
    s.asset = a.body.id;
    const body = { name: "مكتب خشبي", categoryId: s.cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE", roomId: s.room2, responsibleStaffId: s.teacher, inventoryNumber: a.body.inventoryNumber };
    expect((await http.put(`${base()}/assets/${s.asset}`).set(auth(admin)).send(body)).status).toBe(200);
    const locs = await prisma.assetLocation.findMany({ where: { assetId: s.asset }, orderBy: { fromDate: "asc" } });
    expect(locs.map((l) => [l.roomId, l.toDate === null])).toEqual([[s.room1, false], [s.room2, true]]);
    const hist = (await http.get(`${base()}/assets/${s.asset}/history`).set(auth(admin))).body;
    expect(hist[0].changes).toEqual([{ field: "roomId", from: s.room1, to: s.room2 }]);
    const c = (await http.get(`${base()}/rooms/${s.room2}/contents`).set(auth(admin))).body;
    expect(c.assets.map((x: { name: string }) => x.name)).toEqual(["مكتب خشبي"]);
    // فضاء به ممتلكات لا يُؤرشف
    expect((await http.post(`${base()}/rooms/${s.room2}/archive`).set(auth(admin))).body.error).toMatchObject({ code: "ROOM_NOT_EMPTY", details: { assets: 1 } });
    // التصفية حسب الفضاء والمسؤول
    expect((await http.get(`${base()}/assets?roomId=${s.room2}`).set(auth(admin))).body.total).toBe(1);
    expect((await http.get(`${base()}/assets?responsibleStaffId=${s.teacher}`).set(auth(admin))).body.total).toBe(1);
  });

  it("فضاء مؤسسة أخرى أو مؤرشف مرفوض كموقع", async () => {
    const tmp = (await http.post(`${base()}/rooms`).set(auth(admin)).send({ code: "TMP", name: "فضاء مؤقت", spaceTypeId: s.office, status: "GOOD" })).body.id;
    await http.post(`${base()}/rooms/${tmp}/archive`).set(auth(admin));
    const r = await http.post(`${base()}/assets`).set(auth(admin)).send({ name: "كرسي", categoryId: s.cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE", roomId: tmp });
    expect(r.body.error.details.fields.roomId).toBe("errors.archivedChoice");
    const r2 = await http.post(`${base()}/assets`).set(auth(admin)).send({ name: "كرسي", categoryId: s.cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE", roomId: "00000000-0000-4000-8000-000000000000" });
    expect(r2.body.error.details.fields.roomId).toBe("errors.invalidChoice");
  });
});

describe("الموظفون", () => {
  it("رقم التأجير لا يتكرر، والتعطيل يخفيه من القائمة الافتراضية", async () => {
    expect((await http.post(`${base()}/staff`).set(auth(admin)).send({ fullNameAr: "آخر", type: "TEACHER", staffNumber: "T001" })).body.error.code).toBe("DUPLICATE_STAFF_NUMBER");
    s.teacher2 = (await http.post(`${base()}/staff`).set(auth(admin)).send({ fullNameAr: "أستاذ ثان", type: "TEACHER" })).body.id;
    const off = (await http.post(`${base()}/staff`).set(auth(admin)).send({ fullNameAr: "موظف سابق", type: "SUPPORT", isActive: false })).body.id;
    const names = (await http.get(`${base()}/staff`).set(auth(admin))).body.map((x: { id: string }) => x.id);
    expect(names).not.toContain(off);
    expect((await http.get(`${base()}/staff?all=1`).set(auth(admin))).body.map((x: { id: string }) => x.id)).toContain(off);
  });
});

describe("الوسائل التعليمية والإعارة", () => {
  it("صنف فردي بوحدات مرقمة تلقائياً، وصنف كمي", async () => {
    const p = await http.post(`${base()}/resources`).set(auth(admin)).send({ code: "PROJ", name: "جهاز عرض", trackingMode: "INDIVIDUAL", quantityTotal: 0, isLendable: true, roomId: s.room2 });
    expect(p.status).toBe(201);
    s.projector = p.body.id;
    const u1 = await http.post(`${base()}/resources/${s.projector}/units`).set(auth(admin)).send({ status: "AVAILABLE", roomId: s.room2 });
    const u2 = await http.post(`${base()}/resources/${s.projector}/units`).set(auth(admin)).send({ status: "AVAILABLE", serialNumber: "SN-9" });
    expect([u1.body.inventoryNumber, u2.body.inventoryNumber]).toEqual(["PROJ-001", "PROJ-002"]);
    s.unit1 = u1.body.id;
    s.unit2 = u2.body.id;
    expect((await http.post(`${base()}/resources/${s.projector}/units`).set(auth(admin)).send({ status: "AVAILABLE", inventoryNumber: "PROJ-001" })).body.error.code).toBe("DUPLICATE_INVENTORY_NUMBER");
    const m = await http.post(`${base()}/resources`).set(auth(admin)).send({ code: "MAPS", name: "خرائط المغرب", trackingMode: "QUANTITY", quantityTotal: 10, isLendable: true });
    s.maps = m.body.id;
    const list = (await http.get(`${base()}/resources`).set(auth(admin))).body;
    expect(list.find((r: { code: string }) => r.code === "PROJ")).toMatchObject({ total: 2, available: 2, onLoan: 0 });
    expect(list.find((r: { code: string }) => r.code === "MAPS")).toMatchObject({ total: 10, available: 10, damaged: 0 });
  });

  it("إعارة وحدة ثم منع إعارتها مرة ثانية (409)", async () => {
    const l = await http.post(`${base()}/loans`).set(auth(admin)).send({ resourceId: s.projector, unitId: s.unit1, quantity: 1, borrowerStaffId: s.teacher, dueAt: inDays(3), conditionOut: "GOOD" });
    expect(l.status).toBe(201);
    expect(l.body.number).toMatch(/^LN-\d{4}-00001$/);
    s.loanUnit = l.body.id;
    const again = await http.post(`${base()}/loans`).set(auth(admin)).send({ resourceId: s.projector, unitId: s.unit1, quantity: 1, borrowerStaffId: s.teacher2, dueAt: inDays(3) });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("RESOURCE_ALREADY_ON_LOAN");
    const r = (await http.get(`${base()}/resources/${s.projector}`).set(auth(admin))).body;
    expect(r.units.find((u: { id: string }) => u.id === s.unit1)).toMatchObject({ status: "ON_LOAN", loan: { borrower: "أستاذة الاختبار" } });
  });

  it("منع إعارة وحدة معطوبة (422)، وإعارتان متزامنتان لنفس الوحدة: تنجح واحدة فقط", async () => {
    const body = { status: "DAMAGED" };
    await http.put(`${base()}/resources/${s.projector}/units/${s.unit2}`).set(auth(admin)).send(body);
    const d = await http.post(`${base()}/loans`).set(auth(admin)).send({ resourceId: s.projector, unitId: s.unit2, quantity: 1, borrowerStaffId: s.teacher2, dueAt: inDays(1) });
    expect(d.status).toBe(422);
    expect(d.body.error.code).toBe("RESOURCE_NOT_AVAILABLE");
    await http.put(`${base()}/resources/${s.projector}/units/${s.unit2}`).set(auth(admin)).send({ status: "AVAILABLE" });
    const rs = await Promise.all(
      [s.teacher, s.teacher2, s.teacher, s.teacher2, s.teacher].map((b) =>
        http.post(`${base()}/loans`).set(auth(admin)).send({ resourceId: s.projector, unitId: s.unit2, quantity: 1, borrowerStaffId: b, dueAt: inDays(1) }),
      ),
    );
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(4);
  });

  it("الإعارة الجزئية من صنف كمي لا تتجاوز المتاح، والإرجاع الجزئي يحدّث المتاح", async () => {
    const l = await http.post(`${base()}/loans`).set(auth(admin)).send({ resourceId: s.maps, quantity: 6, borrowerStaffId: s.teacher, dueAt: inDays(7) });
    expect(l.status).toBe(201);
    s.loanQty = l.body.id;
    const over = await http.post(`${base()}/loans`).set(auth(admin)).send({ resourceId: s.maps, quantity: 5, borrowerStaffId: s.teacher2, dueAt: inDays(7) });
    expect(over.body.error).toMatchObject({ code: "QUANTITY_NOT_AVAILABLE", details: { available: 4, requested: 5 } });
    // إرجاع 2 سليمة ثم 1 معطوبة
    expect((await http.post(`${base()}/loans/${s.loanQty}/returns`).set(auth(admin)).send({ quantity: 2, damaged: false, conditionIn: "GOOD" })).status).toBe(201);
    expect((await http.post(`${base()}/loans/${s.loanQty}/returns`).set(auth(admin)).send({ quantity: 1, damaged: true, conditionIn: "POOR" })).status).toBe(201);
    let loan = (await http.get(`${base()}/loans/${s.loanQty}`).set(auth(admin))).body;
    expect(loan).toMatchObject({ status: "PARTIALLY_RETURNED", returnedQuantity: 3, outstanding: 3 });
    expect(loan.returns).toHaveLength(2);
    let maps = (await http.get(`${base()}/resources/${s.maps}`).set(auth(admin))).body;
    expect(maps).toMatchObject({ total: 10, onLoan: 3, damaged: 1, available: 6 });
    // لا إرجاع أكثر من المتبقي
    expect((await http.post(`${base()}/loans/${s.loanQty}/returns`).set(auth(admin)).send({ quantity: 4, damaged: false })).body.error).toMatchObject({ code: "RETURN_EXCEEDS", details: { outstanding: 3 } });
    expect((await http.post(`${base()}/loans/${s.loanQty}/returns`).set(auth(admin)).send({ quantity: 3, damaged: false })).status).toBe(201);
    loan = (await http.get(`${base()}/loans/${s.loanQty}`).set(auth(admin))).body;
    expect(loan.status).toBe("RETURNED");
    maps = (await http.get(`${base()}/resources/${s.maps}`).set(auth(admin))).body;
    expect(maps).toMatchObject({ onLoan: 0, damaged: 1, available: 9 });
    expect((await http.post(`${base()}/loans/${s.loanQty}/returns`).set(auth(admin)).send({ quantity: 1, damaged: false })).body.error.code).toBe("LOAN_CLOSED");
  });

  it("إعارات كمية متزامنة لا تتجاوز المتاح", async () => {
    const rs = await Promise.all(Array.from({ length: 6 }, () => http.post(`${base()}/loans`).set(auth(admin)).send({ resourceId: s.maps, quantity: 2, borrowerStaffId: s.teacher2, dueAt: inDays(2) })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(4); // المتاح 9 ← 4 × 2
    const maps = (await http.get(`${base()}/resources/${s.maps}`).set(auth(admin))).body;
    expect(maps).toMatchObject({ onLoan: 8, available: 1 });
  });

  it("احتساب التأخير والتصفية بالمتأخرة", async () => {
    // محاكاة مرور الوقت: إعارة بدأت قبل 10 أيام وكان إرجاعها قبل 3 أيام
    await prisma.resourceLoan.update({ where: { id: s.loanUnit }, data: { loanedAt: new Date(Date.now() - 10 * 86400_000), dueAt: new Date(`${inDays(-3)}T23:59:59.999Z`) } });
    const l = (await http.get(`${base()}/loans/${s.loanUnit}`).set(auth(admin))).body;
    expect(l).toMatchObject({ overdue: true, lateDays: 3 });
    const overdue = (await http.get(`${base()}/loans?overdue=1`).set(auth(admin))).body;
    expect(overdue.items.map((x: { id: string }) => x.id)).toEqual([s.loanUnit]);
    expect((await http.get(`${base()}/dashboard/stats`).set(auth(admin))).body.overdueLoans).toBe(1);
    // الإرجاع يحرر الوحدة ويحفظ التأخير المحتسب عند الإرجاع
    await http.post(`${base()}/loans/${s.loanUnit}/returns`).set(auth(admin)).send({ quantity: 1, damaged: false, conditionIn: "GOOD" });
    const after = (await http.get(`${base()}/loans/${s.loanUnit}`).set(auth(admin))).body;
    expect(after).toMatchObject({ status: "RETURNED", overdue: false, lateDays: 3 });
    const u = (await http.get(`${base()}/resources/${s.projector}`).set(auth(admin))).body.units.find((x: { id: string }) => x.id === s.unit1);
    expect(u.status).toBe("AVAILABLE");
  });

  it("تاريخ إرجاع في الماضي مرفوض، والوحدة المعطوبة عند الإرجاع تصبح معطوبة", async () => {
    expect((await http.post(`${base()}/loans`).set(auth(admin)).send({ resourceId: s.projector, unitId: s.unit1, quantity: 1, borrowerStaffId: s.teacher, dueAt: inDays(-1) })).body.error.details.fields.dueAt).toBe("errors.dueInPast");
    const l = await http.post(`${base()}/loans`).set(auth(admin)).send({ resourceId: s.projector, unitId: s.unit1, quantity: 1, borrowerStaffId: s.teacher, dueAt: today() });
    expect(l.status).toBe(201);
    await http.post(`${base()}/loans/${l.body.id}/returns`).set(auth(admin)).send({ quantity: 1, damaged: true, conditionIn: "POOR", notes: "عدسة مكسورة" });
    const u = (await http.get(`${base()}/resources/${s.projector}`).set(auth(admin))).body.units.find((x: { id: string }) => x.id === s.unit1);
    expect(u.status).toBe("DAMAGED");
  });

  it("إعادة إرسال نفس الإعارة (clientOpId) لا تنشئ إعارة ثانية", async () => {
    const body = { resourceId: s.maps, quantity: 1, borrowerStaffId: s.teacher, dueAt: inDays(2), clientOpId: "op-loan-1" };
    const a = await http.post(`${base()}/loans`).set(auth(admin)).send(body);
    const b = await http.post(`${base()}/loans`).set(auth(admin)).send(body);
    expect(a.body.id).toBe(b.body.id);
    expect(b.body.replayed).toBe(true);
  });

  it("الصنف المعار لا يُؤرشف، ورمز QR للوحدة يُحل إلى صنفها", async () => {
    expect((await http.post(`${base()}/resources/${s.maps}/archive`).set(auth(admin))).body.error.code).toBe("RESOURCE_ON_LOAN");
    const unit = await prisma.educationalResourceUnit.findUniqueOrThrow({ where: { id: s.unit2 } });
    const r = await http.get(`/api/v1/scan/${unit.qrToken}`).set(auth(admin));
    expect(r.body).toMatchObject({ kind: "resourceUnit", id: s.projector, unitId: s.unit2, schoolId: sid });
  });
});

describe("الصلاحيات", () => {
  it("مسؤول الوسائل يعير ويدير الموظفين، ولا ينشئ فضاءات؛ الاطلاع لا يعير", async () => {
    const er = await userWithRole(http, admin, sid, "resmgr", ["EDUCATIONAL_RESOURCES_MANAGER"]);
    const v = await userWithRole(http, admin, sid, "viewer5", ["VIEWER"]);
    expect((await http.post(`${base()}/staff`).set(auth(er.token)).send({ fullNameAr: "مستعير جديد", type: "TEACHER" })).status).toBe(201);
    expect((await http.post(`${base()}/rooms`).set(auth(er.token)).send({ code: "X1", name: "س", spaceTypeId: s.office, status: "GOOD" })).status).toBe(403);
    expect((await http.get(`${base()}/rooms`).set(auth(er.token))).status).toBe(200);
    expect((await http.post(`${base()}/loans`).set(auth(v.token)).send({ resourceId: s.maps, quantity: 1, borrowerStaffId: s.teacher, dueAt: inDays(1) })).status).toBe(403);
    expect((await http.post(`${base()}/staff`).set(auth(v.token)).send({ fullNameAr: "س", type: "TEACHER" })).status).toBe(403);
    expect((await http.get(`${base()}/loans`).set(auth(v.token))).status).toBe(200);
  });

  it("نشاط الإعارة يظهر في لوحة القيادة", async () => {
    const act = (await http.get(`${base()}/dashboard/activity?limit=30`).set(auth(admin))).body.map((a: { action: string }) => a.action);
    expect(act).toContain("activity.loanCreated");
    expect(act).toContain("activity.loanReturned");
  });
});
