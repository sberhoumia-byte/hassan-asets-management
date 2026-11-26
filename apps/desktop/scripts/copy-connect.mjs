// ينسخ صفحة الاتصال المشتركة (apps/shell/connect) إلى التطبيق قبل التشغيل أو البناء.
import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, "../connect");
rmSync(dest, { recursive: true, force: true }); // نسخة مولَّدة (في .gitignore)، لا ملف أصلي
cpSync(join(here, "../../shell/connect"), dest, { recursive: true });
console.log("connect page copied →", dest);
