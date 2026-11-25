/** عقود المرحلة 8: الإشعارات وتفضيلاتها، سجل التدقيق. الخادم فقط. */
import type { Paged } from "./phase4";

export type NotificationType =
  | "STOCK_OUT"
  | "STOCK_LOW"
  | "STOCK_EXPIRY"
  | "LOAN_OVERDUE"
  | "MAINTENANCE_URGENT"
  | "MAINTENANCE_DUE"
  | "APPROVAL_REQUEST"
  | "INVENTORY_SESSION"
  | "DOCUMENT_EXPIRY";

export interface AppNotification {
  id: string;
  at: string;
  type: NotificationType;
  titleKey: string;
  vars: Record<string, string | number>;
  schoolId: string;
  entityType?: string;
  entityId?: string;
  readAt?: string;
}

export interface NotificationsApi {
  list(unreadOnly?: boolean): Promise<{ unread: number; items: AppNotification[] }>;
  read(id: string): Promise<unknown>;
  readAll(): Promise<unknown>;
  preferences(): Promise<{ type: NotificationType; enabled: boolean }[]>;
  setPreferences(items: { type: NotificationType; enabled: boolean }[]): Promise<{ type: NotificationType; enabled: boolean }[]>;
  runNow(sid: string): Promise<{ created: number; active: number }>;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId?: string;
  user?: string;
  userId?: string;
  ip?: string;
  requestId?: string;
  before?: unknown;
  after?: unknown;
}
export interface AuditQuery {
  userId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}
export interface AuditApi {
  list(sid: string, q: AuditQuery): Promise<Paged<AuditEntry>>;
  facets(sid: string): Promise<{ actions: string[]; entityTypes: string[]; users: { id: string; name: string }[] }>;
}

/** مسار الشاشة المرتبطة بإشعار. */
export function notificationLink(n: Pick<AppNotification, "entityType" | "entityId">): string | null {
  switch (n.entityType) {
    case "InventoryItem":
      return "/stock?tab=alerts";
    case "ResourceLoan":
      return "/loans";
    case "MaintenanceRequest":
      return "/maintenance";
    case "MaintenanceSchedule":
      return "/maintenance?tab=schedules";
    case "PurchaseOrder":
      return n.entityId ? `/purchasing/${n.entityId}` : "/purchasing";
    case "InventorySession":
      return n.entityId ? `/inventory/${n.entityId}` : "/inventory";
    case "Document":
      return "/documents";
    default:
      return null;
  }
}

// ---------------- المخطط التفاعلي ----------------
export type ShapeKind = "RECTANGLE" | "POLYGON" | "CIRCLE" | "MARKER";
export type ShapeLevel = "GOOD" | "WARN" | "BAD" | "NONE";
export type ShapeGeometry = { x: number; y: number; w: number; h: number } | { x: number; y: number; r: number } | { points: number[] } | { x: number; y: number };
export interface ShapeStatus {
  level: ShapeLevel;
  targetCode?: string;
  targetName?: string;
  spaceStatus?: string;
  openMaintenance: number;
  assets: number;
  damagedAssets: number;
}
export interface FloorPlanShape {
  id?: string;
  kind: ShapeKind;
  geometry: ShapeGeometry;
  label?: string;
  roomId?: string;
  facilityId?: string;
  status?: ShapeStatus;
}
export interface FloorPlanSummary { id: string; name: string; hasBackground: boolean; widthPx: number; heightPx: number; shapeCount: number; updatedAt: string }
export interface FloorPlanDetail extends FloorPlanSummary { shapes: FloorPlanShape[] }
export interface FloorPlanApi {
  list(sid: string): Promise<FloorPlanSummary[]>;
  get(sid: string, id: string): Promise<FloorPlanDetail>;
  /** background: data URL لصورة، "" لإزالتها، undefined لإبقائها */
  create(sid: string, i: { name: string; background?: string }): Promise<FloorPlanDetail>;
  update(sid: string, id: string, i: { name: string; background?: string }): Promise<FloorPlanDetail>;
  saveShapes(sid: string, id: string, shapes: FloorPlanShape[]): Promise<FloorPlanDetail>;
  remove(sid: string, id: string): Promise<unknown>;
  background(sid: string, id: string): Promise<Blob>;
}

// ---------------- المزامنة دون اتصال ----------------
export type SyncOperation = "stock.in" | "stock.out" | "inventory.count";
export type SyncStatus = "APPLIED" | "CONFLICT" | "REJECTED" | "RECEIVED";
export interface SyncResult { clientOpId: string; status: SyncStatus; error?: string; details?: unknown; resultRef?: string; replayed?: boolean }
export interface SyncHistoryRow { clientOpId: string; operation: SyncOperation; status: SyncStatus; error?: string; deviceId: string; clientCreatedAt: string; receivedAt: string; appliedAt?: string }
export interface SyncApi {
  push(sid: string, deviceId: string, operations: { clientOpId: string; operation: SyncOperation; payload: Record<string, unknown>; clientCreatedAt: string }[]): Promise<{ results: SyncResult[] }>;
  history(sid: string): Promise<SyncHistoryRow[]>;
}
