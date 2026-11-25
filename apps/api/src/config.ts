import { z } from "zod";

/** إعدادات الخادم من متغيرات البيئة فقط — يرفض التشغيل إن نقص سر أو كان ضعيفاً. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().default(3000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  STORAGE_PATH: z.string().default("./storage"),
  /** إن وُجد، يجب تقديمه في الإعداد الأول (يمنع أي شخص آخر من إنشاء حساب المدير على خادم عام). */
  SETUP_TOKEN: z.string().optional(),
  /** حد محاولات الدخول لكل عنوان IP في الدقيقة (حماية من التخمين، إضافة إلى قفل الحساب). */
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  /** مسار Chromium لتوليد PDF (إن لم يُحدد يُستعمل متصفح Playwright المثبت). */
  CHROMIUM_PATH: z.string().optional(),
  /** تعطيل عزل Chromium (مطلوب أحياناً داخل الحاويات). */
  PDF_NO_SANDBOX: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  /** مجلد خطوط @fontsource إن لم يكن في node_modules. */
  FONTS_PATH: z.string().optional(),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;
export function config(): AppConfig {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
export function resetConfigForTests() {
  cached = null;
}
