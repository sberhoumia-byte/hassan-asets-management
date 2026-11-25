import type { Academy, Branding, Directorate, Letterhead, School } from "../api/types";

/** التسلسل الإداري الافتراضي الأولي (المادة 7) — قابل للتعديل من الشاشة. */
export const DEFAULT_HIERARCHY = {
  academy: {
    nameAr: "الأكاديمية الجهوية للتربية والتكوين لجهة سوس ماسة",
    nameFr: "Académie Régionale d'Éducation et de Formation Souss-Massa",
  },
  directorate: {
    nameAr: "المديرية الإقليمية أكادير إداوتنان",
    nameFr: "Direction Provinciale Agadir Ida-Outanane",
  },
  school: {
    nameAr: "مؤسسة حسان بن ثابت الابتدائية بأورير",
    nameFr: "École primaire Hassan Ibn Thabit – Aourir",
    cycle: "ابتدائي",
  },
} as const;

export const SLOGAN_AR = "التدبير المادي الذكي – من أجل مؤسسة منظمة وذات جودة للجميع";

export function defaultLetterhead(a?: Academy, d?: Directorate, s?: School): Letterhead {
  const clean = (xs: (string | undefined)[]) => xs.filter((x): x is string => !!x && x.trim() !== "");
  return {
    version: 1,
    mode: "GENERATED",
    linesAr: clean([
      "المملكة المغربية",
      "وزارة التربية الوطنية والتعليم الأولي والرياضة",
      a?.nameAr,
      d?.nameAr,
      s?.nameAr,
    ]),
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
    imageAlign: "center",
    heightMm: 38,
    placement: "ALL_PAGES",
    marginsMm: { top: 12, right: 15, bottom: 12, left: 15 },
    footerText: SLOGAN_AR,
    showFooter: true,
    showPageNumbers: true,
  };
}

export function defaultBranding(schoolId: string, a?: Academy, d?: Directorate, s?: School): Branding {
  return {
    schoolId,
    logoWidthMm: 22,
    logoAlign: "center",
    letterhead: defaultLetterhead(a, d, s),
  };
}
