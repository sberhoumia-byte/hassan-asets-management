import { execSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterAll } from "vitest";

/**
 * لكل ملف اختبار: مخطط جديد فارغ test_<زمن>_<عشوائي> داخل TEST_DATABASE_URL (لا قاعدة التطوير أبداً)
 * ← migrate deploy (غير هدّام) ← بيانات الأساس، ثم يُحذف ذلك المخطط وحده بعد انتهاء الملف.
 */
const root = resolve(__dirname, "../../..");
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
const base = process.env.TEST_DATABASE_URL!;
const schema = `test_${Date.now()}_${randomBytes(3).toString("hex")}`;
const u = new URL(base);
u.searchParams.set("schema", schema);
const url = u.toString();

async function sql(q: string) {
  const c = new Client({ connectionString: base });
  await c.connect();
  try {
    await c.query(q);
  } finally {
    await c.end();
  }
}

await sql(`CREATE SCHEMA "${schema}"`);
const env = { ...process.env, DATABASE_URL: url };
execSync("npx prisma migrate deploy", { cwd: join(root, "database"), env, stdio: "pipe" });
execSync("npx tsx seeds/seed.ts", { cwd: join(root, "database"), env, stdio: "pipe" });

process.env.DATABASE_URL = url;
process.env.NODE_ENV = "test";
process.env.LOGIN_RATE_LIMIT = "1000";
process.env.STORAGE_PATH = mkdtempSync(join(tmpdir(), "hassan-storage-"));
delete process.env.SETUP_TOKEN;

afterAll(async () => {
  await sql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});
