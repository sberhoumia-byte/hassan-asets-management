import { defineConfig } from "prisma/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// يقرأ ../.env إن وُجد (التطوير). في الإنتاج تأتي المتغيرات من البيئة مباشرة.
const envFile = resolve(__dirname, "../.env");
if (existsSync(envFile) && !process.env.DATABASE_URL) process.loadEnvFile(envFile);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "migrations", seed: "tsx seeds/seed.ts" },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder@localhost:5432/placeholder",
  },
});
