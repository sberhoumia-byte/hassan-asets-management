import type { Letterhead } from "../api/types";

/** أبعاد ثابتة بالمليمتر لتوزيع التقرير على صفحات A4. */
export const A4 = { width: 210, height: 297 } as const;
export const ROW_MM = 8;
export const TABLE_HEAD_MM = 8;
export const TITLE_MM = 16;
export const FOOTER_MM = 10;
export const HEADER_GAP_MM = 4;

export function letterheadHeightMm(lh: Pick<Letterhead, "mode" | "heightMm" | "imageHeightMm">, hasImage: boolean): number {
  return lh.mode === "IMAGE" && hasImage ? lh.imageHeightMm : lh.heightMm;
}

export interface PagePlan<T> {
  index: number;
  showLetterhead: boolean;
  showTitle: boolean;
  rows: T[];
}

/**
 * يوزع أسطر الجدول على صفحات A4 حسب إعدادات الترويسة:
 * - placement = ALL_PAGES ← الترويسة في كل صفحة؛ FIRST_PAGE ← الأولى فقط.
 * - المساحة المتاحة = الارتفاع − الهوامش − الترويسة − العنوان (الأولى) − التذييل − رأس الجدول.
 */
export function paginate<T>(rows: T[], lh: Letterhead, hasImage: boolean): PagePlan<T>[] {
  const headerMm = letterheadHeightMm(lh, hasImage) + HEADER_GAP_MM;
  const footerMm = lh.showFooter || lh.showPageNumbers ? FOOTER_MM : 0;
  const base = A4.height - lh.marginsMm.top - lh.marginsMm.bottom - footerMm - TABLE_HEAD_MM;

  const capacity = (page: number) => {
    const withHeader = page === 0 || lh.placement === "ALL_PAGES";
    const title = page === 0 ? TITLE_MM : 0;
    return Math.max(1, Math.floor((base - (withHeader ? headerMm : 0) - title) / ROW_MM));
  };

  const pages: PagePlan<T>[] = [];
  let i = 0;
  do {
    const p = pages.length;
    const n = capacity(p);
    pages.push({
      index: p,
      showLetterhead: p === 0 || lh.placement === "ALL_PAGES",
      showTitle: p === 0,
      rows: rows.slice(i, i + n),
    });
    i += n;
  } while (i < rows.length);
  return pages;
}
