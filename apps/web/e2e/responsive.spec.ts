import { expect, test } from "@playwright/test";
import { setupAdmin } from "./helpers";

test("على الهاتف: القائمة مخفية وتفتح كدرج من اليمين، دون تمرير أفقي", async ({ page }) => {
  await setupAdmin(page);
  await expect(page.locator(".app-grid > nav.sidebar")).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByTestId("toggle-menu").click();
  const drawer = page.locator(".mobile-drawer nav.sidebar");
  await expect(drawer).toBeVisible();
  const vw = page.viewportSize()!.width;
  // ينتظر انتهاء حركة الدرج ثم يتحقق أنه ملتصق بالحافة اليمنى
  await expect.poll(async () => { const b = await drawer.boundingBox(); return b ? b.x + b.width : 0; }).toBeGreaterThan(vw - 5);
  await drawer.getByTestId("nav-dashboard").click();
  await expect(page.getByTestId("stat-assets")).toBeVisible();
});
