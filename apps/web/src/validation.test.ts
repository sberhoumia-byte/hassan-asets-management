import { describe, expect, it } from "vitest";
import { letterheadSchema, schoolSchema, schoolYearLabel, setupAdminSchema } from "@hassan/validation";
import { defaultLetterhead } from "./lib/defaults";

describe("مخططات التحقق المشتركة", () => {
  it("كلمة مرور المدير: 10 أحرف مع حروف وأرقام، وتطابق التأكيد", () => {
    const base = { fullNameAr: "مدير", username: "admin" };
    expect(setupAdminSchema.safeParse({ ...base, password: "short1", confirmPassword: "short1" }).success).toBe(false);
    expect(setupAdminSchema.safeParse({ ...base, password: "abcdefghijk", confirmPassword: "abcdefghijk" }).success).toBe(false);
    expect(setupAdminSchema.safeParse({ ...base, password: "abcdefghij1", confirmPassword: "abcdefghij2" }).success).toBe(false);
    expect(setupAdminSchema.safeParse({ ...base, password: "abcdefghij1", confirmPassword: "abcdefghij1" }).success).toBe(true);
  });

  it("المؤسسة: الاسم والمديرية إلزاميان فقط، والبريد والهاتف يُتحقق منهما إن وُجدا", () => {
    expect(schoolSchema.safeParse({ directorateId: "d", nameAr: "م" }).success).toBe(true);
    expect(schoolSchema.safeParse({ directorateId: "", nameAr: "م" }).success).toBe(false);
    expect(schoolSchema.safeParse({ directorateId: "d", nameAr: "م", email: "bad" }).success).toBe(false);
    expect(schoolSchema.safeParse({ directorateId: "d", nameAr: "م", phone: "0528 00 00 00" }).success).toBe(true);
  });

  it("السنة الدراسية بصيغة متتالية", () => {
    expect(schoolYearLabel.safeParse("2026/2027").success).toBe(true);
    expect(schoolYearLabel.safeParse("2026/2028").success).toBe(false);
  });

  it("الترويسة الافتراضية صالحة، والهوامش خارج الحدود مرفوضة", () => {
    expect(letterheadSchema.safeParse(defaultLetterhead()).success).toBe(true);
    const bad = { ...defaultLetterhead(), marginsMm: { top: 1, right: 15, bottom: 12, left: 15 } };
    expect(letterheadSchema.safeParse(bad).success).toBe(false);
  });
});
