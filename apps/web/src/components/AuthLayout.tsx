import type { ReactNode } from "react";
import { SegmentedControl } from "@mantine/core";
import { useI18n } from "../i18n";
import { SLOGAN_AR } from "../lib/defaults";

/** تخطيط شاشتي تسجيل الدخول والإعداد الأول: لوحة الهوية + النموذج. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div
        className="text-white flex flex-col justify-center gap-4 p-8 md:p-12"
        style={{ background: "linear-gradient(160deg,#0b2545,#1d5fa8)" }}
      >
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
          <rect width="64" height="64" rx="16" fill="rgba(255,255,255,.12)" />
          <path d="M16 46V22l16-8 16 8v24" fill="none" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
          <path d="M26 46V32h12v14" fill="none" stroke="#9cc3ee" strokeWidth="4" />
        </svg>
        <h1 className="font-cairo text-2xl md:text-3xl font-extrabold m-0 leading-snug" dir="ltr" style={{ textAlign: "start" }}>
          HASSAN IBN THABIT
          <br />
          ASSETS MANAGEMENT
        </h1>
        <p className="font-tajawal text-lg m-0 opacity-90">{t("app.fullName")}</p>
        <p className="font-tajawal text-sm m-0 opacity-75" dir="rtl">{SLOGAN_AR}</p>
      </div>
      <div className="flex flex-col p-6 md:p-12 bg-white">
        <div className="flex justify-end">
          <SegmentedControl
            size="xs"
            value={locale}
            onChange={(v) => setLocale(v as "ar" | "fr")}
            data={[
              { value: "ar", label: "العربية" },
              { value: "fr", label: "Français" },
            ]}
          />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
