/** التحقق من نوع الصورة الحقيقي (magic bytes) وليس الامتداد فقط. */
export type ImageKind = "image/png" | "image/jpeg" | "image/webp";

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50)
    return "image/webp";
  return null;
}

export type FileCheck = { ok: true; dataUrl: string } | { ok: false; error: "type" | "size" };

export async function readImage(file: File, allowed: readonly string[], maxBytes: number): Promise<FileCheck> {
  if (file.size > maxBytes) return { ok: false, error: "size" };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const kind = sniffImage(head);
  if (!kind || !allowed.includes(kind)) return { ok: false, error: "type" };
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  return { ok: true, dataUrl };
}
