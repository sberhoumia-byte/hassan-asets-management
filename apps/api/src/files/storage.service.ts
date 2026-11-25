import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { config } from "../config";
import { E } from "../common/errors";

/** الأنواع المقبولة تُحدد من التوقيع الفعلي للملف، لا من الاسم أو الترويسة. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export interface DecodedImage {
  buf: Buffer;
  mime: string;
}

/** يفك data URL ويتحقق من النوع الحقيقي والحجم. */
export function decodeDataUrl(dataUrl: string, allowed: readonly string[], maxBytes: number, field: string): DecodedImage {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) throw E.validation({ fields: { [field]: "errors.fileType" } });
  const buf = Buffer.from(m[2]!, "base64");
  if (buf.length > maxBytes) throw E.validation({ fields: { [field]: "errors.fileTooLarge" } });
  const mime = sniffMime(buf);
  if (!mime || !allowed.includes(mime)) throw E.validation({ fields: { [field]: "errors.fileType" } });
  return { buf, mime };
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/** تخزين الملفات على القرص (STORAGE_PATH) مع سجل StoredFile. المسار الداخلي لا يُكشف للعميل. */
@Injectable()
export class StorageService {
  private root() {
    return resolve(config().STORAGE_PATH);
  }

  async save(
    tx: Prisma.TransactionClient,
    p: { schoolId: string; buf: Buffer; mime: string; originalName: string; uploadedById?: string },
  ) {
    const sha256 = createHash("sha256").update(p.buf).digest("hex");
    const key = `${p.schoolId}/${new Date().getFullYear()}/${randomUUID()}.${EXT[p.mime] ?? "bin"}`;
    const path = join(this.root(), key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, p.buf, { flag: "wx" });
    return tx.storedFile.create({
      data: {
        schoolId: p.schoolId,
        storageKey: key,
        originalName: p.originalName.slice(0, 200),
        mimeType: p.mime,
        sizeBytes: p.buf.length,
        sha256,
        uploadedById: p.uploadedById ?? null,
      },
    });
  }

  sha(buf: Buffer) {
    return createHash("sha256").update(buf).digest("hex");
  }

  async read(storageKey: string): Promise<Buffer> {
    const path = resolve(this.root(), storageKey);
    if (!path.startsWith(this.root())) throw E.notFound();
    return readFile(path);
  }

  async dataUrl(file: { storageKey: string; mimeType: string } | null | undefined): Promise<string | undefined> {
    if (!file) return undefined;
    try {
      return `data:${file.mimeType};base64,${(await this.read(file.storageKey)).toString("base64")}`;
    } catch {
      return undefined; // ملف مفقود على القرص: لا نُسقط الشاشة، يظهر كأنه غير موجود
    }
  }
}
