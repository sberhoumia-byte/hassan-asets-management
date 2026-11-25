/**
 * ReviewApi — طبقة بيانات «وضع المراجعة» للمرحلة الثانية.
 *
 * تنفذ نفس واجهة Api التي سينفذها HttpApi في المرحلة 3، لكنها تحفظ البيانات
 * في IndexedDB داخل هذا المتصفح فقط. لا تحتوي على أي بيانات واقعية مفترضة:
 * المحتوى الأولي الوحيد هو التسلسل الإداري الافتراضي الذي تنص عليه المواصفات،
 * وحساب المدير يُنشأ من طرف المستخدم عند أول تشغيل (لا كلمات مرور في الشيفرة).
 */
import { createStore, get, set, type UseStore } from "idb-keyval";
import type {
  AcademyInput,
  DirectorateInput,
  SchoolInput,
  SetupAdminInput,
} from "@hassan/validation";
import {
  ApiError,
  type Academy,
  type ActivityEntry,
  type Api,
  type Branding,
  type BrandingHistoryEntry,
  type DashboardAlert,
  type DashboardStats,
  type Directorate,
  type NotificationItem,
  type School,
  type SessionUser,
} from "../types";
import { hashPassword, verifyPassword } from "../../lib/crypto";
import { defaultBranding, DEFAULT_HIERARCHY } from "../../lib/defaults";
import { matchesQuery } from "../../lib/text";

interface StoredUser extends SessionUser {
  passwordHash: string;
  failedLogins: number;
  lockedUntil?: number;
}

interface DB {
  users: StoredUser[];
  academies: Academy[];
  directorates: Directorate[];
  schools: School[];
  branding: Record<string, Branding>;
  brandingHistory: Record<string, BrandingHistoryEntry[]>;
  activity: ActivityEntry[];
}

const SESSION_KEY = "hassan.session";
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000; // مطابق للخادم
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined)) as T;

function sessionGet(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
function sessionSet(v: string | null) {
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, v);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* التخزين غير متاح */
  }
}

export class ReviewApi implements Api {
  readonly mode = "review" as const;
  private store: UseStore;
  private cache: DB | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dbName = "hassan-review") {
    this.store = createStore(dbName, "kv");
  }

  // ---------- تخزين ----------
  private async load(): Promise<DB> {
    if (this.cache) return this.cache;
    const db = (await get<DB>("db", this.store)) ?? this.seed();
    this.cache = db;
    return db;
  }

  /** كل كتابة تمر بطابور واحد (ما يعادل المعاملة في هذا الوضع). */
  private write<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const db = await this.load();
      const draft: DB = structuredClone(db);
      const result = await fn(draft);
      await set("db", draft, this.store);
      this.cache = draft;
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private seed(): DB {
    const academy: Academy = { id: uid(), ...DEFAULT_HIERARCHY.academy };
    const directorate: Directorate = { id: uid(), academyId: academy.id, ...DEFAULT_HIERARCHY.directorate };
    const school: School = { id: uid(), directorateId: directorate.id, ...DEFAULT_HIERARCHY.school };
    return {
      users: [],
      academies: [academy],
      directorates: [directorate],
      schools: [school],
      branding: {},
      brandingHistory: {},
      activity: [],
    };
  }

  private log(db: DB, by: string, action: string, schoolId?: string, entity?: string) {
    db.activity.unshift({ id: uid(), at: now(), by, action, schoolId, entity });
    db.activity = db.activity.slice(0, 500);
  }

  private async current(): Promise<StoredUser> {
    const id = sessionGet();
    const db = await this.load();
    const u = id ? db.users.find((x) => x.id === id) : undefined;
    if (!u) throw new ApiError("UNAUTHENTICATED");
    return u;
  }

  private static toSession(u: StoredUser): SessionUser {
    return { id: u.id, username: u.username, fullNameAr: u.fullNameAr, roles: u.roles };
  }

  private assertSchoolAccess(u: SessionUser, schoolId: string) {
    const admin = u.roles.some((r) => r.role === "ADMIN");
    if (!admin && !u.roles.some((r) => r.schoolId === schoolId)) throw new ApiError("SCHOOL_ACCESS_DENIED");
  }

  // ---------- الإعداد والمصادقة ----------
  async needsSetup() {
    return (await this.load()).users.length === 0;
  }

  async setup(input: SetupAdminInput) {
    const passwordHash = await hashPassword(input.password);
    await this.write((db) => {
      if (db.users.length > 0) throw new ApiError("ALREADY_SET_UP");
      const school = db.schools[0];
      if (!school) throw new ApiError("NO_SCHOOL");
      const user: StoredUser = {
        id: uid(),
        username: input.username.trim(),
        fullNameAr: input.fullNameAr.trim(),
        roles: [{ role: "ADMIN", schoolId: school.id }],
        passwordHash,
        failedLogins: 0,
      };
      db.users.push(user);
      this.log(db, user.fullNameAr, "activity.setup", school.id);
    });
  }

  async login(username: string, password: string) {
    const db = await this.load();
    const u = db.users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
    if (!u) throw new ApiError("INVALID_CREDENTIALS");
    if (u.lockedUntil && u.lockedUntil > Date.now()) {
      throw new ApiError("ACCOUNT_LOCKED", { minutes: Math.ceil((u.lockedUntil - Date.now()) / 60000) });
    }
    const ok = await verifyPassword(password, u.passwordHash);
    await this.write((d) => {
      const x = d.users.find((y) => y.id === u.id)!;
      if (ok) {
        x.failedLogins = 0;
        x.lockedUntil = undefined;
        this.log(d, x.fullNameAr, "activity.login", x.roles[0]?.schoolId);
      } else {
        x.failedLogins += 1;
        if (x.failedLogins >= MAX_FAILED) {
          x.lockedUntil = Date.now() + LOCK_MS;
          x.failedLogins = 0;
        }
      }
    });
    if (!ok) throw new ApiError("INVALID_CREDENTIALS");
    sessionSet(u.id);
    return ReviewApi.toSession(u);
  }

  async logout() {
    sessionSet(null);
  }

  async me() {
    try {
      return ReviewApi.toSession(await this.current());
    } catch {
      return null;
    }
  }

  async changePassword(currentPw: string, next: string) {
    const u = await this.current();
    if (!(await verifyPassword(currentPw, u.passwordHash))) throw new ApiError("INVALID_CREDENTIALS");
    const passwordHash = await hashPassword(next);
    await this.write((db) => {
      db.users.find((x) => x.id === u.id)!.passwordHash = passwordHash;
      this.log(db, u.fullNameAr, "activity.passwordChanged");
    });
  }

  // ---------- التسلسل الإداري ----------
  async listAcademies() {
    await this.current();
    return [...(await this.load()).academies].sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
  }

  async createAcademy(input: AcademyInput) {
    const u = await this.current();
    return this.write((db) => {
      if (db.academies.some((a) => a.nameAr.trim() === input.nameAr.trim())) throw new ApiError("DUPLICATE_NAME");
      const a: Academy = clean({ id: uid(), ...input });
      db.academies.push(a);
      this.log(db, u.fullNameAr, "activity.academyCreated", undefined, a.nameAr);
      return a;
    });
  }

  async listDirectorates(academyId?: string) {
    await this.current();
    const db = await this.load();
    return db.directorates
      .filter((d) => !academyId || d.academyId === academyId)
      .sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
  }

  async createDirectorate(input: DirectorateInput) {
    const u = await this.current();
    return this.write((db) => {
      if (!db.academies.some((a) => a.id === input.academyId)) throw new ApiError("ACADEMY_NOT_FOUND");
      if (db.directorates.some((d) => d.academyId === input.academyId && d.nameAr.trim() === input.nameAr.trim()))
        throw new ApiError("DUPLICATE_NAME");
      const d: Directorate = clean({ id: uid(), ...input });
      db.directorates.push(d);
      this.log(db, u.fullNameAr, "activity.directorateCreated", undefined, d.nameAr);
      return d;
    });
  }

  async listSchools(params: { directorateId?: string; q?: string } = {}) {
    const u = await this.current();
    const db = await this.load();
    const admin = u.roles.some((r) => r.role === "ADMIN");
    return db.schools
      .filter((s) => admin || u.roles.some((r) => r.schoolId === s.id))
      .filter((s) => !params.directorateId || s.directorateId === params.directorateId)
      .filter((s) => matchesQuery(params.q ?? "", s.nameAr, s.nameFr, s.adminCode))
      .sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
  }

  async getSchool(id: string) {
    const u = await this.current();
    this.assertSchoolAccess(u, id);
    const s = (await this.load()).schools.find((x) => x.id === id);
    if (!s) throw new ApiError("NOT_FOUND");
    return s;
  }

  async createSchool(input: SchoolInput) {
    const u = await this.current();
    return this.write((db) => {
      if (!db.directorates.some((d) => d.id === input.directorateId)) throw new ApiError("DIRECTORATE_NOT_FOUND");
      if (input.adminCode && db.schools.some((s) => s.adminCode === input.adminCode))
        throw new ApiError("DUPLICATE_ADMIN_CODE");
      const s: School = clean({ id: uid(), ...input });
      db.schools.push(s);
      this.log(db, u.fullNameAr, "activity.schoolCreated", s.id, s.nameAr);
      return s;
    });
  }

  async updateSchool(id: string, input: SchoolInput & { schoolYear?: string }) {
    const u = await this.current();
    this.assertSchoolAccess(u, id);
    return this.write((db) => {
      const i = db.schools.findIndex((s) => s.id === id);
      if (i < 0) throw new ApiError("NOT_FOUND");
      if (!db.directorates.some((d) => d.id === input.directorateId)) throw new ApiError("DIRECTORATE_NOT_FOUND");
      if (input.adminCode && db.schools.some((s) => s.id !== id && s.adminCode === input.adminCode))
        throw new ApiError("DUPLICATE_ADMIN_CODE");
      const s: School = clean({ ...input, id });
      db.schools[i] = s;
      this.log(db, u.fullNameAr, "activity.schoolUpdated", id, s.nameAr);
      return s;
    });
  }

  // ---------- الهوية البصرية ----------
  private brandingFor(db: DB, schoolId: string): Branding {
    const existing = db.branding[schoolId];
    if (existing) return existing;
    const s = db.schools.find((x) => x.id === schoolId);
    const d = s && db.directorates.find((x) => x.id === s.directorateId);
    const a = d && db.academies.find((x) => x.id === d.academyId);
    return defaultBranding(schoolId, a, d, s);
  }

  async getBranding(schoolId: string) {
    const u = await this.current();
    this.assertSchoolAccess(u, schoolId);
    return this.brandingFor(await this.load(), schoolId);
  }

  async saveBranding(schoolId: string, input: Omit<Branding, "schoolId" | "updatedAt" | "updatedBy">) {
    const u = await this.current();
    this.assertSchoolAccess(u, schoolId);
    return this.write((db) => {
      const prev = this.brandingFor(db, schoolId);
      const version = (prev.updatedAt ? prev.letterhead.version : 0) + 1;
      const b: Branding = {
        ...input,
        schoolId,
        letterhead: { ...input.letterhead, version },
        updatedAt: now(),
        updatedBy: u.fullNameAr,
      };
      db.branding[schoolId] = b;
      const hist = (db.brandingHistory[schoolId] ??= []);
      hist.unshift({ at: b.updatedAt!, by: u.fullNameAr, version, summaryKey: "history.saved" });
      this.log(db, u.fullNameAr, "activity.brandingSaved", schoolId);
      return b;
    });
  }

  async resetBranding(schoolId: string) {
    const u = await this.current();
    this.assertSchoolAccess(u, schoolId);
    return this.write((db) => {
      const prevVersion = db.branding[schoolId]?.letterhead.version ?? 0;
      delete db.branding[schoolId];
      const b = this.brandingFor(db, schoolId);
      const reset: Branding = {
        ...b,
        letterhead: { ...b.letterhead, version: prevVersion + 1 },
        updatedAt: now(),
        updatedBy: u.fullNameAr,
      };
      db.branding[schoolId] = reset;
      (db.brandingHistory[schoolId] ??= []).unshift({
        at: reset.updatedAt!,
        by: u.fullNameAr,
        version: reset.letterhead.version,
        summaryKey: "history.reset",
      });
      this.log(db, u.fullNameAr, "activity.brandingReset", schoolId);
      return reset;
    });
  }

  async brandingHistory(schoolId: string) {
    const u = await this.current();
    this.assertSchoolAccess(u, schoolId);
    return (await this.load()).brandingHistory[schoolId] ?? [];
  }

  // ---------- لوحة القيادة ----------
  /**
   * الإحصائيات محسوبة من المخزن. وحدات الممتلكات والمخزون والإعارة لم تُبنَ بعد
   * (المراحل 4–6)، لذلك لا توجد لها سجلات والعدّ صفر فعلاً، وليس رقماً ثابتاً.
   */
  async dashboardStats(schoolId: string): Promise<DashboardStats> {
    const u = await this.current();
    this.assertSchoolAccess(u, schoolId);
    return {
      assets: 0,
      stockItems: 0,
      buildingsRooms: 0,
      facilities: 0,
      resources: 0,
      activeLoans: 0,
      overdueLoans: 0,
      openMaintenance: 0,
    };
  }

  async dashboardAlerts(schoolId: string): Promise<DashboardAlert[]> {
    const u = await this.current();
    this.assertSchoolAccess(u, schoolId);
    return [];
  }

  async recentActivity(schoolId: string, limit = 8) {
    const u = await this.current();
    this.assertSchoolAccess(u, schoolId);
    return (await this.load()).activity.filter((a) => !a.schoolId || a.schoolId === schoolId).slice(0, limit);
  }

  async notifications(): Promise<NotificationItem[]> {
    await this.current();
    return [];
  }
}
