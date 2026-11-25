/** تطبيع النص العربي للبحث: إزالة التشكيل والتطويل وتوحيد الألف والياء والتاء المربوطة. */
export function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesQuery(q: string, ...fields: (string | undefined)[]): boolean {
  const nq = normalizeArabic(q);
  if (!nq) return true;
  return fields.some((f) => !!f && normalizeArabic(f).includes(nq));
}
