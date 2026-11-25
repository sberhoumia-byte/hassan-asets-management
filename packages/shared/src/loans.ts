/**
 * احتساب التأخير في الإعارة. تاريخ الإرجاع المحدد يُخزَّن كنهاية يومه (23:59:59.999 UTC):
 * الإعارة متأخرة إن تجاوز الوقت هذه اللحظة، وعدد أيام التأخير يُقرَّب إلى الأعلى (جزء يوم = يوم).
 * الإعارة المسترجعة يُحسب تأخيرها عند آخر إرجاع.
 */
const DAY = 86_400_000;

export function dueEndOfDay(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`);
}

export function lateDays(dueAt: Date | string, at: Date | string = new Date()): number {
  const diff = new Date(at).getTime() - new Date(dueAt).getTime();
  return diff > 0 ? Math.ceil(diff / DAY) : 0;
}
