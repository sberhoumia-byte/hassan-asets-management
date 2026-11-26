/**
 * اختبار الجزء الويب من تطبيق Android في Chromium بمقاس هاتف، بجسر HassanAndroid محاكى بنفس عقد الشيفرة الأصلية
 * (HassanShellPlugin.java). لا يغني عن التجربة على جهاز حقيقي: الشيفرة الأصلية نفسها لا تُنفَّذ هنا.
 *   SERVER_URL=http://localhost:8080 ADMIN_PASS=... node test/android-web.e2e.mjs [مجلد اللقطات]
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../../package.json"));
const { chromium, devices } = require("playwright");
const SERVER = process.env.SERVER_URL ?? "http://localhost:8080";
const PASS = process.env.ADMIN_PASS;
const shots = process.argv[2];
if (!PASS) throw new Error("ADMIN_PASS is required");

/** محاكاة الجسر الأصلي: نفس الدوال المتزامنة، وفحص الخادم يجيب ok لعنوان SERVER فقط. */
const mock = (server) => {
  const calls = (window.__calls = window.__calls || []);
  let saved = localStorage.getItem("mock-server");
  window.HassanAndroid = {
    version: () => "1.0.0",
    getServer: () => saved,
    check: (u) => JSON.stringify(u === server ? { ok: true } : { ok: false, error: "unreachable" }),
    open: (u) => { localStorage.setItem("mock-server", u); saved = u; location.href = u + "/"; },
    saveFile: (name, mime, b64) => { calls.push({ kind: "save", name, mime, head: atob(b64.slice(0, 12)) }); return true; },
    print: (title) => calls.push({ kind: "print", title }),
  };
};

const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "ar-MA" });
await ctx.addInitScript(mock, new URL(SERVER).origin);
const p = await ctx.newPage();
const ok = (m) => console.log("✓", m);
try {
  await p.goto(pathToFileURL(join(here, "../www/index.html")).href);
  await p.getByTestId("connect-url").waitFor();
  assert.match(await p.locator("#version").textContent(), /Android/);
  if (shots) await p.screenshot({ path: join(shots, "01-android-connect.png") });
  ok("صفحة الاتصال تظهر بمقاس الهاتف مع إصدار Android");

  await p.getByTestId("connect-url").fill("192.168.1.250:8080");
  await p.getByTestId("connect-go").click();
  await p.getByTestId("connect-msg").getByText("تعذّر الوصول").waitFor();
  ok("عنوان محلي بلا بروتوكول يُكمَّل بـ http:// ويُرفض حين لا يجيب");

  await p.getByTestId("connect-url").fill(SERVER);
  await p.getByTestId("connect-go").click();
  await p.waitForURL((u) => u.toString().startsWith(SERVER));
  await p.getByLabel("اسم المستخدم").fill("admin");
  await p.getByLabel("كلمة المرور", { exact: true }).fill(PASS);
  await p.getByTestId("login-submit").click();
  await p.waitForURL((u) => u.hash === "#/" || u.hash === "");
  await p.waitForLoadState("networkidle");
  if (shots) await p.screenshot({ path: join(shots, "02-android-dashboard.png") });
  ok("الانتقال إلى الخادم وتسجيل الدخول على الهاتف");

  await p.goto(`${SERVER}/#/reports`);
  await p.getByTestId("report-pdf-btn").click();
  await p.waitForFunction(() => window.__calls.some((c) => c.kind === "save"), null, { timeout: 30000 });
  const save = (await p.evaluate(() => window.__calls)).find((c) => c.kind === "save");
  assert.match(save.name, /^RPT-\d{4}-\d{5}\.pdf$/);
  assert.equal(save.mime, "application/pdf");
  assert.equal(save.head.slice(0, 5), "%PDF-");
  ok(`تقرير PDF يُسلَّم للتطبيق للحفظ في التنزيلات (${save.name})`);

  await p.goto(`${SERVER}/#/settings/print-preview`);
  await p.getByTestId("print").click();
  assert.ok((await p.evaluate(() => window.__calls)).some((c) => c.kind === "print"));
  ok("زر الطباعة يستدعي خدمة الطباعة في Android");

  const w = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(w <= 1, `horizontal overflow ${w}px`);
  ok("لا تمرير أفقي على الهاتف");
} finally {
  await b.close();
}
