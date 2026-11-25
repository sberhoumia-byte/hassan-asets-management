import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../src/app";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetConfigForTests } from "../src/config";

/**
 * اختبارات تكامل على قاعدة PostgreSQL حقيقية (TEST_DATABASE_URL).
 * الكتل متسلسلة وتتشارك الحالة: الإعداد الأول ← الدخول ← التسلسل ← المستخدمون ← الصلاحيات ← الهوية.
 */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const ADMIN_PW = "AdminPass2026x";

let app: INestApplication;
let prisma: PrismaService;
let http: ReturnType<typeof request>;
const s = { admin: "", adminCookie: "", schoolA: "", schoolB: "", academy: "", directorate: "", viewer: "", viewerId: "" };

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const cookieOf = (res: request.Response) => {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith("hat_refresh="))?.split(";")[0] ?? "";
};
async function login(username: string, password: string) {
  const res = await http.post("/api/v1/auth/login").send({ username, password });
  return res;
}

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  prisma = app.get(PrismaService);
  http = request(app.getHttpServer());
});
afterAll(async () => {
  await app?.close();
});

describe("الإعداد الأول", () => {
  it("الخادم يعمل وقاعدة البيانات متصلة", async () => {
    expect((await http.get("/api/v1/health")).body).toEqual({ status: "ok" });
  });

  it("يتطلب الإعداد حين لا يوجد مستخدمون", async () => {
    expect((await http.get("/api/v1/auth/setup-status")).body).toEqual({ needsSetup: true, setupTokenRequired: false });
  });

  it("يرفض كلمة مرور ضعيفة", async () => {
    const res = await http.post("/api/v1/auth/setup").send({ fullNameAr: "مدير", username: "admin", password: "short", confirmPassword: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.fields.password).toBe("errors.passwordMin");
  });

  it("إن ضُبط SETUP_TOKEN فلا إعداد بدونه", async () => {
    process.env.SETUP_TOKEN = "test-setup-token-123";
    resetConfigForTests();
    try {
      expect((await http.get("/api/v1/auth/setup-status")).body.setupTokenRequired).toBe(true);
      const body = { fullNameAr: "دخيل", username: "intruder", password: ADMIN_PW, confirmPassword: ADMIN_PW };
      expect((await http.post("/api/v1/auth/setup").send(body)).status).toBe(403);
      expect((await http.post("/api/v1/auth/setup").send({ ...body, setupToken: "wrong" })).status).toBe(403);
      expect(await prisma.user.count()).toBe(0);
    } finally {
      delete process.env.SETUP_TOKEN;
      resetConfigForTests();
    }
  });

  it("ينشئ حساب المدير مرة واحدة فقط", async () => {
    const body = { fullNameAr: "مدير النظام", username: "admin", password: ADMIN_PW, confirmPassword: ADMIN_PW };
    expect((await http.post("/api/v1/auth/setup").send(body)).status).toBe(201);
    const again = await http.post("/api/v1/auth/setup").send({ ...body, username: "admin2" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_SET_UP");
    expect((await http.get("/api/v1/auth/setup-status")).body).toMatchObject({ needsSetup: false });
  });
});

describe("المصادقة والجلسات", () => {
  it("يرفض بيانات خاطئة دون كشف وجود الحساب", async () => {
    const a = await login("admin", "WrongPass123");
    const b = await login("nobody", "WrongPass123");
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.code).toBe(b.body.error.code);
  });

  it("يسجل الدخول ويضع رمز التجديد في كوكي httpOnly", async () => {
    const res = await login("ADMIN", ADMIN_PW); // اسم المستخدم غير حساس لحالة الأحرف
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.isSystemAdmin).toBe(true);
    expect(res.body.user.mustChangePassword).toBe(false);
    const raw = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Path=\/api\/v1\/auth/);
    s.admin = res.body.accessToken;
    s.adminCookie = cookieOf(res);
    s.schoolA = res.body.user.roles[0].schoolId;
    expect(res.body.user.permissions[s.schoolA]).toContain("backup.restore");
  });

  it("يرفض الطلبات دون رمز أو برمز مزور", async () => {
    expect((await http.get("/api/v1/auth/me")).status).toBe(401);
    expect((await http.get("/api/v1/auth/me").set(auth(s.admin + "x"))).status).toBe(401);
  });

  it("يدوّر رمز التجديد، ويلغي كل الجلسات عند إعادة استعمال رمز قديم", async () => {
    const r1 = await http.post("/api/v1/auth/refresh").set("Cookie", s.adminCookie);
    expect(r1.status).toBe(200);
    const newCookie = cookieOf(r1);
    expect(newCookie).not.toBe(s.adminCookie);
    // استعمال الرمز القديم فوراً: مرفوض (نافذة التسامح لا تلغي الجلسات)
    expect((await http.post("/api/v1/auth/refresh").set("Cookie", s.adminCookie)).status).toBe(401);
    // محاكاة إعادة استعمال بعد مدة: يُلغي كل جلسات المستخدم
    await prisma.$executeRaw`UPDATE auth_sessions SET "revokedAt" = now() - interval '1 hour' WHERE "revokedAt" IS NOT NULL`;
    expect((await http.post("/api/v1/auth/refresh").set("Cookie", s.adminCookie)).status).toBe(401);
    expect((await http.post("/api/v1/auth/refresh").set("Cookie", newCookie)).status).toBe(401);
    expect((await http.get("/api/v1/auth/me").set(auth(r1.body.accessToken))).status).toBe(401);
    const again = await login("admin", ADMIN_PW);
    s.admin = again.body.accessToken;
    s.adminCookie = cookieOf(again);
  });

  it("الخروج يلغي الجلسة", async () => {
    const l = await login("admin", ADMIN_PW);
    const token = l.body.accessToken;
    expect((await http.post("/api/v1/auth/logout").set("Cookie", cookieOf(l))).status).toBe(204);
    expect((await http.get("/api/v1/auth/me").set(auth(token))).status).toBe(401);
  });
});

describe("التسلسل الإداري", () => {
  it("يعرض التسلسل الافتراضي المزروع", async () => {
    const academies = (await http.get("/api/v1/academies").set(auth(s.admin))).body;
    expect(academies).toHaveLength(1);
    expect(academies[0].nameAr).toContain("سوس ماسة");
    const dirs = (await http.get(`/api/v1/directorates?academyId=${academies[0].id}`).set(auth(s.admin))).body;
    expect(dirs).toHaveLength(1);
    s.academy = academies[0].id;
    s.directorate = dirs[0].id;
  });

  it("يمنع الأسماء المكررة ويتحقق من الأب", async () => {
    const dup = await http.post("/api/v1/academies").set(auth(s.admin)).send({ nameAr: "الأكاديمية الجهوية للتربية والتكوين لجهة سوس ماسة" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_NAME");
    const orphan = await http
      .post("/api/v1/directorates")
      .set(auth(s.admin))
      .send({ academyId: "00000000-0000-4000-8000-000000000000", nameAr: "مديرية" });
    expect(orphan.status).toBe(422);
    expect(orphan.body.error.code).toBe("ACADEMY_NOT_FOUND");
  });

  it("ينشئ مؤسسة ثانية ويمنع تكرار الرمز الإداري", async () => {
    const b = await http.post("/api/v1/schools").set(auth(s.admin)).send({ directorateId: s.directorate, nameAr: "مؤسسة اختبار ب", adminCode: "TEST-B" });
    expect(b.status).toBe(201);
    s.schoolB = b.body.id;
    const dup = await http.post("/api/v1/schools").set(auth(s.admin)).send({ directorateId: s.directorate, nameAr: "مؤسسة ج", adminCode: "TEST-B" });
    expect(dup.body.error.code).toBe("DUPLICATE_ADMIN_CODE");
  });

  it("البحث العربي يتجاهل الهمزات والتشكيل", async () => {
    const res = await http.get("/api/v1/schools").query({ q: "اورير" }).set(auth(s.admin));
    expect(res.body.map((x: { id: string }) => x.id)).toEqual([s.schoolA]);
  });

  it("يحدّث المؤسسة والسنة الدراسية الحالية", async () => {
    const cur = (await http.get(`/api/v1/schools/${s.schoolA}`).set(auth(s.admin))).body;
    const res = await http
      .put(`/api/v1/schools/${s.schoolA}`)
      .set(auth(s.admin))
      .send({ ...cur, phone: "0528 00 00 00", schoolYear: "2026/2027" });
    expect(res.status).toBe(200);
    expect(res.body.schoolYear).toBe("2026/2027");
    await http.put(`/api/v1/schools/${s.schoolA}`).set(auth(s.admin)).send({ ...cur, schoolYear: "2027/2028" });
    const years = await prisma.schoolYear.findMany({ where: { schoolId: s.schoolA } });
    expect(years.filter((y) => y.isCurrent).map((y) => y.label)).toEqual(["2027/2028"]);
  });
});

describe("المستخدمون والصلاحيات وعزل المؤسسات", () => {
  it("ينشئ مستخدماً بكلمة مرور مؤقتة ويجبره على تغييرها", async () => {
    const res = await http
      .post("/api/v1/users")
      .set(auth(s.admin))
      .set("X-School-Id", s.schoolA)
      .send({ username: "viewer1", fullNameAr: "مستخدم اطلاع", roles: ["VIEWER"] });
    expect(res.status).toBe(201);
    expect(res.body.user.mustChangePassword).toBe(true);
    s.viewerId = res.body.user.id;
    const l = await login("viewer1", res.body.temporaryPassword);
    expect(l.body.user.mustChangePassword).toBe(true);
    const blocked = await http.get(`/api/v1/schools/${s.schoolA}/dashboard/stats`).set(auth(l.body.accessToken));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    const ch = await http
      .post("/api/v1/auth/change-password")
      .set(auth(l.body.accessToken))
      .send({ currentPassword: res.body.temporaryPassword, newPassword: "ViewerPass2026" });
    expect(ch.status).toBe(204);
    s.viewer = l.body.accessToken;
    expect((await http.get(`/api/v1/schools/${s.schoolA}/dashboard/stats`).set(auth(s.viewer))).status).toBe(200);
  });

  it("المستخدم لا يرى إلا مؤسسته، والوصول لغيرها مرفوض", async () => {
    const list = (await http.get("/api/v1/schools").set(auth(s.viewer))).body;
    expect(list.map((x: { id: string }) => x.id)).toEqual([s.schoolA]);
    const other = await http.get(`/api/v1/schools/${s.schoolB}/dashboard/stats`).set(auth(s.viewer));
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe("SCHOOL_ACCESS_DENIED");
  });

  it("دور الاطلاع لا يعدّل، والمسارات الإدارية لمدير النظام فقط", async () => {
    const r = await http.post(`/api/v1/schools/${s.schoolA}/branding/reset`).set(auth(s.viewer));
    expect(r.status).toBe(403);
    expect(r.body.error).toMatchObject({ code: "FORBIDDEN", details: { permission: "branding.update" } });
    expect((await http.post("/api/v1/academies").set(auth(s.viewer)).send({ nameAr: "س" })).status).toBe(403);
    expect((await http.get("/api/v1/users").set(auth(s.viewer)).set("X-School-Id", s.schoolA)).status).toBe(403);
  });

  it("المنح والسحب الفردي يغيّران الصلاحيات الفعلية", async () => {
    const res = await http
      .put(`/api/v1/users/${s.viewerId}/overrides`)
      .set(auth(s.admin))
      .set("X-School-Id", s.schoolA)
      .send({ overrides: [{ permission: "branding.update", granted: true }, { permission: "dashboard.view", granted: false }] });
    expect(res.status).toBe(200);
    expect((await http.post(`/api/v1/schools/${s.schoolA}/branding/reset`).set(auth(s.viewer))).status).toBe(200);
    expect((await http.get(`/api/v1/schools/${s.schoolA}/dashboard/stats`).set(auth(s.viewer))).status).toBe(403);
    const me = (await http.get("/api/v1/auth/me").set(auth(s.viewer))).body;
    expect(me.permissions[s.schoolA]).toContain("branding.update");
    expect(me.permissions[s.schoolA]).not.toContain("dashboard.view");
  });

  it("مدير المؤسسة لا يستطيع التصعيد إلى مدير النظام", async () => {
    const d = await http
      .post("/api/v1/users")
      .set(auth(s.admin))
      .set("X-School-Id", s.schoolA)
      .send({ username: "director1", fullNameAr: "مدير المؤسسة", roles: ["DIRECTOR"] });
    const l = await login("director1", d.body.temporaryPassword);
    await http.post("/api/v1/auth/change-password").set(auth(l.body.accessToken)).send({ currentPassword: d.body.temporaryPassword, newPassword: "DirectorPass2026" });
    const tok = l.body.accessToken;
    const esc = await http.post("/api/v1/users").set(auth(tok)).set("X-School-Id", s.schoolA).send({ username: "xadmin1", fullNameAr: "س", roles: ["ADMIN"] });
    expect(esc.status).toBe(403);
    const grant = await http
      .put(`/api/v1/users/${s.viewerId}/overrides`)
      .set(auth(tok))
      .set("X-School-Id", s.schoolA)
      .send({ overrides: [{ permission: "backup.restore", granted: true }] }); // المدير لا يملكها
    expect(grant.status).toBe(403);
    const adminId = (await http.get("/api/v1/auth/me").set(auth(s.admin))).body.id;
    expect((await http.post(`/api/v1/users/${adminId}/reset-password`).set(auth(tok)).set("X-School-Id", s.schoolA)).status).toBe(403);
    const users = (await http.get("/api/v1/users").set(auth(tok)).set("X-School-Id", s.schoolA)).body;
    expect(users.map((u: { username: string }) => u.username).sort()).toEqual(["admin", "director1", "viewer1"]);
  });

  it("لا يمكن إزالة آخر مدير نظام", async () => {
    const adminId = (await http.get("/api/v1/auth/me").set(auth(s.admin))).body.id;
    const res = await http.put(`/api/v1/users/${adminId}/roles`).set(auth(s.admin)).set("X-School-Id", s.schoolA).send({ roles: ["DIRECTOR"] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("LAST_ADMIN");
    const roles = await prisma.userRole.count({ where: { userId: adminId, role: { code: "ADMIN" } } });
    expect(roles).toBe(1); // المعاملة أُلغيت كاملة
  });

  it("الحساب المعطل لا يدخل وتُلغى جلساته", async () => {
    const res = await http
      .put(`/api/v1/users/${s.viewerId}`)
      .set(auth(s.admin))
      .set("X-School-Id", s.schoolA)
      .send({ fullNameAr: "مستخدم اطلاع", status: "DISABLED" });
    expect(res.status).toBe(200);
    expect((await http.get("/api/v1/auth/me").set(auth(s.viewer))).status).toBe(401);
    expect((await login("viewer1", "ViewerPass2026")).status).toBe(401);
  });

  it("يقفل الحساب بعد 5 محاولات فاشلة", async () => {
    for (let i = 0; i < 4; i++) expect((await login("director1", "BadPass12345")).status).toBe(401);
    const fifth = await login("director1", "BadPass12345");
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe("ACCOUNT_LOCKED");
    expect((await login("director1", "DirectorPass2026")).status).toBe(423);
  });
});

describe("الهوية البصرية والترويسة", () => {
  it("تعرض الترويسة الافتراضية من التسلسل الإداري", async () => {
    await prisma.brandingSettings.deleteMany({ where: { schoolId: s.schoolB } });
    const b = (await http.get(`/api/v1/schools/${s.schoolB}/branding`).set(auth(s.admin))).body;
    expect(b.letterhead.version).toBe(1);
    expect(b.letterhead.mode).toBe("GENERATED");
    expect(b.letterhead.linesAr).toContain("مؤسسة اختبار ب");
    expect(b.logoDataUrl).toBeUndefined();
  });

  it("يحفظ الشعار كملف ويرقّم الإصدارات", async () => {
    const cur = (await http.get(`/api/v1/schools/${s.schoolB}/branding`).set(auth(s.admin))).body;
    const res = await http
      .put(`/api/v1/schools/${s.schoolB}/branding`)
      .set(auth(s.admin))
      .send({ logoWidthMm: 25, logoAlign: "right", logoDataUrl: PNG, letterhead: { ...cur.letterhead, version: undefined, linesAr: ["سطر مخصص"] } });
    expect(res.status).toBe(200);
    expect(res.body.letterhead.version).toBe(2);
    expect(res.body.letterhead.linesAr).toEqual(["سطر مخصص"]);
    expect(res.body.logoDataUrl).toBe(PNG);
    expect(res.body.updatedBy).toBe("مدير النظام");
    const files = await prisma.storedFile.findMany({ where: { schoolId: s.schoolB } });
    expect(files).toHaveLength(1);
    expect(files[0]!.mimeType).toBe("image/png");
    // حفظ ثانٍ بنفس الصورة لا ينشئ ملفاً جديداً
    await http.put(`/api/v1/schools/${s.schoolB}/branding`).set(auth(s.admin)).send({ ...res.body, schoolId: undefined, updatedAt: undefined, updatedBy: undefined });
    expect(await prisma.storedFile.count({ where: { schoolId: s.schoolB } })).toBe(1);
  });

  it("يرفض ملفاً نوعه الحقيقي ليس صورة", async () => {
    const cur = (await http.get(`/api/v1/schools/${s.schoolB}/branding`).set(auth(s.admin))).body;
    const fake = "data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64");
    const res = await http
      .put(`/api/v1/schools/${s.schoolB}/branding`)
      .set(auth(s.admin))
      .send({ logoWidthMm: 25, logoAlign: "right", logoDataUrl: fake, letterhead: cur.letterhead });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.logo).toBe("errors.fileType");
  });

  it("الاستعادة إصدار جديد يحتفظ بالشعار، والتاريخ محفوظ", async () => {
    const res = await http.post(`/api/v1/schools/${s.schoolB}/branding/reset`).set(auth(s.admin));
    expect(res.body.letterhead.version).toBe(4);
    expect(res.body.letterhead.linesAr).toContain("مؤسسة اختبار ب");
    expect(res.body.logoDataUrl).toBe(PNG);
    const hist = (await http.get(`/api/v1/schools/${s.schoolB}/branding/history`).set(auth(s.admin))).body;
    expect(hist.map((h: { version: number }) => h.version)).toEqual([4, 3, 2]);
    expect(hist[0].summaryKey).toBe("history.reset");
    expect(await prisma.letterhead.count({ where: { schoolId: s.schoolB } })).toBe(3);
    expect(await prisma.letterhead.count({ where: { schoolId: s.schoolB, isArchived: false } })).toBe(1);
  });
});

describe("لوحة القيادة والتدقيق", () => {
  it("الإحصائيات محسوبة من القاعدة (لا سجلات بعد = صفر)", async () => {
    const st = (await http.get(`/api/v1/schools/${s.schoolA}/dashboard/stats`).set(auth(s.admin))).body;
    expect(Object.values(st).every((v) => v === 0)).toBe(true);
    expect((await http.get(`/api/v1/schools/${s.schoolA}/dashboard/alerts`).set(auth(s.admin))).body).toEqual([]);
  });

  it("آخر العمليات من سجل التدقيق مع اسم المنفّذ", async () => {
    const act = (await http.get(`/api/v1/schools/${s.schoolA}/dashboard/activity?limit=50`).set(auth(s.admin))).body;
    const keys = act.map((a: { action: string }) => a.action);
    expect(keys).toContain("activity.setup");
    expect(keys).toContain("activity.userCreated");
    expect(keys).toContain("activity.schoolUpdated");
    expect(act.every((a: { schoolId?: string }) => !a.schoolId || a.schoolId === s.schoolA)).toBe(true);
  });

  it("سجل التدقيق لا يقبل التعديل ولا الحذف", async () => {
    await expect(prisma.$executeRaw`UPDATE audit_logs SET action = 'X'`).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow();
  });

  it("لا تُسجل كلمات المرور في التدقيق", async () => {
    const rows = await prisma.auditLog.findMany();
    expect(JSON.stringify(rows.map((r) => [r.before, r.after]))).not.toMatch(/Pass2026|passwordHash|temporaryPassword/);
  });
});
