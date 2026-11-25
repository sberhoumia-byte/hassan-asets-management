import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inject } from "vitest";

// يُنفذ داخل عامل الاختبار قبل استيراد التطبيق: يوجه الخادم إلى مخطط الاختبار المعزول
process.env.DATABASE_URL = inject("testDatabaseUrl" as never) as string;
process.env.NODE_ENV = "test";
process.env.LOGIN_RATE_LIMIT = "1000";
process.env.STORAGE_PATH = mkdtempSync(join(tmpdir(), "hassan-storage-"));
delete process.env.SETUP_TOKEN;
