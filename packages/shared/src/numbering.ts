/**
 * صيغة الأرقام (رقم الجرد، رقم الحركة...). الرموز:
 *   {SCHOOL} رمز المؤسسة الإداري (أو ECOLE إن لم يُحدد)، {YEAR} السنة، {SEQ:n} التسلسل بـ n أرقام.
 * الصيغة الافتراضية لرقم الجرد قابلة للتعديل من إعدادات المؤسسة.
 */
export const DEFAULT_INVENTORY_PATTERN = "{SCHOOL}-{YEAR}-{SEQ:5}";

export function formatNumber(pattern: string, p: { school?: string | null; year: number; seq: number }): string {
  return pattern
    .replace(/\{SCHOOL\}/g, (p.school || "ECOLE").toUpperCase())
    .replace(/\{YEAR\}/g, String(p.year))
    .replace(/\{SEQ(?::(\d{1,2}))?\}/g, (_, n) => String(p.seq).padStart(Number(n ?? 1), "0"));
}

export function isValidPattern(pattern: string): boolean {
  return /\{SEQ(?::\d{1,2})?\}/.test(pattern) && pattern.length <= 60 && /^[A-Za-z0-9{}:\-/_.]+$/.test(pattern);
}
