import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ar } from "./ar";
import { fr } from "./fr";
import { NAV, SETTINGS_PAGES } from "../layout/nav";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(f) && !f.endsWith(".test.ts") ? [p] : [];
  });
}

describe("الترجمة", () => {
  it("كل مفتاح عربي له مقابل فرنسي والعكس", () => {
    expect(Object.keys(fr).filter((k) => !(k in ar))).toEqual([]);
    expect(Object.keys(ar).filter((k) => !(k in fr))).toEqual([]);
  });

  it("كل مفتاح مستعمل في الشيفرة موجود في القاموس", () => {
    const srcDir = join(__dirname, "..");
    const used = new Set<string>();
    for (const f of sources(srcDir)) {
      for (const m of readFileSync(f, "utf8").matchAll(/\bt\("([a-zA-Z]+\.[a-zA-Z0-9_.]+)"/g)) used.add(m[1]!);
    }
    // رسائل التحقق المشتركة
    const val = readFileSync(join(srcDir, "../../../packages/validation/src/index.ts"), "utf8");
    for (const m of val.matchAll(/"(errors\.[a-zA-Z]+)"/g)) used.add(m[1]!);
    // المفاتيح المركبة
    NAV.forEach((n) => used.add(`nav.${n.key}`));
    SETTINGS_PAGES.forEach((p) => used.add(`settings.${p.key}`));
    expect([...used].filter((k) => !(k in ar))).toEqual([]);
  });

  it("القائمة الرئيسية بالترتيب المطلوب (18 قسماً)", () => {
    expect(NAV.map((n) => ar[`nav.${n.key}`])).toEqual([
      "لوحة القيادة",
      "الممتلكات والتجهيزات",
      "المخزون",
      "البنايات والفضاءات",
      "الملاعب والمرافق",
      "الوسائل التعليمية",
      "الإعارة والإرجاع",
      "الجرد المادي",
      "الصيانة والإصلاح",
      "الطلبيات والاقتناء",
      "العهدة والتسليم",
      "الموردون",
      "المخطط التفاعلي للمؤسسة",
      "Excel والاستيراد والتصدير",
      "الوثائق والأرشيف",
      "التقارير والإحصائيات",
      "المستخدمون والصلاحيات",
      "إعدادات النظام والهوية البصرية",
    ]);
  });
});
