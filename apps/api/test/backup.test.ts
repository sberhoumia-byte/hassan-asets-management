import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type request from "supertest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { auth, ADMIN_PW, bootApp, userWithRole } from "./helpers";
import { BackupService, pgTarget, RESTORE_PHRASE } from "../src/backup/backup.service";
import { resetConfigForTests } from "../src/config";
import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * المرحلة 9: النسخ الاحتياطي المشفر، التحقق، رفض النسخ المعدلة، الاستعادة (بكلمة المرور والعبارة ونسخة أمان)،
 * والاستعادة على قاعدة فارغة مع مقارنة عدد السجلات.
 */
const BK = mkdtempSync(join(tmpdir(), "hassan-bk-test-"));
process.env.BACKUP_PATH = BK;
process.env.BACKUP_ENCRYPTION_KEY = "test-backup-key-0123456789";
resetConfigForTests();

let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let admin = "";
let sid = "";
let cat = "";
let first = "";
const B = "/api/v1/backups";

beforeAll(async () => {
  ({ app, http, prisma, admin, schoolId: sid } = await bootApp());
  cat = (await http.post(`/api/v1/schools/${sid}/categories`).set(auth(admin)).send({ code: "BK", nameAr: "أثاث" })).body.id;
  for (const n of ["طاولة", "كرسي"]) await http.post(`/api/v1/schools/${sid}/assets`).set(auth(admin)).send({ name: n, categoryId: cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE" });
});

afterAll(async () => {
  await app?.close();
});

const assets = () => prisma.asset.count({ where: { schoolId: sid } });

describe("النسخ الاحتياطي والاستعادة", () => {
  it("لمدير النظام فقط", async () => {
    const d = await userWithRole(http, admin, sid, "dirbk", ["DIRECTOR"]);
    expect((await http.post(B).set(auth(d.token))).status).toBe(403);
    expect((await http.get(B).set(auth(d.token))).status).toBe(403);
  });

  it("إنشاء نسخة مشفرة ببصمة، والملف لا يكشف محتوى القاعدة", async () => {
    const r = await http.post(B).set(auth(admin));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: "SUCCEEDED", kind: "FULL" });
    expect(r.body.sha256).toMatch(/^[0-9a-f]{64}$/);
    first = r.body.id;
    const file = readdirSync(BK).find((f) => f.includes(first))!;
    const buf = readFileSync(join(BK, file));
    expect(buf.subarray(0, 4).toString()).toBe("HBK1");
    expect(buf.includes(Buffer.from("PGDMP"))).toBe(false);
    expect(buf.includes(Buffer.from("طاولة"))).toBe(false);
    const list = (await http.get(B).set(auth(admin))).body;
    expect(list).toMatchObject({ encryption: true, restorePhrase: RESTORE_PHRASE });
    expect(list.items[0].id).toBe(first);
  });

  it("التحقق يفك التشفير ويطابق البصمات ويعرض عدد السجلات", async () => {
    const v = await http.post(`${B}/${first}/verify`).set(auth(admin));
    expect(v.status).toBe(200);
    expect(v.body.status).toBe("VERIFIED");
    expect(v.body.manifest.counts.assets).toBe(2);
    expect(v.body.manifest.migration).toBe(v.body.currentMigration);
  });

  it("التنزيل ثم الرفع: النسخة السليمة تُقبل، والمعدلة بايتاً واحداً تُرفض", async () => {
    const d = await http.get(`${B}/${first}/download`).set(auth(admin)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(d.status).toBe(200);
    const buf = d.body as Buffer;
    const tampered = Buffer.from(buf);
    tampered[Math.floor(buf.length / 2)]! ^= 0xff;
    const bad = await http.post(`${B}/upload`).set(auth(admin)).set("Content-Type", "application/octet-stream").send(tampered);
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("BACKUP_DECRYPT_FAILED");
    const junk = await http.post(`${B}/upload`).set(auth(admin)).set("Content-Type", "application/octet-stream").send(Buffer.from("not a backup at all......................................"));
    expect(junk.status).toBe(400);
    const ok = await http.post(`${B}/upload`).set(auth(admin)).set("Content-Type", "application/octet-stream").send(buf);
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe("VERIFIED");
  });

  it("الاستعادة على قاعدة فارغة تعطي نفس عدد السجلات", async () => {
    const svc = app.get(BackupService);
    const row = await prisma.backupRecord.findUniqueOrThrow({ where: { id: first } });
    const { tmp, manifest } = await (svc as unknown as { open: (r: object) => Promise<{ tmp: string; manifest: { counts: Record<string, number> } }> }).open(row);
    const { conn, schema } = pgTarget();
    const db = `hassan_restore_${Date.now()}`;
    const admin = new Client({ connectionString: conn });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${db}"`);
    try {
      const u = new URL(conn);
      u.pathname = `/${db}`;
      execFileSync("pg_restore", ["--no-owner", "--no-privileges", "--exit-on-error", `--dbname=${u}`, join(tmp, "db.dump")]);
      u.searchParams.set("schema", schema);
      expect(await svc.counts(u.toString())).toEqual(manifest.counts);
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS "${db}"`);
      await admin.end();
    }
  });

  it("الاستعادة تتطلب العبارة وكلمة المرور، ثم تعيد البيانات وتحفظ نسخة أمان وسجل النسخ", async () => {
    await http.post(`/api/v1/schools/${sid}/assets`).set(auth(admin)).send({ name: "خزانة بعد النسخة", categoryId: cat, trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE" });
    expect(await assets()).toBe(3);
    const before = await prisma.backupRecord.count();
    expect((await http.post(`${B}/${first}/restore`).set(auth(admin)).send({ password: ADMIN_PW, confirm: "نعم" })).status).toBe(400);
    const wrong = await http.post(`${B}/${first}/restore`).set(auth(admin)).send({ password: "wrong-password-1", confirm: RESTORE_PHRASE });
    expect(wrong.body.error.code).toBe("WRONG_PASSWORD");
    expect(await assets()).toBe(3);

    const r = await http.post(`${B}/${first}/restore`).set(auth(admin)).send({ password: ADMIN_PW, confirm: RESTORE_PHRASE });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("RESTORED");
    expect(r.body.safetyBackupId).toBeTruthy();
    expect(await assets()).toBe(2);
    // سجل النسخ لم يرجع إلى حالة النسخة القديمة: كل النسخ (ومنها نسخة الأمان) باقية
    expect(await prisma.backupRecord.count()).toBe(before + 1);
    expect(await prisma.auditLog.count({ where: { action: "BACKUP_RESTORE", entityId: first } })).toBe(1);
    // التطبيق يعمل بعد الاستعادة، ونسخة الأمان تحمل الحالة السابقة
    expect((await http.get(`/api/v1/schools/${sid}/assets`).set(auth(admin))).body.total).toBe(2);
    const safety = await http.post(`${B}/${r.body.safetyBackupId}/verify`).set(auth(admin));
    expect(safety.body.manifest.counts.assets).toBe(3);
  });

  it("دون مفتاح تشفير يُرفض إنشاء النسخ", async () => {
    const k = process.env.BACKUP_ENCRYPTION_KEY;
    delete process.env.BACKUP_ENCRYPTION_KEY;
    resetConfigForTests();
    try {
      const r = await http.post(B).set(auth(admin));
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe("BACKUP_KEY_MISSING");
    } finally {
      process.env.BACKUP_ENCRYPTION_KEY = k;
      resetConfigForTests();
    }
  });
});
