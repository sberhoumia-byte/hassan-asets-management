/**
 * صفحة الاتصال المشتركة بين تطبيق Windows (Electron) وتطبيق Android (Capacitor).
 * التطبيقان واجهتان رقيقتان لخادم المؤسسة: يحفظان عنوان الخادم فقط ثم يفتحان واجهته.
 * الواجهة الأصلية (native) توفر: قراءة العنوان المحفوظ، فحص الخادم (دون قيود CORS)، والانتقال إليه.
 */
(function () {
  "use strict";

  const MSG = {
    invalid: "العنوان غير صالح. اكتبه كاملاً، مثل https://… أو http://192.168.1.10:8080",
    unreachable: "تعذّر الوصول إلى الخادم. تحقّق من العنوان ومن اتصال الجهاز بشبكة المؤسسة.",
    timeout: "انتهت مهلة الاتصال بالخادم. أعد المحاولة.",
    not_hassan: "هذا العنوان يستجيب لكنه ليس خادم نظام التدبير المادي.",
    saved_failed: "تعذّر الاتصال بالخادم المحفوظ. أعد المحاولة أو غيّر العنوان.",
    no_bridge: "هذه الصفحة تعمل داخل تطبيق Windows أو Android فقط.",
  };

  /** واجهة موحدة فوق جسر Electron (وعود) أو جسر Android (دوال متزامنة). */
  function bridge() {
    if (window.HassanShell) return window.HassanShell;
    const a = window.HassanAndroid;
    if (a)
      return {
        platform: "android",
        version: a.version(),
        getServer: async () => a.getServer() || null,
        check: async (url) => JSON.parse(a.check(url)),
        open: async (url) => a.open(url),
      };
    return null;
  }

  /** يعيد أصل الخادم (بروتوكول + مضيف + منفذ) أو null. بلا بروتوكول: http للعناوين المحلية وhttps لغيرها. */
  function normalize(raw) {
    // أرقام عربية/فارسية ← لاتينية، وحذف الفراغات وعلامات الاتجاه التي تضيفها لوحات المفاتيح العربية
    let s = (raw || "")
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[\u066b\u06d4]/g, ".")
      .replace(/[\s\u200e\u200f\u2066-\u2069\u061c]/g, "");
    if (!s) return null;
    if (!/^[a-z]+:\/\//i.test(s)) {
      const local = /^(localhost|\d{1,3}(\.\d{1,3}){3}|[^./:]+)(:\d+)?(\/|$)/i.test(s);
      s = (local ? "http://" : "https://") + s;
    }
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      if (u.username || u.password) return null;
      return u.origin;
    } catch {
      return null;
    }
  }

  const $ = (id) => document.getElementById(id);
  const form = $("form");
  const input = $("url");
  const msg = $("msg");
  const go = $("go");
  const auto = $("auto");
  let cancelled = false;

  function showForm(message, value) {
    cancelled = true;
    auto.hidden = true;
    form.hidden = false;
    if (value) input.value = value;
    msg.hidden = !message;
    msg.textContent = message || "";
    input.focus();
  }

  async function connect(shell, origin) {
    const r = await shell.check(origin);
    if (!r.ok) return r.error || "unreachable";
    await shell.open(origin);
    return null;
  }

  async function main() {
    const shell = bridge();
    if (!shell) {
      showForm(MSG.no_bridge);
      go.disabled = true;
      return;
    }
    // عزل النصوص اللاتينية داخل السطر العربي (FSI…PDI) ليبقى الترتيب صحيحاً
    $("version").textContent = `الإصدار \u2068${shell.version}\u2069 · \u2068${shell.platform === "android" ? "Android" : "Windows"}\u2069`;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const origin = normalize(input.value);
      if (!origin) return showForm(MSG.invalid);
      go.disabled = true;
      go.textContent = "جارٍ الفحص…";
      msg.hidden = true;
      try {
        const err = await connect(shell, origin);
        if (err) showForm(MSG[err] || MSG.unreachable, origin);
      } finally {
        go.disabled = false;
        go.textContent = "اتصال";
      }
    });
    $("change").addEventListener("click", () => showForm("", $("auto-url").textContent));

    const saved = await shell.getServer();
    const params = new URLSearchParams(location.search);
    if (!saved) return showForm("");
    if (params.has("error")) return showForm(MSG.saved_failed, saved);
    if (params.has("change")) return showForm("", saved);

    // متابعة تلقائية مع مهلة قصيرة تتيح تغيير العنوان
    auto.hidden = false;
    $("auto-url").textContent = saved;
    await new Promise((r) => setTimeout(r, 1200));
    if (cancelled) return;
    const err = await connect(shell, saved);
    if (err && !cancelled) showForm(MSG[err] === MSG.unreachable ? MSG.saved_failed : MSG[err] || MSG.saved_failed, saved);
  }

  main();
})();
