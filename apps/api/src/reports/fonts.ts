import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "../config";

/**
 * خطوط مضمنة في كل وثيقة PDF (لا تعتمد على خطوط النظام):
 * Noto Sans Arabic للحروف العربية (والعناوين بوزنه العريض)، Tajawal للاتينية والأرقام.
 * لم يُعتمد Cairo في PDF: بعض ربطاته (مثل «ير») تُستخرج نصاً بترتيب مقلوب عند النسخ أو البحث.
 * الملفات من حزم @fontsource (رخصة OFL) وتُحمَّل مرة واحدة.
 */
const AR_RANGE = "U+0600-06FF,U+0750-077F,U+0870-08FF,U+200C-200F,U+2010-2011,U+FB50-FDFF,U+FE70-FEFC";
const LATIN_RANGE = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-200B,U+2012-206F,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD";

function fontsRoot(): string {
  const env = config().FONTS_PATH;
  if (env && existsSync(env)) return env;
  let d = process.cwd();
  for (let i = 0; i < 6; i++) {
    const c = join(d, "node_modules", "@fontsource");
    if (existsSync(join(c, "noto-sans-arabic"))) return c;
    d = dirname(d);
  }
  throw new Error("Fonts not found: install @fontsource packages or set FONTS_PATH");
}

let cached: string | null = null;

/** قواعد @font-face بملفات woff2 مضمنة (data URI). */
export function fontFaceCss(): string {
  if (cached) return cached;
  const root = fontsRoot();
  const face = (family: string, pkg: string, file: string, weight: number, range: string) => {
    const b64 = readFileSync(join(root, pkg, "files", file)).toString("base64");
    return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${range};}`;
  };
  cached = [
    face("DocSans", "noto-sans-arabic", "noto-sans-arabic-arabic-400-normal.woff2", 400, AR_RANGE),
    face("DocSans", "noto-sans-arabic", "noto-sans-arabic-arabic-700-normal.woff2", 700, AR_RANGE),
    face("DocSans", "tajawal", "tajawal-latin-400-normal.woff2", 400, LATIN_RANGE),
    face("DocSans", "tajawal", "tajawal-latin-700-normal.woff2", 700, LATIN_RANGE),
  ].join("\n");
  return cached;
}
