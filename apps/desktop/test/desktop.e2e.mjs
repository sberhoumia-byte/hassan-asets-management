/**
 * اختبار تطبيق سطح المكتب الفعلي (Electron) على خادم حقيقي.
 *   SERVER_URL=http://localhost:8080 ADMIN_USER=admin ADMIN_PASS=... xvfb-run -a node test/desktop.e2e.mjs [--exe <مسار الملف التنفيذي المبني>]
 * بدون --exe يُشغَّل من المصدر (electron .). مع --exe يُختبر الملف المبني (مثل dist/linux-unpacked/HassanAssets).
 */
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createServer } from "node:http";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const require = createRequire(join(appDir, "../../package.json"));
const { _electron: electron } = require("playwright");

const SERVER = process.env.SERVER_URL ?? "http://localhost:8080";
const USER = process.env.ADMIN_USER ?? "admin";
const PASS = process.env.ADMIN_PASS;
if (!PASS) throw new Error("ADMIN_PASS is required");
const exeIdx = process.argv.indexOf("--exe");
const exe = exeIdx > 0 ? process.argv[exeIdx + 1] : null;

const home = mkdtempSync(join(tmpdir(), "hassan-desktop-"));
const env = { ...process.env, XDG_CONFIG_HOME: home, HOME: home, APPDATA: home };
const userData = join(home, "Hassan Assets");
const results = [];
const step = async (name, fn) => {
  await fn();
  results.push(name);
  console.log("✓", name);
};

async function launch() {
  const app = exe
    ? await electron.launch({ executablePath: exe, args: ["--no-sandbox"], env })
    : await electron.launch({ args: [appDir, "--no-sandbox"], cwd: appDir, env, executablePath: require(join(appDir, "node_modules/electron")) });
  const page = await app.firstWindow();
  return { app, page };
}

let { app, page } = await launch();
try {
  await step("أول تشغيل: صفحة الاتصال تطلب عنوان الخادم", async () => {
    await page.getByTestId("connect-url").waitFor();
    assert.match(await page.locator("#version").textContent(), /Windows/);
  });
  await step("عنوان لا يجيب ← رسالة واضحة ولا انتقال", async () => {
    await page.getByTestId("connect-url").fill("http://127.0.0.1:9");
    await page.getByTestId("connect-go").click();
    await page.getByTestId("connect-msg").getByText("تعذّر الوصول").waitFor();
  });
  await step("عنوان موقع ليس خادم النظام ← مرفوض", async () => {
    const other = createServer((_q, r) => r.end("<h1>موقع آخر</h1>")).listen(0);
    await new Promise((r) => other.once("listening", r));
    await page.getByTestId("connect-url").fill(`http://127.0.0.1:${other.address().port}`);
    await page.getByTestId("connect-go").click();
    await page.getByTestId("connect-msg").getByText("ليس خادم نظام التدبير المادي").waitFor();
    other.close();
  });
  await step("عنوان صحيح (بلا http://) ← واجهة النظام وتسجيل الدخول", async () => {
    await page.getByTestId("connect-url").fill(SERVER.replace(/^https?:\/\//, ""));
    await page.getByTestId("connect-go").click();
    await page.waitForURL((u) => u.toString().startsWith(SERVER));
    await page.getByLabel("اسم المستخدم").fill(USER);
    await page.getByLabel("كلمة المرور", { exact: true }).fill(PASS);
    await page.getByTestId("login-submit").click();
    await page.getByText("لوحة القيادة").first().waitFor();
  });
  await step("صفحة الخادم لا ترى جسر التطبيق", async () => {
    assert.equal(await page.evaluate(() => typeof window.HassanShell), "undefined");
    assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  });
  await step("التنقل إلى موقع خارجي داخل النافذة ممنوع", async () => {
    await page.evaluate(() => (location.href = "https://example.com/"));
    await page.waitForTimeout(1500);
    assert.ok(page.url().startsWith(SERVER), page.url());
  });
  await step("العنوان محفوظ في config.json", async () => {
    const c = JSON.parse(readFileSync(join(userData, "config.json"), "utf8"));
    assert.equal(c.server, new URL(SERVER).origin);
  });
  await app.close();

  ({ app, page } = await launch());
  await step("إعادة التشغيل: اتصال تلقائي بالخادم المحفوظ والجلسة باقية", async () => {
    await page.waitForURL((u) => u.toString().startsWith(SERVER), { timeout: 20000 });
    await page.getByText("لوحة القيادة").first().waitFor({ timeout: 20000 });
  });
  await app.close();

  mkdirSync(userData, { recursive: true });
  writeFileSync(join(userData, "config.json"), JSON.stringify({ server: "http://127.0.0.1:9" }));
  ({ app, page } = await launch());
  await step("الخادم المحفوظ متوقف ← صفحة الاتصال مع رسالة وإمكانية التغيير", async () => {
    await page.getByTestId("connect-msg").getByText("تعذّر الاتصال بالخادم المحفوظ").waitFor({ timeout: 20000 });
    assert.equal(await page.getByTestId("connect-url").inputValue(), "http://127.0.0.1:9");
  });
} finally {
  await app.close().catch(() => {});
}
console.log(`\n${results.length} checks passed (${exe ? "packaged: " + exe : "source"})`);
