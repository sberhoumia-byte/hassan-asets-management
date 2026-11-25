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
} from "@hassan/validation";

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
  setup(input: SetupAdminInput): Promise<void>;
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
}
