/// <reference types="vite-plugin-pwa/client" />
/**
 * تسجيل Service Worker لواجهة التطبيق (PWA). يُتخطى في نسخة المراجعة وتطبيقي Electron/Capacitor
 * (يعملان من ملفات محلية أصلاً)، وفي التطوير.
 */
export async function registerPwa() {
  const w = window as unknown as { Capacitor?: unknown };
  if (import.meta.env.DEV || import.meta.env.MODE === "review" || w.Capacitor || !/^https?:$/.test(location.protocol) || !("serviceWorker" in navigator)) return;
  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  } catch {
    // التطبيق يعمل بدونه
  }
}
