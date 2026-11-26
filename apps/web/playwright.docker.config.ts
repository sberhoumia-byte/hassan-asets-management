import { defineConfig, devices } from "@playwright/test";

/**
 * نفس اختبارات e2e-server لكن على النشر الفعلي بـ Docker Compose (nginx + API + PostgreSQL)،
 * بقاعدة فارغة: docker compose ... up -d ثم
 *   DOCKER_BASE_URL=http://localhost:8080 npx playwright test -c playwright.docker.config.ts
 * يتطلب في الخادم LOGIN_RATE_LIMIT مرتفعاً و BACKUP_ENCRYPTION_KEY مضبوطاً.
 */
export default defineConfig({
  testDir: "./e2e-server",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.DOCKER_BASE_URL ?? "http://localhost:8080",
    locale: "ar-MA",
    trace: "off",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
});
