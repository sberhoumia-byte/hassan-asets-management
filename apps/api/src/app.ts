import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { json, raw } from "express";
import { AppModule } from "./app.module";
import { ErrorFilter } from "./common/errors";
import { requestId } from "./common/request-id";
import { config } from "./config";

/** ينشئ التطبيق (يُستعمل في main.ts وفي اختبارات التكامل). */
export async function createApp(opts: { logger?: boolean } = {}) {
  const c = config();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: opts.logger === false ? false : ["error", "warn", "log"],
  });
  app.set("trust proxy", "loopback"); // خلف nginx في Docker
  app.use(requestId);
  app.use(helmet());
  app.use(cookieParser());
  // الصور (الشعار والترويسة) تُرسل كـ data URL داخل JSON: حتى 5MB للترويسة ≈ 7MB base64
  app.use(json({ limit: "12mb" }));
  // رفع نسخة احتياطية مشفرة (ملف خام) — هذا المسار وحده يقبل الحجم الكبير
  app.use("/api/v1/backups/upload", raw({ type: "application/octet-stream", limit: "1gb" }));
  app.enableCors({
    origin: c.WEB_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
    exposedHeaders: ["Content-Disposition", "X-Report-Id", "X-Report-Number", "X-Report-Pages"],
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ErrorFilter());

  if (c.NODE_ENV !== "production") {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("Hassan Ibn Thabit – Assets API").setVersion("0.3.0").addBearerAuth().build(),
    );
    SwaggerModule.setup("api/docs", app, doc);
  }
  return app;
}
