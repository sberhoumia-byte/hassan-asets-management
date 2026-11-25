import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** يتحقق فقط من وجود قاعدة اختبار منفصلة. كل ملف اختبار ينشئ مخططه المعزول في test/env.ts. */
export default async function setup() {
  const root = resolve(__dirname, "../../..");
  if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is required for API integration tests");
  if (new URL(base).pathname === new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname)
    throw new Error("TEST_DATABASE_URL must point to a different database than DATABASE_URL");
}
