/**
 * عقود البيانات المستعملة في الواجهة — تطابق API_DESIGN.md.
 * في المرحلة 3 يحل HttpApi (fetch إلى /api/v1) محل ReviewApi دون تغيير الشاشات.
 */
import type {
  AcademyInput,
  DirectorateInput,
  LetterheadInput,
  LogoSettingsInput,
  SchoolInput,
  SetupAdminInput,
  UserCreateInput,
  UserUpdateInput,
} from "@hassan/validation";
import type { AssetsApi, CatalogApi, LoansApi, ResourcesApi, SpacesApi, StaffApi, StockApi, SuppliersApi } from "./phase4";
import type { CustodyApi, InventoryApi, MaintenanceApi, PurchasingApi } from "./phase6";
import type { ReportsApi } from "./phase7";
import type { DocumentsApi, ImportsApi } from "./phase7b";
import type { AuditApi, FloorPlanApi, NotificationsApi, SyncApi } from "./phase8";

export type RoleCode =
  | "ADMIN"
  | "DIRECTOR"
  | "ASSET_MANAGER"
  | "STOCK_MANAGER"
  | "MAINTENANCE_MANAGER"
  | "EDUCATIONAL_RESOURCES_MANAGER"
  | "INVENTORY_MANAGER"
  | "DOCUMENT_MANAGER"
  | "VIEWER";

export interface Academy { id: string; nameAr: string; nameFr?: string; code?: string }
export interface Directorate { id: string; academyId: string; nameAr: string; nameFr?: string; code?: string }
export interface School {
  id: string;
  directorateId: string;
  nameAr: string;
  nameFr?: string;
  adminCode?: string;
  cycle?: string;
  address?: string;
  phone?: string;
  email?: string;
  schoolYear?: string;
}

export interface SessionUser {
  id: string;
  username: string;
  fullNameAr: string;
  roles: { role: RoleCode; schoolId: string }[];
  /** الخادم فقط: الصلاحيات الفعلية لكل مؤسسة (أدوار + منح − سحب). */
  permissions?: Record<string, string[]>;
  isSystemAdmin?: boolean;
  /** كلمة مرور مؤقتة: يجب تغييرها قبل أي عمل. */
  mustChangePassword?: boolean;
}

// ---------- إدارة المستخدمين (الخادم فقط — المرحلة 3) ----------
export interface RoleInfo { code: RoleCode; nameAr: string; nameFr?: string; permissions: string[] }
export interface PermissionInfo { code: string; module: string; action: string }
export interface PermissionOverride { permission: string; granted: boolean }
export interface ManagedUser {
  id: string;
  username: string;
  fullNameAr: string;
  fullNameFr?: string;
  email?: string;
  phone?: string;
  status: "ACTIVE" | "SUSPENDED" | "DISABLED";
  mustChangePassword: boolean;
  lastLoginAt?: string;
  locked: boolean;
  roles: RoleCode[];
  overrides: PermissionOverride[];
}

/** كل العمليات داخل المؤسسة النشطة schoolId. */
export interface UsersApi {
  listRoles(): Promise<RoleInfo[]>;
  listPermissions(): Promise<PermissionInfo[]>;
  list(schoolId: string): Promise<ManagedUser[]>;
  create(schoolId: string, input: UserCreateInput): Promise<{ user: ManagedUser; temporaryPassword: string }>;
  update(schoolId: string, id: string, input: UserUpdateInput): Promise<ManagedUser>;
  setRoles(schoolId: string, id: string, roles: RoleCode[]): Promise<ManagedUser>;
  setOverrides(schoolId: string, id: string, overrides: PermissionOverride[]): Promise<ManagedUser>;
  resetPassword(schoolId: string, id: string): Promise<{ temporaryPassword: string }>;
}

export interface Letterhead extends LetterheadInput {
  imageDataUrl?: string;
  version: number;
}

export interface Branding extends LogoSettingsInput {
  schoolId: string;
  logoDataUrl?: string;
  letterhead: Letterhead;
  updatedAt?: string;
  updatedBy?: string;
}

export interface BrandingHistoryEntry {
  at: string;
  by: string;
  version: number;
  summaryKey: string;
}

export interface ActivityEntry {
  id: string;
  at: string;
  by: string;
  action: string; // مفتاح ترجمة activity.*
  entity?: string;
  schoolId?: string;
}

export interface DashboardStats {
  assets: number;
  stockItems: number;
  buildingsRooms: number;
  facilities: number;
  resources: number;
  activeLoans: number;
  overdueLoans: number;
  openMaintenance: number;
}

export interface DashboardAlert { kind: string; count: number; severity: "high" | "medium" | "info" }

export interface NotificationItem { id: string; at: string; titleKey: string; readAt?: string }

export class ApiError extends Error {
  constructor(public code: string, public details?: Record<string, unknown>) {
    super(code);
  }
}

export interface Api {
  readonly mode: "review" | "server";
  // الإعداد الأول والمصادقة
  needsSetup(): Promise<boolean>;
  setup(input: SetupAdminInput & { setupToken?: string }): Promise<void>;
  /** الخادم فقط: هل يطلب الإعداد الأول رمز SETUP_TOKEN؟ */
  setupTokenRequired?(): Promise<boolean>;
  login(username: string, password: string): Promise<SessionUser>;
  logout(): Promise<void>;
  me(): Promise<SessionUser | null>;
  changePassword(current: string, next: string): Promise<void>;
  // التسلسل الإداري
  listAcademies(): Promise<Academy[]>;
  createAcademy(input: AcademyInput): Promise<Academy>;
  listDirectorates(academyId?: string): Promise<Directorate[]>;
  createDirectorate(input: DirectorateInput): Promise<Directorate>;
  listSchools(params?: { directorateId?: string; q?: string }): Promise<School[]>;
  getSchool(id: string): Promise<School>;
  createSchool(input: SchoolInput): Promise<School>;
  updateSchool(id: string, input: SchoolInput & { schoolYear?: string }): Promise<School>;
  // الهوية البصرية
  getBranding(schoolId: string): Promise<Branding>;
  saveBranding(schoolId: string, input: Omit<Branding, "schoolId" | "updatedAt" | "updatedBy">): Promise<Branding>;
  resetBranding(schoolId: string): Promise<Branding>;
  brandingHistory(schoolId: string): Promise<BrandingHistoryEntry[]>;
  // لوحة القيادة
  dashboardStats(schoolId: string): Promise<DashboardStats>;
  dashboardAlerts(schoolId: string): Promise<DashboardAlert[]>;
  recentActivity(schoolId: string, limit?: number): Promise<ActivityEntry[]>;
  notifications(): Promise<NotificationItem[]>;
  /** متاحة مع الخادم فقط؛ وضع المراجعة لا يدير مستخدمين. */
  readonly users?: UsersApi;
  // المرحلة 4 (الخادم فقط)
  readonly catalog?: CatalogApi;
  readonly assets?: AssetsApi;
  readonly stock?: StockApi;
  readonly suppliers?: SuppliersApi;
  readonly spaces?: SpacesApi;
  readonly staff?: StaffApi;
  readonly resources?: ResourcesApi;
  readonly loans?: LoansApi;
  // المرحلة 6 (الخادم فقط)
  readonly maintenance?: MaintenanceApi;
  readonly custody?: CustodyApi;
  readonly inventory?: InventoryApi;
  readonly purchasing?: PurchasingApi;
  // المرحلة 7 (الخادم فقط)
  readonly reports?: ReportsApi;
  readonly imports?: ImportsApi;
  readonly documents?: DocumentsApi;
  readonly notify?: NotificationsApi;
  readonly audit?: AuditApi;
  readonly floorplan?: FloorPlanApi;
  readonly sync?: SyncApi;
}
