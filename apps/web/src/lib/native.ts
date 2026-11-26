/**
 * تكامل مع تطبيق Android (Capacitor): WebView في Android لا ينزّل روابط blob ولا يدعم window.print،
 * فيوفّر التطبيق جسر HassanAndroid لحفظ الملفات في التنزيلات وللطباعة. في المتصفح وWindows لا يوجد الجسر.
 */
interface AndroidBridge {
  saveFile(name: string, mime: string, base64: string): boolean;
  print(title: string): void;
}
const android = (): AndroidBridge | undefined => (window as unknown as { HassanAndroid?: AndroidBridge }).HassanAndroid;

/** يحفظ الملف عبر تطبيق Android إن وُجد. يعيد false إن لم يكن الجسر متاحاً. */
export async function saveViaAndroid(blob: Blob, filename: string): Promise<boolean> {
  const a = android();
  if (!a?.saveFile) return false;
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  return a.saveFile(filename, blob.type || "application/octet-stream", dataUrl.slice(dataUrl.indexOf(",") + 1));
}

/** طباعة الصفحة الحالية: خدمة الطباعة في Android أو نافذة الطباعة في المتصفح. */
export function printPage() {
  const a = android();
  if (a?.print) a.print(document.title);
  else window.print();
}
