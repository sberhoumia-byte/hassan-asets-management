/**
 * نظام التدبير المادي — تطبيق Windows.
 * واجهة رقيقة لخادم المؤسسة (قرار النشر: خادم مركزي): لا قاعدة بيانات ولا بيانات مؤسسة على الحاسوب،
 * يُحفظ عنوان الخادم فقط في config.json داخل مجلد بيانات التطبيق.
 * الأمن: عزل السياق، sandbox، لا Node في الصفحات، التنقل مقصور على أصل الخادم، والروابط الخارجية تفتح في المتصفح.
 */
const { app, BrowserWindow, Menu, ipcMain, net, session, shell, dialog } = require("electron");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const CONNECT = join(__dirname, "../connect/index.html");
const CONNECT_URL = pathToFileURL(CONNECT).href;
const configPath = () => join(app.getPath("userData"), "config.json");
let win = null;

function readServer() {
  try {
    const c = JSON.parse(readFileSync(configPath(), "utf8"));
    return typeof c.server === "string" ? new URL(c.server).origin : null;
  } catch {
    return null;
  }
}
function writeServer(origin) {
  writeFileSync(configPath(), JSON.stringify({ server: origin }, null, 2));
}

/** أصل http(s) صالح أو null. */
function toOrigin(url) {
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password ? u.origin : null;
  } catch {
    return null;
  }
}

const isConnectPage = (url) => typeof url === "string" && url.startsWith(CONNECT_URL);
const isServerUrl = (url) => {
  const s = readServer();
  return !!s && toOrigin(url) === s;
};

function showConnect(query = "") {
  win.loadFile(CONNECT, query ? { search: query } : undefined);
}

/** فحص الخادم من العملية الرئيسية (بلا قيود CORS): يجب أن يجيب /api/v1/health بـ {status:"ok"}. */
async function checkServer(origin) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await net.fetch(`${origin}/api/v1/health`, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) return { ok: false, error: "not_hassan" };
    const body = await r.json().catch(() => null);
    return body && body.status === "ok" ? { ok: true } : { ok: false, error: "not_hassan" };
  } catch (e) {
    return { ok: false, error: ctrl.signal.aborted ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

function registerIpc() {
  // القنوات متاحة لصفحة الاتصال المحلية فقط
  const fromConnect = (e) => isConnectPage(e.senderFrame && e.senderFrame.url);
  ipcMain.handle("shell:get", (e) => (fromConnect(e) ? readServer() : null));
  ipcMain.handle("shell:check", (e, url) => {
    const origin = toOrigin(url);
    if (!fromConnect(e) || !origin) return { ok: false, error: "invalid" };
    return checkServer(origin);
  });
  ipcMain.handle("shell:open", (e, url) => {
    const origin = toOrigin(url);
    if (!fromConnect(e) || !origin) return false;
    writeServer(origin);
    win.loadURL(`${origin}/`);
    return true;
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    {
      label: "التطبيق",
      submenu: [
        { label: "تغيير عنوان الخادم", click: () => showConnect("change=1") },
        { type: "separator" },
        { label: "إعادة التحميل", accelerator: "F5", click: () => win && win.webContents.reload() },
        { type: "separator" },
        isMac ? { role: "close", label: "إغلاق" } : { role: "quit", label: "خروج" },
      ],
    },
    {
      label: "تحرير",
      submenu: [
        { role: "undo", label: "تراجع" },
        { role: "redo", label: "إعادة" },
        { type: "separator" },
        { role: "cut", label: "قص" },
        { role: "copy", label: "نسخ" },
        { role: "paste", label: "لصق" },
        { role: "selectAll", label: "تحديد الكل" },
      ],
    },
    {
      label: "عرض",
      submenu: [
        { role: "zoomIn", label: "تكبير" },
        { role: "zoomOut", label: "تصغير" },
        { role: "resetZoom", label: "الحجم الأصلي" },
        { type: "separator" },
        { role: "togglefullscreen", label: "ملء الشاشة" },
      ],
    },
    {
      label: "مساعدة",
      submenu: [
        {
          label: "حول التطبيق",
          click: () =>
            dialog.showMessageBox(win, {
              type: "info",
              title: "التدبير المادي",
              message: `نظام التدبير المادي — مدرسة حسان بن ثابت\nالإصدار ${app.getVersion()}`,
              detail: `الخادم الحالي: ${readServer() || "غير محدد"}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: "التدبير المادي",
    backgroundColor: "#eef2f7",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      additionalArguments: [`--hassan-version=${app.getVersion()}`],
    },
  });
  win.once("ready-to-show", () => win.show());

  const wc = win.webContents;
  // التنقل داخل النافذة: صفحة الاتصال أو الخادم المحفوظ فقط؛ غير ذلك يفتح في المتصفح
  wc.on("will-navigate", (e, url) => {
    if (isConnectPage(url) || isServerUrl(url)) return;
    e.preventDefault();
    if (toOrigin(url)) shell.openExternal(url);
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (toOrigin(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // الخادم غير متاح عند فتحه ← العودة لصفحة الاتصال برسالة
  wc.on("did-fail-load", (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3 && !isConnectPage(url)) showConnect("error=1");
  });

  showConnect();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    // لا صلاحيات أجهزة (كاميرا، ميكروفون، موقع...) للصفحات
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "clipboard-sanitized-write" || permission === "fullscreen"));
    // لا تُحمّل أي صفحة داخل إطار من أصل آخر غير الخادم
    app.on("web-contents-created", (_e, contents) => {
      contents.on("will-attach-webview", (e) => e.preventDefault());
    });
    registerIpc();
    buildMenu();
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}

