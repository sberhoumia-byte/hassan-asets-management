// يشغّل اختبارات الواجهة على الخادم الحقيقي:
// 1) مخطط جديد e2e_<زمن> في TEST_DATABASE_URL (قاعدة الاختبار، لا التطوير) ← migrate deploy ← بيانات الأساس
// 2) الخادم على المنفذ 3100 ← Playwright ← حذف المخطط الذي أنشأه هذا التشغيل فقط
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "../../..");
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
const base = process.env.TEST_DATABASE_URL;
if (!base) throw new Error("TEST_DATABASE_URL is required");
const { Client } = createRequire(join(root, "apps/api/package.json"))("pg");

const schema = `e2e_${Date.now()}`;
const u = new URL(base);
u.searchParams.set("schema", schema);
const url = u.toString();

async function sql(q) {
  const c = new Client({ connectionString: base });
  await c.connect();
  try {
    await c.query(q);
  } finally {
    await c.end();
  }
}

let api;
let code = 1;
try {
  await sql(`CREATE SCHEMA "${schema}"`);
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { cwd: join(root, "database"), env, stdio: "inherit" });
  execSync("npx tsx seeds/seed.ts", { cwd: join(root, "database"), env, stdio: "inherit" });
  execSync("npm run build", { cwd: join(root, "apps/api"), stdio: "inherit" });
  api = spawn("node", ["dist/main.js"], {
    cwd: join(root, "apps/api"),
    env: { ...env, API_PORT: "3100", WEB_ORIGIN: "http://localhost:4174", STORAGE_PATH: mkdtempSync(join(tmpdir(), "hassan-e2e-")), LOGIN_RATE_LIMIT: "200" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch("http://localhost:3100/api/v1/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const r = spawn("npx", ["playwright", "test", "-c", "playwright.server.config.ts", ...process.argv.slice(2)], {
    cwd: join(root, "apps/web"),
    stdio: "inherit",
    env: { ...process.env, API_PROXY_TARGET: "http://localhost:3100" },
  });
  code = await new Promise((res) => r.on("exit", (c) => res(c ?? 1)));
} finally {
  api?.kill();
  await sql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch((e) => console.error(e));
}
process.exit(code);
