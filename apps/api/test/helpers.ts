import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp } from "../src/app";
import { PrismaService } from "../src/prisma/prisma.service";

export const ADMIN_PW = "AdminPass2026x";
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** تطبيق على مخطط الملف المعزول + حساب مدير نظام جاهز. */
export async function bootApp() {
  const app: INestApplication = await createApp({ logger: false });
  await app.init();
  const http = request(app.getHttpServer());
  const prisma = app.get(PrismaService);
  await http.post("/api/v1/auth/setup").send({ fullNameAr: "مدير النظام", username: "admin", password: ADMIN_PW, confirmPassword: ADMIN_PW });
  const l = await http.post("/api/v1/auth/login").send({ username: "admin", password: ADMIN_PW });
  return { app, http, prisma, admin: l.body.accessToken as string, schoolId: l.body.user.roles[0].schoolId as string };
}

/** ينشئ مستخدماً بدور في المؤسسة ويغير كلمة مروره المؤقتة، ويعيد رمز دخوله. */
export async function userWithRole(http: ReturnType<typeof request>, admin: string, schoolId: string, username: string, roles: string[]) {
  const c = await http.post("/api/v1/users").set(auth(admin)).set("X-School-Id", schoolId).send({ username, fullNameAr: username, roles });
  const l = await http.post("/api/v1/auth/login").send({ username, password: c.body.temporaryPassword });
  const pw = "UserPass2026x";
  await http.post("/api/v1/auth/change-password").set(auth(l.body.accessToken)).send({ currentPassword: c.body.temporaryPassword, newPassword: pw });
  return { token: l.body.accessToken as string, id: c.body.user.id as string };
}
