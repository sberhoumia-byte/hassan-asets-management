import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RequestMethod, type INestApplication } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type request from "supertest";
import { defaultRolePermissions } from "@hassan/shared";
import { AppModule } from "../src/app.module";
import { ADMIN_ONLY, IS_PUBLIC, PERMISSION, SCHOOL_SCOPED } from "../src/common/context";
import { auth, bootApp, userWithRole } from "./helpers";

/**
 * المرحلة 9 — مصفوفة أمن آلية لكل مسارات الخادم (تُستخرج من المتحكمات نفسها، فأي مسار جديد يدخلها تلقائياً):
 * بلا رمز ← 401؛ دون الصلاحية ← 403؛ مؤسسة أخرى ← 403؛ مسارات مدير النظام ← 403؛ ولا 500 في أي حالة.
 */
type Route = { verb: string; path: string; perm?: string; adminOnly: boolean; scoped: boolean; isPublic: boolean };
const VERB: Record<number, string> = { [RequestMethod.GET]: "get", [RequestMethod.POST]: "post", [RequestMethod.PUT]: "put", [RequestMethod.DELETE]: "delete", [RequestMethod.PATCH]: "patch" };

function routes(): Route[] {
  const out: Route[] = [];
  const ctrls = (Reflect.getMetadata("controllers", AppModule) ?? []) as (new (...a: never[]) => unknown)[];
  for (const c of ctrls) {
    const base = String(Reflect.getMetadata(PATH_METADATA, c) ?? "");
    const proto = c.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const h = proto[name];
      if (name === "constructor" || typeof h !== "function") continue;
      const sub = Reflect.getMetadata(PATH_METADATA, h);
      const m = Reflect.getMetadata(METHOD_METADATA, h);
      if (sub === undefined || m === undefined) continue;
      const meta = (k: string) => Reflect.getMetadata(k, h) ?? Reflect.getMetadata(k, c);
      const path = `/${[base, sub].map((x) => String(x).replace(/^\/|\/$/g, "")).filter(Boolean).join("/")}`;
      out.push({ verb: VERB[m as number]!, path, perm: meta(PERMISSION), adminOnly: !!meta(ADMIN_ONLY), scoped: !!meta(SCHOOL_SCOPED), isPublic: !!meta(IS_PUBLIC) });
    }
  }
  return out;
}

const FAKE = "00000000-0000-4000-8000-000000000001";
const fill = (path: string, sid: string) => `/api/v1${path.replace(":schoolId", sid).replace(/:[A-Za-z]+/g, FAKE)}`;

let app: INestApplication;
let http: ReturnType<typeof request>;
let admin = "";
let sidA = "";
let sidB = "";
let viewer = "";
const all = routes();
const call = (r: Route, sid: string, token?: string) => {
  const req = (http as unknown as Record<string, (p: string) => request.Test>)[r.verb]!(fill(r.path, sid));
  if (token) req.set(auth(token));
  // المسارات بلا :schoolId تأخذ المؤسسة من الترويسة X-School-Id
  if (!r.path.includes(":schoolId")) req.set("X-School-Id", sid);
  return r.verb === "get" || r.verb === "delete" ? req : req.send({});
};

beforeAll(async () => {
  let schoolId = "";
  ({ app, http, admin, schoolId } = await bootApp());
  sidA = schoolId;
  const a = (await http.get(`/api/v1/schools/${sidA}`).set(auth(admin))).body;
  sidB = (await http.post("/api/v1/schools").set(auth(admin)).send({ directorateId: a.directorateId, nameAr: "مؤسسة الأمن ب", adminCode: "SEC-B" })).body.id;
  viewer = (await userWithRole(http, admin, sidA, "secviewer", ["VIEWER"])).token;
});

afterAll(async () => {
  await app?.close();
});

describe("مصفوفة الأمن لكل المسارات", () => {
  it("المسارات مستخرجة فعلاً (أكثر من 150)", () => {
    expect(all.length).toBeGreaterThan(150);
    expect(all.filter((r) => r.isPublic).map((r) => r.path).sort()).toEqual(
      expect.arrayContaining(["/auth/login", "/health"]),
    );
  });

  it("كل مسار غير عام يرفض الطلب بلا رمز دخول (401)", async () => {
    const bad: string[] = [];
    for (const r of all.filter((x) => !x.isPublic)) {
      const res = await call(r, sidA);
      if (res.status !== 401) bad.push(`${r.verb.toUpperCase()} ${r.path} → ${res.status}`);
    }
    expect(bad).toEqual([]);
  });

  it("رمز مزور أو بتوقيع خاطئ مرفوض", async () => {
    const forged = `${viewer.split(".").slice(0, 2).join(".")}.AAAA`;
    expect((await http.get(`/api/v1/schools/${sidA}/assets`).set(auth(forged))).status).toBe(401);
    expect((await http.get(`/api/v1/schools/${sidA}/assets`).set(auth("abc"))).status).toBe(401);
  });

  it("دور الاطلاع: كل مسار بصلاحية لا يملكها ← 403 FORBIDDEN، ومسارات مدير النظام ← 403", async () => {
    const has = new Set(defaultRolePermissions().VIEWER);
    const bad: string[] = [];
    let checked = 0;
    for (const r of all.filter((x) => !x.isPublic && ((x.perm && !has.has(x.perm)) || x.adminOnly))) {
      const res = await call(r, sidA, viewer);
      checked++;
      if (res.status !== 403) bad.push(`${r.verb.toUpperCase()} ${r.path} [${r.perm ?? "admin"}] → ${res.status}`);
    }
    expect(checked).toBeGreaterThan(80);
    expect(bad).toEqual([]);
  });

  it("مستخدم المؤسسة أ لا يصل لأي مسار في المؤسسة ب (403 SCHOOL_ACCESS_DENIED)", async () => {
    const bad: string[] = [];
    for (const r of all.filter((x) => x.perm || x.scoped)) {
      const res = await call(r, sidB, viewer);
      if (res.status !== 403 || res.body?.error?.code !== "SCHOOL_ACCESS_DENIED") bad.push(`${r.verb.toUpperCase()} ${r.path} → ${res.status} ${res.body?.error?.code ?? ""}`);
    }
    expect(bad).toEqual([]);
  });

  it("المسارات بمعرف مؤسسة دون صلاحية محددة لا تكشف مؤسسة أخرى", async () => {
    const rest = all.filter((x) => !x.isPublic && x.path.includes(":schoolId") && !x.perm && !x.scoped);
    const bad: string[] = [];
    for (const r of rest) {
      const res = await call(r, sidB, viewer);
      if (res.status < 400 || res.status >= 500) bad.push(`${r.verb.toUpperCase()} ${r.path} → ${res.status}`);
    }
    expect(bad).toEqual([]);
  });

  it("المسارات المسموحة للاطلاع بمعرفات غير موجودة أو جسم فارغ لا تُرجع 500", async () => {
    const has = new Set(defaultRolePermissions().VIEWER);
    const bad: string[] = [];
    for (const r of all.filter((x) => !x.isPublic && !x.adminOnly && (!x.perm || has.has(x.perm)))) {
      if (r.path.startsWith("/auth/")) continue; // الخروج وتغيير كلمة المرور يغيّران الجلسة
      const res = await call(r, sidA, viewer);
      if (res.status >= 500) bad.push(`${r.verb.toUpperCase()} ${r.path} → ${res.status}`);
    }
    // ولمدير النظام على كل المسارات (جسم فارغ ومعرفات غير موجودة)
    for (const r of all.filter((x) => !x.isPublic && !x.path.startsWith("/auth/"))) {
      const res = await call(r, sidA, admin);
      // النسخ الاحتياطي يُرجع 503 BACKUP_KEY_MISSING عمداً حين لا يُضبط مفتاح التشفير
      if (res.status >= 500 && res.body?.error?.code !== "BACKUP_KEY_MISSING") bad.push(`admin ${r.verb.toUpperCase()} ${r.path} → ${res.status}`);
    }
    expect(bad).toEqual([]);
  });

  it("ترويسات أمنية، CORS للأصل المسموح فقط، ولا كشف لتفاصيل الأخطاء الداخلية", async () => {
    const r = await http.get("/api/v1/health");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(r.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(r.headers["x-powered-by"]).toBeUndefined();
    const evil = await http.options(`/api/v1/schools/${sidA}/assets`).set("Origin", "https://evil.example").set("Access-Control-Request-Method", "GET");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
    const ok = await http.options(`/api/v1/schools/${sidA}/assets`).set("Origin", "http://localhost:5173").set("Access-Control-Request-Method", "GET");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    // JSON مشوه ← 400 دون رسالة المكتبة الداخلية
    const bad = await http.post("/api/v1/auth/login").set("Content-Type", "application/json").send("{bad json");
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toMatch(/SyntaxError|at JSON|stack/i);
    // جسم أكبر من الحد
    const big = await http.post("/api/v1/auth/login").set("Content-Type", "application/json").send(JSON.stringify({ username: "x".repeat(13 * 1024 * 1024) }));
    expect(big.status).toBe(413);
  });

  it("حقن SQL في البحث والمرشحات لا يغير شيئاً ولا يسبب خطأ", async () => {
    for (const q of ["' OR 1=1 --", "\"; DROP TABLE assets; --", "%' UNION SELECT password_hash FROM users --"]) {
      const r = await http.get(`/api/v1/schools/${sidA}/assets`).query({ q }).set(auth(admin));
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(0);
      const a = await http.get(`/api/v1/schools/${sidA}/audit-logs`).query({ action: q, entityType: q }).set(auth(admin));
      expect(a.status).toBe(200);
    }
  });
});
