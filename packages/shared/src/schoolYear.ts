/** السنة الدراسية المغربية تبدأ في شتنبر. */
export function currentSchoolYear(d = new Date()): string {
  const y = d.getFullYear();
  const start = d.getMonth() >= 8 ? y : y - 1;
  return `${start}/${start + 1}`;
}

export function schoolYearOptions(d = new Date()): string[] {
  const start = Number(currentSchoolYear(d).slice(0, 4));
  return [start - 1, start, start + 1, start + 2].map((s) => `${s}/${s + 1}`);
}
