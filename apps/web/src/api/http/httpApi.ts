/**
 * HttpApi — يكلّم خادم NestJS عبر /api/v1.
 * رمز الوصول في الذاكرة فقط (لا localStorage). رمز التجديد في كوكي httpOnly لا تصله الشيفرة.
 * عند 401 يُجدد الرمز مرة واحدة (طلب تجديد واحد مشترك) ثم يعيد الطلب.
 */
import type { AcademyInput, DirectorateInput, SchoolInput, SetupAdminInput, UserCreateInput, UserUpdateInput } from "@hassan/validation";
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
  type ManagedUser,
  type NotificationItem,
  type PermissionInfo,
  type PermissionOverride,
  type RoleCode,
  type RoleInfo,
  type School,
  type SessionUser,
  type UsersApi,
} from "../types";
import type { AssetsApi, CatalogApi, LoansApi, ResourcesApi, SpacesApi, StaffApi, StockApi, SuppliersApi } from "../phase4";
import { HttpAssetsApi, HttpCatalogApi, HttpLoansApi, HttpResourcesApi, HttpSpacesApi, HttpStaffApi, HttpStockApi, HttpSuppliersApi } from "./phase4Http";

type Method = "GET" | "POST" | "PUT" | "DELETE";
interface Opts {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  schoolId?: string; // ترويسة X-School-Id
  retry?: boolean;
}

/** رموز الخادم التي تقابلها رموز مختلفة في الشاشات (المكتوبة مع ReviewApi). */
const CODE_ALIASES: Record<string, string> = { WRONG_PASSWORD: "INVALID_CREDENTIALS" };

export class HttpApi implements Api {
  readonly mode = "server" as const;
  private accessToken: string | null = null;
  private refreshing: Promise<SessionUser | null> | null = null;
  readonly users: UsersApi;
  readonly catalog: CatalogApi;
  readonly assets: AssetsApi;
  readonly stock: StockApi;
  readonly suppliers: SuppliersApi;
  readonly spaces: SpacesApi;
  readonly staff: StaffApi;
  readonly resources: ResourcesApi;
  readonly loans: LoansApi;

  constructor(private base = "/api/v1") {
    this.users = new HttpUsersApi(this);
    this.catalog = new HttpCatalogApi(this);
    this.assets = new HttpAssetsApi(this);
    this.stock = new HttpStockApi(this);
    this.suppliers = new HttpSuppliersApi(this);
    this.spaces = new HttpSpacesApi(this);
    this.staff = new HttpStaffApi(this);
    this.resources = new HttpResourcesApi(this);
    this.loans = new HttpLoansApi(this);
  }

  async request<T>(method: Method, path: string, o: Opts = {}): Promise<T> {
    const url = new URL(this.base + path, window.location.origin);
    for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Accept: "application/json" };
    if (o.body !== undefined) headers["Content-Type"] = "application/json";
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    if (o.schoolId) headers["X-School-Id"] = o.schoolId;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        credentials: "include",
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
      });
    } catch {
      throw new ApiError("NETWORK_ERROR");
    }
    if (res.status === 401 && o.retry !== false && !path.startsWith("/auth/")) {
      const u = await this.refresh();
      if (u) return this.request<T>(method, path, { ...o, retry: false });
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (data?.error?.code as string | undefined) ?? "HTTP_" + res.status;
      throw new ApiError(CODE_ALIASES[code] ?? code, data?.error?.details);
    }
    return data as T;
  }

  /** تجديد واحد مشترك حتى لو فشلت عدة طلبات في نفس اللحظة. */
  private refresh(): Promise<SessionUser | null> {
    this.refreshing ??= (async () => {
      try {
        const r = await this.request<{ accessToken: string; user: SessionUser }>("POST", "/auth/refresh", { retry: false });
        this.accessToken = r.accessToken;
        return r.user;
      } catch {
        this.accessToken = null;
        return null;
      } finally {
        setTimeout(() => (this.refreshing = null), 0);
      }
    })();
    return this.refreshing;
  }

  // ---------- الإعداد والمصادقة ----------
  async needsSetup() {
    return (await this.request<{ needsSetup: boolean }>("GET", "/auth/setup-status")).needsSetup;
  }
  async setupTokenRequired() {
    return !!(await this.request<{ setupTokenRequired?: boolean }>("GET", "/auth/setup-status")).setupTokenRequired;
  }
  async setup(input: SetupAdminInput & { setupToken?: string }) {
    await this.request("POST", "/auth/setup", { body: input });
  }
  async login(username: string, password: string) {
    const r = await this.request<{ accessToken: string; user: SessionUser }>("POST", "/auth/login", { body: { username, password } });
    this.accessToken = r.accessToken;
    return r.user;
  }
  async logout() {
    try {
      await this.request("POST", "/auth/logout");
    } finally {
      this.accessToken = null;
    }
  }
  async me() {
    if (!this.accessToken) return this.refresh();
    try {
      return await this.request<SessionUser>("GET", "/auth/me");
    } catch (e) {
      if (e instanceof ApiError && e.code === "UNAUTHENTICATED") return this.refresh();
      throw e;
    }
  }
  async changePassword(currentPassword: string, newPassword: string) {
    await this.request("POST", "/auth/change-password", { body: { currentPassword, newPassword } });
  }

  // ---------- التسلسل الإداري ----------
  listAcademies() {
    return this.request<Academy[]>("GET", "/academies");
  }
  createAcademy(input: AcademyInput) {
    return this.request<Academy>("POST", "/academies", { body: input });
  }
  listDirectorates(academyId?: string) {
    return this.request<Directorate[]>("GET", "/directorates", { query: { academyId } });
  }
  createDirectorate(input: DirectorateInput) {
    return this.request<Directorate>("POST", "/directorates", { body: input });
  }
  listSchools(params: { directorateId?: string; q?: string } = {}) {
    return this.request<School[]>("GET", "/schools", { query: params });
  }
  getSchool(id: string) {
    return this.request<School>("GET", `/schools/${id}`);
  }
  createSchool(input: SchoolInput) {
    return this.request<School>("POST", "/schools", { body: input });
  }
  updateSchool(id: string, input: SchoolInput & { schoolYear?: string }) {
    return this.request<School>("PUT", `/schools/${id}`, { body: input });
  }

  // ---------- الهوية البصرية ----------
  getBranding(schoolId: string) {
    return this.request<Branding>("GET", `/schools/${schoolId}/branding`);
  }
  saveBranding(schoolId: string, input: Omit<Branding, "schoolId" | "updatedAt" | "updatedBy">) {
    return this.request<Branding>("PUT", `/schools/${schoolId}/branding`, { body: input });
  }
  resetBranding(schoolId: string) {
    return this.request<Branding>("POST", `/schools/${schoolId}/branding/reset`);
  }
  brandingHistory(schoolId: string) {
    return this.request<BrandingHistoryEntry[]>("GET", `/schools/${schoolId}/branding/history`);
  }

  // ---------- لوحة القيادة ----------
  dashboardStats(schoolId: string) {
    return this.request<DashboardStats>("GET", `/schools/${schoolId}/dashboard/stats`);
  }
  dashboardAlerts(schoolId: string) {
    return this.request<DashboardAlert[]>("GET", `/schools/${schoolId}/dashboard/alerts`);
  }
  recentActivity(schoolId: string, limit = 8) {
    return this.request<ActivityEntry[]>("GET", `/schools/${schoolId}/dashboard/activity`, { query: { limit } });
  }
  notifications() {
    return this.request<NotificationItem[]>("GET", "/notifications");
  }
}

class HttpUsersApi implements UsersApi {
  constructor(private h: HttpApi) {}
  listRoles() {
    return this.h.request<RoleInfo[]>("GET", "/roles");
  }
  listPermissions() {
    return this.h.request<PermissionInfo[]>("GET", "/permissions");
  }
  list(schoolId: string) {
    return this.h.request<ManagedUser[]>("GET", "/users", { schoolId });
  }
  create(schoolId: string, input: UserCreateInput) {
    return this.h.request<{ user: ManagedUser; temporaryPassword: string }>("POST", "/users", { schoolId, body: input });
  }
  update(schoolId: string, id: string, input: UserUpdateInput) {
    return this.h.request<ManagedUser>("PUT", `/users/${id}`, { schoolId, body: input });
  }
  setRoles(schoolId: string, id: string, roles: RoleCode[]) {
    return this.h.request<ManagedUser>("PUT", `/users/${id}/roles`, { schoolId, body: { roles } });
  }
  setOverrides(schoolId: string, id: string, overrides: PermissionOverride[]) {
    return this.h.request<ManagedUser>("PUT", `/users/${id}/overrides`, { schoolId, body: { overrides } });
  }
  resetPassword(schoolId: string, id: string) {
    return this.h.request<{ temporaryPassword: string }>("POST", `/users/${id}/reset-password`, { schoolId });
  }
}
