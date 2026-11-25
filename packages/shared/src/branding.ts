/** الترويسة الافتراضية (المادة 7) — مشتركة بين الواجهة والخادم. */
export const SLOGAN_AR = "التدبير المادي الذكي – من أجل مؤسسة منظمة وذات جودة للجميع";

type Named = { nameAr?: string | null; nameFr?: string | null } | null | undefined;

export function defaultLetterheadFields(a?: Named, d?: Named, s?: Named) {
  const clean = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x && x.trim() !== "");
  return {
    mode: "GENERATED" as "GENERATED" | "IMAGE",
    linesAr: clean(["المملكة المغربية", "وزارة التربية الوطنية والتعليم الأولي والرياضة", a?.nameAr, d?.nameAr, s?.nameAr]),
    linesFr: clean([
      "Royaume du Maroc",
      "Ministère de l'Éducation Nationale, du Préscolaire et des Sports",
      a?.nameFr,
      d?.nameFr,
      s?.nameFr,
    ]),
    showFrenchBlock: true,
    showLogo: true,
    showContact: false,
    imageWidthMm: 180,
    imageHeightMm: 35,
    imageAlign: "center" as "right" | "center" | "left",
    heightMm: 38,
    placement: "ALL_PAGES" as "FIRST_PAGE" | "ALL_PAGES",
    marginsMm: { top: 12, right: 15, bottom: 12, left: 15 },
    footerText: SLOGAN_AR,
    showFooter: true,
    showPageNumbers: true,
  };
}

export const DEFAULT_LOGO = { logoWidthMm: 22, logoAlign: "center" as "right" | "center" | "left" };
