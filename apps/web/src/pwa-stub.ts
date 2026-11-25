/** بديل فارغ لـ virtual:pwa-register في نسخة المراجعة (ملف HTML واحد بلا Service Worker). */
export function registerSW(_: { immediate?: boolean }) {
  return () => Promise.resolve();
}
