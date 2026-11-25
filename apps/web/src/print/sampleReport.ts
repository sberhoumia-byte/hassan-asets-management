/**
 * نموذج تقرير لتجربة الترويسة فقط (المادة 8-و: «تجربة الترويسة على نموذج تقرير»).
 * الأسطر تعرض «نموذج» صراحة، وليست بيانات واقعية للمؤسسة.
 */
export interface SampleRow { n: number }

export function sampleRows(count: number): SampleRow[] {
  return Array.from({ length: count }, (_, i) => ({ n: i + 1 }));
}
