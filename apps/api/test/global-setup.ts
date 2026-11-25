import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";

/**
 * قاعدة اختبار منفصلة (TEST_DATABASE_URL) — لا تُلمس قاعدة التطوير أبداً.
 * كل تشغيل ينشئ مخططاً جديداً فارغاً (test_<زمن>) ويطبق عليه الهجرات (migrate deploy، غير هدّام)
 * ثم بيانات الأساس فقط. في النهاية يُحذف ذلك المخطط وحده — الذي أنشأه هذا التشغيل نفسه.
 */
export default async function setup({ provide }: { provide: (k: string, v: string) => void }) {
  const root = resolve(__dirname, "../../..");
  const envFile = join(root, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is required for API integration tests");
  if (new URL(base).pathname === new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname)
    throw new Error("TEST_DATABASE_URL must point to a different database than DATABASE_URL");

  const schema = `test_${Date.now()}`;
  const u = new URL(base);
  u.searchParams.set("schema", schema);
  const url = u.toString();
  const pg = new Client({ connectionString: base });
  await pg.connect();
  await pg.query(`CREATE SCHEMA "${schema}"`);
  await pg.end();

  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { cwd: join(root, "database"), env, stdio: "pipe" });
  execSync("npx tsx seeds/seed.ts", { cwd: join(root, "database"), env, stdio: "pipe" });
  provide("testDatabaseUrl", url);

  return async () => {
    const c = new Client({ connectionString: base });
    await c.connect();
    await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await c.end();
  };
}
