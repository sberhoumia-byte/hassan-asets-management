/**
 * عقود المرحلة 4 (الممتلكات، المخزون، الموردون، القوائم المرجعية) — تطابق API_DESIGN.md 3.6/3.7/3.14.
 * متاحة مع الخادم فقط (نسخة المراجعة المحلية لا تحاكي المخزون).
 */
import type {
  AssetInput,
  CategoryInput,
  LookupValueInput,
  StockAdjustInput,
  StockInInput,
  StockItemInput,
  StockOutInput,
  StockReturnInput,
  StockTransferInput,
  SupplierInput,
  WarehouseInput,
} from "@hassan/validation";

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }

// ---------- التصنيفات والقوائم ----------
export interface Category { id: string; parentId?: string; code: string; nameAr: string; nameFr?: string; isActive: boolean; global?: boolean }
export interface LookupValue { id: string; listKey: string; code: string; labelAr: string; labelFr?: string; sortOrder: number; isActive: boolean; global?: boolean }

export interface CatalogApi {
  categories(schoolId: string): Promise<Category[]>;
  createCategory(schoolId: string, input: CategoryInput): Promise<Category>;
  updateCategory(schoolId: string, id: string, input: CategoryInput): Promise<Category>;
  lookups(schoolId: string, listKey?: string, all?: boolean): Promise<LookupValue[]>;
  createLookup(schoolId: string, listKey: string, input: LookupValueInput): Promise<LookupValue>;
  updateLookup(schoolId: string, id: string, input: LookupValueInput): Promise<LookupValue>;
  numbering(schoolId: string): Promise<{ inventoryNumberPattern: string }>;
  setNumbering(schoolId: string, pattern: string): Promise<{ inventoryNumberPattern: string }>;
}

// ---------- الممتلكات ----------
export type AssetStatus = "AVAILABLE" | "DAMAGED" | "UNDER_REPAIR" | "DISPOSED";
export interface Asset {
  id: string;
  inventoryNumber: string;
  name: string;
  categoryId: string;
  category?: { id: string; code: string; nameAr: string; nameFr?: string | null };
  assetTypeId?: string;
  description?: string;
  trackingMode: "INDIVIDUAL" | "QUANTITY";
  quantity: number;
  serialNumber?: string;
  acquisitionDate?: string;
  fundingSourceId?: string;
  acquisitionValue?: number | null;
  supplierId?: string;
  supplier?: { id: string; name: string } | null;
  status: AssetStatus;
  qrToken: string;
  hasPhoto: boolean;
  photoDataUrl?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface AssetHistoryEntry {
  at: string;
  by: string;
  action: string;
  reason?: string;
  changes?: { field: string; from: unknown; to: unknown }[];
}
export interface AssetQuery { q?: string; categoryId?: string; status?: string; archived?: boolean; page?: number; pageSize?: number }

export interface AssetsApi {
  list(schoolId: string, q: AssetQuery): Promise<Paged<Asset>>;
  get(schoolId: string, id: string): Promise<Asset>;
  create(schoolId: string, input: AssetInput): Promise<Asset>;
  update(schoolId: string, id: string, input: AssetInput): Promise<Asset>;
  archive(schoolId: string, id: string, reason: string): Promise<Asset>;
  history(schoolId: string, id: string): Promise<AssetHistoryEntry[]>;
  scan(qrToken: string): Promise<{ kind: "asset"; id: string; schoolId: string }>;
}

// ---------- المخزون ----------
export interface Warehouse { id: string; code: string; name: string; isActive: boolean }
export type StockLevel = "ok" | "low" | "out";
export interface StockItem {
  id: string;
  code: string;
  name: string;
  categoryId?: string;
  unitId: string;
  unitAr?: string;
  unitFr?: string;
  minQuantity: number;
  tracksExpiry: boolean;
  defaultSupplierId?: string;
  notes?: string;
  isActive: boolean;
  total: number;
  balances: { warehouseId: string; quantity: number }[];
  level: StockLevel;
}
export type MovementType = "OPENING" | "IN" | "OUT" | "TRANSFER_OUT" | "TRANSFER_IN" | "RETURN" | "ADJUSTMENT" | "REVERSAL";
export interface StockMovement {
  id: string;
  number: string;
  type: MovementType;
  direction: 1 | -1;
  itemId: string;
  item: { code: string; name: string };
  warehouseId: string;
  warehouse: { code: string; name: string };
  quantity: number;
  unitCost?: number;
  expiryDate?: string;
  supplier?: string;
  reason?: string;
  occurredAt: string;
  by?: string;
  reversedBy?: string;
  reverses?: string;
  transferGroupId?: string;
}
export interface MovementQuery { itemId?: string; warehouseId?: string; type?: string; from?: string; to?: string; page?: number; pageSize?: number }
export interface StockAlerts {
  out: { id: string; code: string; name: string; total: number; minQuantity: number }[];
  low: { id: string; code: string; name: string; total: number; minQuantity: number }[];
  expiring: { movement: string; itemId: string; code: string; name: string; warehouse: string; expiryDate: string; quantity: number; expired: boolean }[];
}
export interface MovementResult { replayed: boolean; movements: string[] }

export interface StockApi {
  warehouses(schoolId: string): Promise<Warehouse[]>;
  createWarehouse(schoolId: string, input: WarehouseInput): Promise<Warehouse>;
  updateWarehouse(schoolId: string, id: string, input: WarehouseInput): Promise<Warehouse>;
  items(schoolId: string, q?: { q?: string; alert?: string; all?: boolean }): Promise<StockItem[]>;
  createItem(schoolId: string, input: StockItemInput): Promise<{ id: string }>;
  updateItem(schoolId: string, id: string, input: StockItemInput): Promise<{ id: string }>;
  movements(schoolId: string, q: MovementQuery): Promise<Paged<StockMovement>>;
  stockIn(schoolId: string, input: StockInInput): Promise<MovementResult>;
  stockOut(schoolId: string, input: StockOutInput): Promise<MovementResult>;
  stockReturn(schoolId: string, input: StockReturnInput): Promise<MovementResult>;
  transfer(schoolId: string, input: StockTransferInput): Promise<MovementResult>;
  adjust(schoolId: string, input: StockAdjustInput): Promise<MovementResult>;
  reverse(schoolId: string, id: string, reason: string): Promise<MovementResult>;
  alerts(schoolId: string): Promise<StockAlerts>;
}

// ---------- الموردون ----------
export interface Supplier {
  id: string;
  name: string;
  activityId?: string;
  phone?: string;
  email?: string;
  address?: string;
  ice?: string;
  notes?: string;
  archivedAt?: string;
  usage: { assets: number; movements: number; stockItems: number };
}
export interface SuppliersApi {
  list(schoolId: string, q?: { q?: string; archived?: boolean }): Promise<Supplier[]>;
  create(schoolId: string, input: SupplierInput): Promise<{ id: string }>;
  update(schoolId: string, id: string, input: SupplierInput): Promise<{ id: string }>;
  archive(schoolId: string, id: string): Promise<unknown>;
  restore(schoolId: string, id: string): Promise<unknown>;
}
