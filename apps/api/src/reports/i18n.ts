/**
 * نصوص الوثائق المولدة على الخادم: نفس قواميس الواجهة (مصدر واحد للتسميات بالعربية والفرنسية).
 */
import { ar } from "../../../web/src/i18n/ar";
import { fr } from "../../../web/src/i18n/fr";

export type Lang = "ar" | "fr";
export type T = (key: string, vars?: Record<string, string | number>) => string;

/** المنطقة الزمنية المعتمدة في عرض التواريخ والساعات على الوثائق. */
export const DOC_TZ = process.env.DOC_TIMEZONE || "Africa/Casablanca";

export function translator(lang: Lang): T {
  const dict = lang === "fr" ? fr : ar;
  return (key, vars) => {
    const raw = dict[key] ?? ar[key] ?? key;
    return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")) : raw;
  };
}

export interface Fmt {
  t: T;
  lang: Lang;
  date: (d: Date | string | null | undefined) => string;
  dateTime: (d: Date | string | null | undefined) => string;
  num: (n: number | null | undefined) => string;
  money: (n: number | null | undefined) => string;
}

export function formatter(lang: Lang): Fmt {
  // ar-MA بأرقام لاتينية كما في الواجهة والإدارة المغربية.
  const loc = lang === "ar" ? "ar-MA" : "fr-MA";
  const d = new Intl.DateTimeFormat(loc, { dateStyle: "medium", timeZone: DOC_TZ });
  const dOnly = new Intl.DateTimeFormat(loc, { dateStyle: "medium", timeZone: "UTC" });
  const dt = new Intl.DateTimeFormat(loc, { dateStyle: "medium", timeStyle: "short", timeZone: DOC_TZ });
  const num = new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 3 });
  const money = new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    t: translator(lang),
    lang,
    // تاريخ بلا ساعة (YYYY-MM-DD أو @db.Date) يُعرض كما هو دون انزياح المنطقة الزمنية
    date: (x) => {
      if (!x) return "";
      if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) return dOnly.format(new Date(`${x}T12:00:00Z`));
      return d.format(new Date(x));
    },
    dateTime: (x) => (x ? dt.format(new Date(x)) : ""),
    num: (n) => (n === null || n === undefined ? "" : num.format(n)),
    money: (n) => (n === null || n === undefined ? "" : money.format(n)),
  };
}
