import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import * as argon2 from "argon2";
import { AuditService } from "../common/audit.service";
import type { AppRequest, AuthUser } from "../common/context";
import { AppError, E } from "../common/errors";
import { UUID_RE } from "../common/util";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";

const run = promisify(execFile);
const MAGIC = Buffer.from("HBK1");
const HEADER = 4 + 16 + 12; // magic + salt + iv
const TAG = 16;
export const RESTORE_PHRASE = "استعادة النسخة";
const FORMAT = 1;

export interface Manifest {
  format: number;
  createdAt: string;
  migration: string;
  counts: Record<string, number>;
  files: Record<string, string>; // الاسم ← sha256
}

/** اتصال libpq من DATABASE_URL: معامل schema خاص بـ Prisma ويُمرر لأدوات pg منفصلاً. */
export function pgTarget(url = config().DATABASE_URL) {
  const u = new URL(url);
  const schema = u.searchParams.get("schema") ?? "public";
  u.searchParams.delete("schema");
  return { conn: u.toString(), schema };
}

const sha = (p: string) =>
  new Promise<string>((res, rej) => {
    const h = createHash("sha256");
    createReadStream(p).on("data", (d) => h.update(d)).on("end", () => res(h.digest("hex"))).on("error", rej);
  });

/**
 * النسخ الاحتياطي الكامل للنظام: قاعدة البيانات (pg_dump بصيغة custom) + الملفات المرفوعة،
 * في حزمة واحدة مشفرة AES-256-GCM (المفتاح من BACKUP_ENCRYPTION_KEY، لا يُخزن في القاعدة) مع بيان ببصمات المحتوى وعدد سجلات كل جدول.
 * الاستعادة: لمدير النظام فقط، بكلمة مروره وعبارة تأكيد، بعد التحقق من سلامة النسخة وتطابق إصدار المخطط، ومع نسخة أمان تلقائية قبلها.
 */
@Injectable()
export class BackupService {
  private log = new Logger("Backup");
  private busy = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private dir() {
    return resolve(config().BACKUP_PATH);
  }
  private key(salt: Buffer) {
    const k = config().BACKUP_ENCRYPTION_KEY;
    if (!k) throw new AppError("BACKUP_KEY_MISSING", 503);
    return scryptSync(k, salt, 32);
  }
  private async lock<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw E.conflict("BACKUP_BUSY");
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }

  // ---------------- التشفير ----------------
  private async encrypt(src: string, dst: string) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key(salt), iv);
    const out = createWriteStream(dst, { flags: "wx" });
    out.write(Buffer.concat([MAGIC, salt, iv]));
    await pipeline(createReadStream(src), c, out, { end: false });
    await new Promise<void>((res, rej) => out.end(c.getAuthTag(), () => res()).on("error", rej));
  }

  private async decrypt(src: string, dst: string) {
    const { size } = await stat(src);
    if (size < HEADER + TAG) throw E.rule("BACKUP_CORRUPT");
    const fh = await open(src, "r");
    const head = Buffer.alloc(HEADER);
    const tag = Buffer.alloc(TAG);
    try {
      await fh.read(head, 0, HEADER, 0);
      await fh.read(tag, 0, TAG, size - TAG);
    } finally {
      await fh.close();
    }
    if (!head.subarray(0, 4).equals(MAGIC)) throw E.rule("BACKUP_CORRUPT");
    const d = createDecipheriv("aes-256-gcm", this.key(head.subarray(4, 20)), head.subarray(20, 32));
    d.setAuthTag(tag);
    try {
      await pipeline(createReadStream(src, { start: HEADER, end: size - TAG - 1 }), d, createWriteStream(dst));
    } catch {
      // وسم المصادقة لا يطابق: ملف معدّل أو مفتاح مختلف
      throw E.rule("BACKUP_DECRYPT_FAILED");
    }
  }

  // ---------------- المحتوى ----------------
  private async currentMigration() {
    const r = await this.prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1`,
    );
    return r[0]?.migration_name ?? "";
  }

  /** عدد السجلات الفعلي لكل جدول في مخطط التطبيق (للبيان والمقارنة بعد الاستعادة). */
  async counts(url = config().DATABASE_URL): Promise<Record<string, number>> {
    const { conn, schema } = pgTarget(url);
    const { Client } = await import("pg");
    const c = new Client({ connectionString: conn });
    await c.connect();
    try {
      const t = await c.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name`,
        [schema],
      );
      const out: Record<string, number> = {};
      for (const { table_name } of t.rows) {
        const r = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${schema.replace(/"/g, "")}"."${table_name.replace(/"/g, "")}"`);
        out[table_name] = Number(r.rows[0]!.n);
      }
      return out;
    } finally {
      await c.end();
    }
  }

  /** يبني الحزمة المشفرة ويعيد مسارها النسبي وبصمتها. */
  private async build(id: string) {
    const tmp = await mkdtemp(join(tmpdir(), "hassan-bk-"));
    try {
      const { conn, schema } = pgTarget();
      await run(config().PG_DUMP_PATH, ["--format=custom", "--no-owner", "--no-privileges", `--schema=${schema}`, `--file=${join(tmp, "db.dump")}`, `--dbname=${conn}`], { maxBuffer: 16 * 1024 * 1024 });
      const storage = resolve(config().STORAGE_PATH);
      await mkdir(storage, { recursive: true });
      await run("tar", ["-czf", join(tmp, "files.tgz"), "-C", storage, "."]);
      const manifest: Manifest = {
        format: FORMAT,
        createdAt: new Date().toISOString(),
        migration: await this.currentMigration(),
        counts: await this.counts(),
        files: { "db.dump": await sha(join(tmp, "db.dump")), "files.tgz": await sha(join(tmp, "files.tgz")) },
      };
      await writeFile(join(tmp, "manifest.json"), JSON.stringify(manifest, null, 2));
      await run("tar", ["-cf", join(tmp, "bundle.tar"), "-C", tmp, "manifest.json", "db.dump", "files.tgz"]);
      await mkdir(this.dir(), { recursive: true });
      const rel = `${new Date().toISOString().slice(0, 10)}_${id}.hbk`;
      await this.encrypt(join(tmp, "bundle.tar"), join(this.dir(), rel));
      const full = join(this.dir(), rel);
      return { rel, size: (await stat(full)).size, sha256: await sha(full), manifest };
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  /** يفك الحزمة في مجلد مؤقت ويتحقق من البصمة الخارجية وبصمات المحتوى وقابلية قراءة التفريغ. */
  private async open(row: { storagePath: string | null; sha256: string | null }) {
    if (!row.storagePath) throw E.rule("BACKUP_CORRUPT");
    const full = join(this.dir(), row.storagePath);
    if (!full.startsWith(this.dir()) || !existsSync(full)) throw E.rule("BACKUP_FILE_MISSING");
    if (row.sha256 && (await sha(full)) !== row.sha256) throw E.rule("BACKUP_CORRUPT");
    const tmp = await mkdtemp(join(tmpdir(), "hassan-rs-"));
    try {
      await this.decrypt(full, join(tmp, "bundle.tar"));
      await run("tar", ["-xf", join(tmp, "bundle.tar"), "-C", tmp, "manifest.json", "db.dump", "files.tgz"]).catch(() => {
        throw E.rule("BACKUP_CORRUPT");
      });
      const manifest = JSON.parse(await readFile(join(tmp, "manifest.json"), "utf8")) as Manifest;
      for (const [f, h] of Object.entries(manifest.files)) if ((await sha(join(tmp, f))) !== h) throw E.rule("BACKUP_CORRUPT");
      await run(config().PG_RESTORE_PATH, ["--list", join(tmp, "db.dump")], { maxBuffer: 64 * 1024 * 1024 }).catch(() => {
        throw E.rule("BACKUP_CORRUPT");
      });
      return { tmp, manifest };
    } catch (e) {
      await rm(tmp, { recursive: true, force: true });
      throw e;
    }
  }

  // ---------------- الواجهة البرمجية ----------------
  private view(r: { id: string; kind: string; status: string; sizeBytes: bigint | null; sha256: string | null; scheduled: boolean; startedAt: Date; finishedAt: Date | null; verifiedAt: Date | null; restoredAt: Date | null; error: string | null; triggeredById: string | null }) {
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      sizeBytes: r.sizeBytes === null ? undefined : Number(r.sizeBytes),
      sha256: r.sha256 ?? undefined,
      scheduled: r.scheduled,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString(),
      verifiedAt: r.verifiedAt?.toISOString(),
      restoredAt: r.restoredAt?.toISOString(),
      error: r.error ?? undefined,
      triggeredById: r.triggeredById ?? undefined,
    };
  }

  async list() {
    const rows = await this.prisma.backupRecord.findMany({ orderBy: { startedAt: "desc" }, take: 200 });
    const c = config();
    return { items: rows.map((r) => this.view(r)), encryption: !!c.BACKUP_ENCRYPTION_KEY, dailyHour: c.BACKUP_DAILY_HOUR ?? null, restorePhrase: RESTORE_PHRASE };
  }

  async create(user: AuthUser | null, req?: AppRequest, scheduled = false) {
    if (!config().BACKUP_ENCRYPTION_KEY) throw new AppError("BACKUP_KEY_MISSING", 503);
    return this.lock(() => this.createUnlocked(user, req, scheduled));
  }

  private async createUnlocked(user: AuthUser | null, req?: AppRequest, scheduled = false) {
    const row = await this.prisma.backupRecord.create({ data: { kind: "FULL", status: "RUNNING", scheduled, triggeredById: user?.id ?? null } });
    try {
      const b = await this.build(row.id);
      const done = await this.prisma.backupRecord.update({ where: { id: row.id }, data: { status: "SUCCEEDED", storagePath: b.rel, sizeBytes: BigInt(b.size), sha256: b.sha256, finishedAt: new Date() } });
      await this.audit.log({ action: "BACKUP_CREATE", entityType: "BackupRecord", entityId: row.id, userId: user?.id, after: { size: b.size, sha256: b.sha256, scheduled, migration: b.manifest.migration } }, req);
      return this.view(done);
    } catch (e) {
      const msg = e instanceof AppError ? e.code : e instanceof Error ? e.message.slice(0, 500) : String(e);
      this.log.error(`backup ${row.id} failed: ${msg}`);
      await this.prisma.backupRecord.update({ where: { id: row.id }, data: { status: "FAILED", error: msg, finishedAt: new Date() } });
      throw e instanceof AppError ? e : new AppError("BACKUP_FAILED", 500);
    }
  }

  private async row(id: string) {
    const r = UUID_RE.test(id) ? await this.prisma.backupRecord.findUnique({ where: { id } }) : null;
    if (!r || r.status === "RUNNING" || r.status === "FAILED") throw E.notFound();
    return r;
  }

  async verify(id: string, req: AppRequest) {
    const r = await this.row(id);
    const { tmp, manifest } = await this.open(r);
    await rm(tmp, { recursive: true, force: true });
    const up = await this.prisma.backupRecord.update({ where: { id }, data: { verifiedAt: new Date(), ...(r.status === "SUCCEEDED" ? { status: "VERIFIED" } : {}) } });
    await this.audit.log({ action: "BACKUP_VERIFY", entityType: "BackupRecord", entityId: id }, req);
    return { ...this.view(up), manifest: { createdAt: manifest.createdAt, migration: manifest.migration, counts: manifest.counts }, currentMigration: await this.currentMigration() };
  }

  async file(id: string, req: AppRequest) {
    const r = await this.row(id);
    const full = join(this.dir(), r.storagePath ?? "");
    if (!r.storagePath || !full.startsWith(this.dir()) || !existsSync(full)) throw E.rule("BACKUP_FILE_MISSING");
    await this.audit.log({ action: "BACKUP_DOWNLOAD", entityType: "BackupRecord", entityId: id }, req);
    return { path: full, filename: `hassan-backup-${r.storagePath}`, size: Number(r.sizeBytes ?? 0) };
  }

  /** تسجيل نسخة مرفوعة (من خادم آخر أو بعد عطل): تُحفظ ثم يُتحقق منها قبل أن تصير قابلة للاستعادة. */
  async upload(buf: Buffer, user: AuthUser, req: AppRequest) {
    if (buf.length < HEADER + TAG || !buf.subarray(0, 4).equals(MAGIC)) throw E.validation({ fields: { file: "errors.fileType" } });
    return this.lock(async () => {
      const row = await this.prisma.backupRecord.create({ data: { kind: "FULL", status: "RUNNING", triggeredById: user.id } });
      await mkdir(this.dir(), { recursive: true });
      const rel = `uploaded_${row.id}.hbk`;
      await writeFile(join(this.dir(), rel), buf, { flag: "wx" });
      const sha256 = createHash("sha256").update(buf).digest("hex");
      try {
        const { tmp } = await this.open({ storagePath: rel, sha256 });
        await rm(tmp, { recursive: true, force: true });
      } catch (e) {
        await this.prisma.backupRecord.update({ where: { id: row.id }, data: { status: "FAILED", storagePath: rel, error: e instanceof AppError ? e.code : "BACKUP_CORRUPT", finishedAt: new Date() } });
        throw e;
      }
      const up = await this.prisma.backupRecord.update({ where: { id: row.id }, data: { status: "VERIFIED", storagePath: rel, sizeBytes: BigInt(buf.length), sha256, finishedAt: new Date(), verifiedAt: new Date() } });
      await this.audit.log({ action: "BACKUP_UPLOAD", entityType: "BackupRecord", entityId: row.id, after: { size: buf.length, sha256 } }, req);
      return this.view(up);
    });
  }

  /**
   * الاستعادة: كلمة مرور المدير + العبارة ← التحقق من النسخة ← تطابق إصدار المخطط ← نسخة أمان تلقائية
   * ← pg_restore في معاملة واحدة (كل شيء أو لا شيء) ← استرجاع الملفات المرفوعة (دون حذف الموجود)
   * ← إعادة سجلات النسخ (تفريغ القاعدة القديم لا يعرف النسخ الأحدث) ← تدقيق.
   */
  async restore(id: string, body: { password: string; confirm: string }, user: AuthUser, req: AppRequest) {
    if (body.confirm !== RESTORE_PHRASE) throw E.validation({ fields: { confirm: "errors.confirmPhrase" } });
    const u = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!u || !(await argon2.verify(u.passwordHash, body.password).catch(() => false))) throw E.rule("WRONG_PASSWORD");
    const r = await this.row(id);
    return this.lock(async () => {
      const { tmp, manifest } = await this.open(r);
      try {
        const cur = await this.currentMigration();
        if (manifest.migration !== cur) throw E.conflict("BACKUP_SCHEMA_MISMATCH", { backup: manifest.migration, current: cur });
        const safety = await this.createUnlocked(user, req, false);
        const records = await this.prisma.backupRecord.findMany();
        const { conn, schema } = pgTarget();
        try {
          await run(config().PG_RESTORE_PATH, ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", "--exit-on-error", `--schema=${schema}`, `--dbname=${conn}`, join(tmp, "db.dump")], { maxBuffer: 64 * 1024 * 1024 });
        } catch (e) {
          this.log.error(`restore ${id} failed: ${e instanceof Error ? e.message.slice(0, 500) : e}`);
          throw new AppError("RESTORE_FAILED", 500, { safetyBackupId: safety.id });
        }
        const storage = resolve(config().STORAGE_PATH);
        await mkdir(storage, { recursive: true });
        await run("tar", ["-xzf", join(tmp, "files.tgz"), "-C", storage, "--keep-old-files"]).catch(() => undefined); // الملفات الموجودة لا تُستبدل
        for (const b of records) {
          const { id: bid, ...data } = b;
          await this.prisma.backupRecord.upsert({ where: { id: bid }, create: b, update: data });
        }
        const done = await this.prisma.backupRecord.update({ where: { id }, data: { status: "RESTORED", restoredAt: new Date() } });
        await this.audit.log({ action: "BACKUP_RESTORE", entityType: "BackupRecord", entityId: id, userId: user.id, after: { backupCreatedAt: manifest.createdAt, safetyBackupId: safety.id, counts: manifest.counts } }, req);
        return { ...this.view(done), safetyBackupId: safety.id, counts: await this.counts() };
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  }

  /** النسخ اليومي التلقائي (BACKUP_DAILY_HOUR) — يُفحص كل 10 دقائق، نسخة واحدة في اليوم. */
  startScheduler() {
    const hour = config().BACKUP_DAILY_HOUR;
    if (hour === undefined || !config().BACKUP_ENCRYPTION_KEY) return;
    const tick = async () => {
      const now = new Date();
      if (now.getHours() !== hour || this.busy) return;
      const since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (await this.prisma.backupRecord.count({ where: { scheduled: true, startedAt: { gte: since }, status: { not: "FAILED" } } })) return;
      await this.create(null, undefined, true).catch((e) => this.log.error(`scheduled backup failed: ${e instanceof Error ? e.message : e}`));
    };
    this.timer = setInterval(() => void tick(), 10 * 60_000);
    this.timer.unref();
    void tick();
  }
}
