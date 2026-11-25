import { defineConfig, devices } from "@playwright/test";

/**
 * اختبارات شاملة على الخادم الحقيقي وقاعدة PostgreSQL.
 * تُشغَّل عبر scripts/e2e-server.mjs الذي ينشئ مخطط قاعدة معزولاً ويشغّل الخادم على 3100.
 */
export default defineConfig({
  testDir: "./e2e-server",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4174",
    locale: "ar-MA",
    trace: "off",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4174 --strictPort",
    url: "http://localhost:4174",
    reuseExistingServer: false,
    timeout: 180_000,
    env: { API_PROXY_TARGET: process.env.API_PROXY_TARGET ?? "http://localhost:3100" },
  },
});
