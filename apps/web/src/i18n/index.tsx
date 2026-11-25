import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ar } from "./ar";
import { fr } from "./fr";

export type Locale = "ar" | "fr";
export const dictionaries = { ar, fr } as const;
const LOCALE_KEY = "hassan.locale";

function readLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    return v === "fr" ? "fr" : "ar";
  } catch {
    return "ar";
  }
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const raw = dictionaries[locale][key] ?? dictionaries.ar[key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")) : raw;
}

interface Ctx {
  locale: Locale;
  dir: "rtl" | "ltr";
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** الاسم المعروض حسب اللغة (الفرنسية إن وُجدت، وإلا العربية). */
  pick: (o: { nameAr: string; nameFr?: string }) => string;
  fmtDateTime: (d: Date | string) => string;
  fmtDate: (d: Date | string) => string;
}

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);
  const dir = locale === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_KEY, l);
    } catch {
      /* غير متاح */
    }
  }, []);

  const value = useMemo<Ctx>(() => {
    // ar-MA يستعمل الأرقام اللاتينية (0-9) المعتادة في الإدارة المغربية.
    const intlLocale = locale === "ar" ? "ar-MA" : "fr-MA";
    const dt = new Intl.DateTimeFormat(intlLocale, { dateStyle: "full", timeStyle: "short" });
    const d = new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" });
    return {
      locale,
      dir,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      pick: (o) => (locale === "fr" && o.nameFr ? o.nameFr : o.nameAr),
      fmtDateTime: (x) => dt.format(new Date(x)),
      fmtDate: (x) => d.format(new Date(x)),
    };
  }, [locale, dir, setLocale]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n outside I18nProvider");
  return c;
}
