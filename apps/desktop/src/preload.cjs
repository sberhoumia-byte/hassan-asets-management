/**
 * جسر صفحة الاتصال المحلية: قراءة العنوان المحفوظ، فحص الخادم، والانتقال إليه.
 * العملية الرئيسية ترفض هذه الطلبات إن لم تأتِ من صفحة الاتصال نفسها.
 */
const { contextBridge, ipcRenderer } = require("electron");

if (location.protocol === "file:") {
  contextBridge.exposeInMainWorld("HassanShell", {
    platform: "windows",
    version: (process.argv.find((a) => a.startsWith("--hassan-version=")) || "=?").split("=")[1],
    getServer: () => ipcRenderer.invoke("shell:get"),
    check: (url) => ipcRenderer.invoke("shell:check", String(url)),
    open: (url) => ipcRenderer.invoke("shell:open", String(url)),
  });
}
