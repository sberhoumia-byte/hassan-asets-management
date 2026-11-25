/**
 * مخططات التحقق المشتركة بين الواجهة والخادم.
 * رسائل الأخطاء مفاتيح ترجمة (errors.*) تترجمها الواجهة حسب اللغة.
 */
import { z } from "zod";

const req = (s: z.ZodString) => s.trim().min(1, "errors.required");
const optionalText = z.string().trim().max(300, "errors.tooLong").optional().or(z.literal(""));

export const loginSchema = z.object({
  username: req(z.string()),
  password: req(z.string()),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordSchema = z
  .string()
  .min(10, "errors.passwordMin")
  .max(128, "errors.tooLong")
  .refine((v) => /[A-Za-z؀-ۿ]/.test(v) && /\d/.test(v), "errors.passwordMix");

export const setupAdminSchema = z
  .object({
    fullNameAr: req(z.string()).max(120, "errors.tooLong"),
    username: req(z.string())
      .min(3, "errors.usernameMin")
      .max(40, "errors.tooLong")
      .regex(/^[a-zA-Z0-9._-]+$/, "errors.usernameChars"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "errors.passwordMismatch",
    path: ["confirmPassword"],
  });
export type SetupAdminInput = z.infer<typeof setupAdminSchema>;

export const academySchema = z.object({
  nameAr: req(z.string()).max(200, "errors.tooLong"),
  nameFr: optionalText,
  code: optionalText,
});
export type AcademyInput = z.infer<typeof academySchema>;

export const directorateSchema = z.object({
  academyId: req(z.string()),
  nameAr: req(z.string()).max(200, "errors.tooLong"),
  nameFr: optionalText,
  code: optionalText,
});
export type DirectorateInput = z.infer<typeof directorateSchema>;

const phone = z
  .string()
  .trim()
  .regex(/^[+0-9 ()-]{6,20}$/, "errors.phone")
  .optional()
  .or(z.literal(""));
const email = z.string().trim().email("errors.email").optional().or(z.literal(""));

export const schoolSchema = z.object({
  directorateId: req(z.string()),
  nameAr: req(z.string()).max(200, "errors.tooLong"),
  nameFr: optionalText,
  adminCode: z
    .string()
    .trim()
    .max(30, "errors.tooLong")
    .regex(/^[A-Za-z0-9-]*$/, "errors.codeChars")
    .optional()
    .or(z.literal("")),
  cycle: optionalText,
  address: optionalText,
  phone,
  email,
});
export type SchoolInput = z.infer<typeof schoolSchema>;

export const schoolYearLabel = z
  .string()
  .regex(/^\d{4}\/\d{4}$/, "errors.schoolYear")
  .refine((v) => {
    const [a, b] = v.split("/").map(Number);
    return b === (a ?? 0) + 1;
  }, "errors.schoolYear");

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LETTERHEAD_TYPES = ["image/png", "image/jpeg"] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LETTERHEAD_MAX_BYTES = 5 * 1024 * 1024;

export const alignment = z.enum(["right", "center", "left"]);

export const letterheadSchema = z.object({
  mode: z.enum(["GENERATED", "IMAGE"]),
  linesAr: z.array(z.string().trim().max(200, "errors.tooLong")).max(8),
  linesFr: z.array(z.string().trim().max(200, "errors.tooLong")).max(8),
  showFrenchBlock: z.boolean(),
  showLogo: z.boolean(),
  showContact: z.boolean(),
  imageWidthMm: z.number().min(50).max(210),
  imageHeightMm: z.number().min(10).max(80),
  imageAlign: alignment,
  heightMm: z.number().min(15).max(80),
  placement: z.enum(["FIRST_PAGE", "ALL_PAGES"]),
  marginsMm: z.object({
    top: z.number().min(5).max(40),
    right: z.number().min(5).max(40),
    bottom: z.number().min(5).max(40),
    left: z.number().min(5).max(40),
  }),
  footerText: z.string().trim().max(200, "errors.tooLong"),
  showFooter: z.boolean(),
  showPageNumbers: z.boolean(),
});
export type LetterheadInput = z.infer<typeof letterheadSchema>;

export const logoSettingsSchema = z.object({
  logoWidthMm: z.number().min(10).max(60),
  logoAlign: alignment,
});
export type LogoSettingsInput = z.infer<typeof logoSettingsSchema>;

export const changePasswordSchema = z.object({
  currentPassword: req(z.string()),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ---------- المستخدمون والأدوار (المرحلة 3) ----------
const username = req(z.string())
  .min(3, "errors.usernameMin")
  .max(40, "errors.tooLong")
  .regex(/^[a-zA-Z0-9._-]+$/, "errors.usernameChars");

export const userCreateSchema = z.object({
  username,
  fullNameAr: req(z.string()).max(120, "errors.tooLong"),
  fullNameFr: optionalText,
  email,
  phone,
  roles: z.array(z.string().min(1)).min(1, "errors.roleRequired"),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  fullNameAr: req(z.string()).max(120, "errors.tooLong"),
  fullNameFr: optionalText,
  email,
  phone,
  status: z.enum(["ACTIVE", "DISABLED"]),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const userRolesSchema = z.object({ roles: z.array(z.string().min(1)) });
export const userOverridesSchema = z.object({
  overrides: z.array(z.object({ permission: z.string().min(3), granted: z.boolean() })).max(300),
});
export type UserOverridesInput = z.infer<typeof userOverridesSchema>;
