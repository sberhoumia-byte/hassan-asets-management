/** يحول النصوص الفارغة إلى null قبل الحفظ (حقول اختيارية). */
export function nullify<T extends Record<string, unknown>>(o: T): { [K in keyof T]: Exclude<T[K], ""> | null } {
  return Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, v === "" || v === undefined ? null : typeof v === "string" ? v.trim() : v]),
  ) as never;
}

/** يحذف القيم null/undefined من كائن الاستجابة (تطابق العقد في الواجهة: الحقول الاختيارية غائبة). */
export function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as T;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
