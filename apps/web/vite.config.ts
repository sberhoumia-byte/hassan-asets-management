import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { VitePWA } from "vite-plugin-pwa";

/**
 * PWA (غير نسخة المراجعة): تخزين واجهة التطبيق فقط (JS/CSS/HTML/الخطوط/الأيقونات) ليفتح دون اتصال.
 * لا تُخزن أي استجابة من /api في ذاكرة Service Worker: البيانات تبقى على الخادم،
 * والعمليات دون اتصال تمر عبر طابور Outbox (IndexedDB) وتُرسل إلى /sync.
 */
const pwa = VitePWA({
  injectRegister: null, // التسجيل يدوي في main.tsx (يُتخطى في Electron/Capacitor)
  registerType: "autoUpdate",
  includeAssets: ["favicon.svg"],
  manifest: {
    name: "نظام التدبير المادي — مدرسة حسان بن ثابت",
    short_name: "التدبير المادي",
    lang: "ar",
    dir: "rtl",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0B2545",
    icons: [
      { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
      { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,woff2,svg,png}"],
    maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
    navigateFallback: "index.html",
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    runtimeCaching: [],
  },
});

// mode "review": ملف HTML واحد مستقل (JS وCSS والخطوط مضمنة) لمشاركة نسخة المراجعة.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), tailwindcss(), ...(mode === "review" ? [viteSingleFile()] : [pwa])],
  resolve: mode === "review" ? { alias: { "virtual:pwa-register": fileURLToPath(new URL("./src/pwa-stub.ts", import.meta.url)) } } : undefined,
  // في التطوير: الواجهة على 5173 والخادم على 3000 (نفس الأصل عبر الوكيل ← كوكي SameSite=Strict يعمل)
  server: { port: 5173, proxy: { "/api": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false } } },
  preview: { port: 4173, proxy: { "/api": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false } } },
  build:
    mode === "review"
      ? { target: "es2022", outDir: "dist-review", assetsInlineLimit: 100_000_000 }
      : { target: "es2022", sourcemap: true },
}));
