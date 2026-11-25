import { describe, expect, it } from "vitest";
import { matchesQuery, normalizeArabic } from "./text";
import { sniffImage } from "./files";
import { currentSchoolYear, schoolYearOptions } from "./schoolYear";
import { defaultLetterhead, DEFAULT_HIERARCHY } from "./defaults";
import { hashPassword, verifyPassword } from "./crypto";

describe("البحث العربي", () => {
  it("يتجاهل الهمزات والتاء المربوطة والتشكيل", () => {
    expect(normalizeArabic("مؤسسةُ أورير")).toBe(normalizeArabic("مؤسسه اورير"));
    expect(matchesQuery("حسان بن ثابت", DEFAULT_HIERARCHY.school.nameAr)).toBe(true);
    expect(matchesQuery("اورير", DEFAULT_HIERARCHY.school.nameAr)).toBe(true);
    expect(matchesQuery("12345B", "x", "12345b")).toBe(true);
    expect(matchesQuery("غير موجود", DEFAULT_HIERARCHY.school.nameAr)).toBe(false);
  });
});

describe("فحص نوع الصورة الحقيقي", () => {
  it("يتعرف على PNG وJPEG وWEBP ويرفض غيرها", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffImage(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // PDF
    expect(sniffImage(new TextEncoder().encode("<svg"))).toBeNull();
  });
});

describe("السنة الدراسية", () => {
  it("تبدأ في شتنبر", () => {
    expect(currentSchoolYear(new Date(2026, 10, 25))).toBe("2026/2027");
    expect(currentSchoolYear(new Date(2027, 5, 1))).toBe("2026/2027");
    expect(currentSchoolYear(new Date(2027, 8, 1))).toBe("2027/2028");
    expect(schoolYearOptions(new Date(2026, 10, 25))).toEqual(["2025/2026", "2026/2027", "2027/2028", "2028/2029"]);
  });
});

describe("الترويسة الافتراضية", () => {
  it("تُبنى من بيانات التسلسل الإداري وليست مثبتة", () => {
    const lh = defaultLetterhead(
      { id: "a", nameAr: "أكاديمية س", nameFr: "AREF S" },
      { id: "d", academyId: "a", nameAr: "مديرية ص" },
      { id: "s", directorateId: "d", nameAr: "مؤسسة ع" },
    );
    expect(lh.linesAr).toEqual(["المملكة المغربية", "وزارة التربية الوطنية والتعليم الأولي والرياضة", "أكاديمية س", "مديرية ص", "مؤسسة ع"]);
    expect(lh.linesFr).toContain("AREF S");
    expect(lh.linesFr).not.toContain(undefined);
  });
});

describe("تجزئة كلمة المرور", () => {
  it("تتحقق من الصحيحة وترفض الخاطئة ولا تخزن النص", async () => {
    const h = await hashPassword("secret12345");
    expect(h).not.toContain("secret12345");
    expect(await verifyPassword("secret12345", h)).toBe(true);
    expect(await verifyPassword("secret12346", h)).toBe(false);
    expect(await hashPassword("secret12345")).not.toBe(h); // ملح عشوائي
  });
});
