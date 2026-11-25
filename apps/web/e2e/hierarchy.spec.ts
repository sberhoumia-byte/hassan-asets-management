import { expect, test, type Page } from "@playwright/test";
import { setupAdmin } from "./helpers";

async function pick(page: Page, testId: string, option: string) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("الاختيار المترابط: أكاديمية ← مديرياتها فقط ← مؤسساتها، مع البحث بالاسم والرمز", async ({ page }) => {
  await setupAdmin(page);
  await page.getByTestId("tab-hierarchy").click();
  await expect(page.getByTestId("schools-table")).toContainText("حسان بن ثابت");

  // أكاديمية ومديرية جديدتان
  await page.getByRole("button", { name: "أكاديمية" }).click();
  await page.getByRole("dialog").getByLabel("الاسم بالعربية").fill("أكاديمية اختبار");
  await page.getByRole("dialog").getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByTestId("pick-academy")).toHaveValue("أكاديمية اختبار");
  await expect(page.getByTestId("pick-directorate")).toHaveValue("");

  await page.getByRole("button", { name: "مديرية" }).click();
  await page.getByRole("dialog").getByLabel("الاسم بالعربية").fill("مديرية اختبار");
  await page.getByRole("dialog").getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByTestId("pick-directorate")).toHaveValue("مديرية اختبار");

  // المديريات المعروضة تابعة للأكاديمية المختارة فقط
  await page.getByTestId("pick-directorate").click();
  await expect(page.getByRole("option")).toHaveText(["مديرية اختبار"]);
  await page.keyboard.press("Escape");
  await pick(page, "pick-academy", "الأكاديمية الجهوية للتربية والتكوين لجهة سوس ماسة");
  await page.getByTestId("pick-directorate").click();
  await expect(page.getByRole("option")).toHaveText(["المديرية الإقليمية أكادير إداوتنان"]);
  await page.keyboard.press("Escape");

  // مؤسسة جديدة في مديرية الاختبار
  await pick(page, "pick-academy", "أكاديمية اختبار");
  await pick(page, "pick-directorate", "مديرية اختبار");
  await page.getByTestId("add-school").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("اسم المؤسسة بالعربية").fill("مدرسة التجربة");
  await dlg.getByLabel("الرمز الإداري").fill("TEST-01");
  await dlg.getByTestId("school-modal-save").click();
  await expect(page.getByTestId("schools-table")).toContainText("مدرسة التجربة");

  await page.getByTestId("search-school").fill("test-01");
  await expect(page.getByTestId("schools-table").locator("tbody tr")).toHaveCount(1);
  await page.getByTestId("search-school").fill("لا يوجد");
  await expect(page.getByText("لا توجد مؤسسات مطابقة")).toBeVisible();

  // تعدد المؤسسات: محدد المؤسسة النشطة يظهر في الترويسة
  await expect(page.getByRole("textbox", { name: "المؤسسة النشطة" })).toBeVisible();
});

test("معلومات المؤسسة: التحقق من البريد ثم الحفظ", async ({ page }) => {
  await setupAdmin(page);
  await page.getByLabel("البريد الإلكتروني").fill("not-an-email");
  await page.getByTestId("school-save").click();
  await expect(page.getByText("بريد إلكتروني غير صالح")).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill("school@example.ma");
  await page.getByLabel("الرمز الإداري").fill("AB123");
  await page.getByTestId("school-save").click();
  await expect(page.getByText("تم حفظ معلومات المؤسسة")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("الرمز الإداري")).toHaveValue("AB123");
});
