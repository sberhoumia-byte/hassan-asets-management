import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { ReviewApi } from "./reviewApi";
import { ApiError } from "../types";

// sessionStorage بسيط لبيئة Node
const mem = new Map<string, string>();
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

let n = 0;
let api: ReviewApi;
const admin = { fullNameAr: "مدير", username: "admin", password: "Passw0rd123", confirmPassword: "Passw0rd123" };

beforeEach(async () => {
  mem.clear();
  api = new ReviewApi(`test-${++n}`);
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof ApiError ? e.code : String(e);
  }
};

describe("ReviewApi — الإعداد والمصادقة", () => {
  it("يحتاج إعداداً أولياً ولا يوجد أي مستخدم افتراضي", async () => {
    expect(await api.needsSetup()).toBe(true);
    expect(await code(api.login("admin", "anything"))).toBe("INVALID_CREDENTIALS");
  });

  it("الإعداد ينشئ مديراً مرتبطاً بالمؤسسة الافتراضية ولا يتكرر", async () => {
    await api.setup(admin);
    expect(await api.needsSetup()).toBe(false);
    expect(await code(api.setup(admin))).toBe("ALREADY_SET_UP");
    const u = await api.login("admin", admin.password);
    expect(u.roles[0]?.role).toBe("ADMIN");
    const schools = await api.listSchools();
    expect(schools.map((s) => s.nameAr)).toEqual(["مؤسسة حسان بن ثابت الابتدائية بأورير"]);
    expect(u.roles[0]?.schoolId).toBe(schools[0]!.id);
  });

  it("يقفل الحساب بعد 5 محاولات فاشلة", async () => {
    await api.setup(admin);
    for (let i = 0; i < 5; i++) expect(await code(api.login("admin", "wrong-pass-1"))).toBe("INVALID_CREDENTIALS");
    expect(await code(api.login("admin", admin.password))).toBe("ACCOUNT_LOCKED");
  });

  it("كل العمليات تتطلب جلسة", async () => {
    await api.setup(admin);
    await api.logout();
    expect(await code(api.listAcademies())).toBe("UNAUTHENTICATED");
  });
});

describe("ReviewApi — التسلسل الإداري", () => {
  beforeEach(async () => {
    await api.setup(admin);
    await api.login("admin", admin.password);
  });

  it("المديريات تُصفّى حسب الأكاديمية، والمؤسسات حسب المديرية", async () => {
    const [souss] = await api.listAcademies();
    const other = await api.createAcademy({ nameAr: "أكاديمية أخرى" });
    const d2 = await api.createDirectorate({ academyId: other.id, nameAr: "مديرية أخرى" });
    expect((await api.listDirectorates(souss!.id)).map((d) => d.nameAr)).toEqual(["المديرية الإقليمية أكادير إداوتنان"]);
    expect((await api.listDirectorates(other.id)).map((d) => d.id)).toEqual([d2.id]);
    await api.createSchool({ directorateId: d2.id, nameAr: "مؤسسة تجريبية", adminCode: "X1" });
    expect(await api.listSchools({ directorateId: d2.id })).toHaveLength(1);
    expect(await api.listSchools({ directorateId: d2.id, q: "X1" })).toHaveLength(1);
    expect(await api.listSchools({ directorateId: d2.id, q: "غير" })).toHaveLength(0);
  });

  it("يمنع مديرية بلا أكاديمية صالحة، والأسماء والرموز المكررة", async () => {
    expect(await code(api.createDirectorate({ academyId: "nope", nameAr: "x" }))).toBe("ACADEMY_NOT_FOUND");
    const [a] = await api.listAcademies();
    expect(await code(api.createAcademy({ nameAr: a!.nameAr }))).toBe("DUPLICATE_NAME");
    const [d] = await api.listDirectorates();
    await api.createSchool({ directorateId: d!.id, nameAr: "م1", adminCode: "C-1" });
    expect(await code(api.createSchool({ directorateId: d!.id, nameAr: "م2", adminCode: "C-1" }))).toBe("DUPLICATE_ADMIN_CODE");
  });
});

describe("ReviewApi — الهوية البصرية المركزية", () => {
  it("الحفظ يرفع الإصدار ويُسجَّل، والاستعادة ترجع الافتراضي", async () => {
    await api.setup(admin);
    await api.login("admin", admin.password);
    const [s] = await api.listSchools();
    const b = await api.getBranding(s!.id);
    expect(b.letterhead.linesAr).toContain(s!.nameAr);
    const { schoolId: _x, ...rest } = b;
    const saved = await api.saveBranding(s!.id, { ...rest, letterhead: { ...b.letterhead, linesAr: ["سطر جديد"] } });
    expect(saved.letterhead.version).toBe(1);
    expect((await api.getBranding(s!.id)).letterhead.linesAr).toEqual(["سطر جديد"]);
    const saved2 = await api.saveBranding(s!.id, { ...rest, letterhead: { ...b.letterhead, footerText: "تذييل" } });
    expect(saved2.letterhead.version).toBe(2);
    const reset = await api.resetBranding(s!.id);
    expect(reset.letterhead.linesAr).toContain(s!.nameAr);
    expect(reset.letterhead.version).toBe(3);
    expect((await api.brandingHistory(s!.id)).map((h) => h.summaryKey)).toEqual(["history.reset", "history.saved", "history.saved"]);
    const acts = (await api.recentActivity(s!.id, 20)).map((a) => a.action);
    expect(acts).toContain("activity.brandingSaved");
  });

  it("إحصائيات لوحة القيادة صفر فعلي (لا أرقام ثابتة) قبل بناء الوحدات", async () => {
    await api.setup(admin);
    await api.login("admin", admin.password);
    const [s] = await api.listSchools();
    expect(Object.values(await api.dashboardStats(s!.id)).every((v) => v === 0)).toBe(true);
  });
});
