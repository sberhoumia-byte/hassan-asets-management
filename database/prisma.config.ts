import { defineConfig } from "prisma/config";

// DATABASE_URL يُقرأ من البيئة (.env) — لا قيم حقيقية في المستودع.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder@localhost:5432/placeholder",
  },
});
