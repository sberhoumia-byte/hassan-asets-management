import { describe, expect, it } from "vitest";
import { paginate } from "./paginate";
import { defaultLetterhead } from "../lib/defaults";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("paginate — توزيع التقرير على صفحات A4", () => {
  it("تقرير قصير = صفحة واحدة بترويسة وعنوان", () => {
    const pages = paginate(rows(5), defaultLetterhead(), false);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ showLetterhead: true, showTitle: true });
    expect(pages[0]!.rows).toHaveLength(5);
  });

  it("ALL_PAGES: الترويسة في جميع صفحات التقرير متعدد الصفحات", () => {
    const pages = paginate(rows(120), { ...defaultLetterhead(), placement: "ALL_PAGES" }, false);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every((p) => p.showLetterhead)).toBe(true);
    expect(pages.filter((p) => p.showTitle)).toHaveLength(1);
  });

  it("FIRST_PAGE: الترويسة في الصفحة الأولى فقط، والصفحات التالية تتسع لأسطر أكثر", () => {
    const pages = paginate(rows(120), { ...defaultLetterhead(), placement: "FIRST_PAGE" }, false);
    expect(pages[0]!.showLetterhead).toBe(true);
    expect(pages.slice(1).every((p) => !p.showLetterhead)).toBe(true);
    expect(pages[1]!.rows.length).toBeGreaterThan(pages[0]!.rows.length);
  });

  it("لا يضيع أي سطر ولا يتكرر", () => {
    const pages = paginate(rows(137), defaultLetterhead(), false);
    expect(pages.flatMap((p) => p.rows)).toEqual(rows(137));
  });

  it("ترويسة أعلى = أسطر أقل في الصفحة", () => {
    const short = paginate(rows(200), { ...defaultLetterhead(), heightMm: 20 }, false);
    const tall = paginate(rows(200), { ...defaultLetterhead(), heightMm: 70 }, false);
    expect(tall[0]!.rows.length).toBeLessThan(short[0]!.rows.length);
  });

  it("وضع الصورة يستعمل ارتفاع الصورة فقط إذا وُجدت صورة", () => {
    const lh = { ...defaultLetterhead(), mode: "IMAGE" as const, heightMm: 30, imageHeightMm: 70 };
    expect(paginate(rows(200), lh, true)[0]!.rows.length).toBeLessThan(paginate(rows(200), lh, false)[0]!.rows.length);
  });

  it("تقرير فارغ = صفحة واحدة", () => {
    expect(paginate([], defaultLetterhead(), false)).toHaveLength(1);
  });
});
