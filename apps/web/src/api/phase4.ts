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
  roomId?: string;
  room?: string;
  facilityId?: string;
  facility?: string;
  responsibleStaffId?: string;
  responsible?: string;
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
export interface AssetQuery { q?: string; categoryId?: string; status?: string; archived?: boolean; roomId?: string; responsibleStaffId?: string; page?: number; pageSize?: number }

export interface AssetsApi {
  list(schoolId: string, q: AssetQuery): Promise<Paged<Asset>>;
  get(schoolId: string, id: string): Promise<Asset>;
  create(schoolId: string, input: AssetInput): Promise<Asset>;
  update(schoolId: string, id: string, input: AssetInput): Promise<Asset>;
  archive(schoolId: string, id: string, reason: string): Promise<Asset>;
  history(schoolId: string, id: string): Promise<AssetHistoryEntry[]>;
  scan(qrToken: string): Promise<{ kind: "asset" | "resourceUnit"; id: string; unitId?: string; schoolId: string }>;
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

// =====================================================================
// المرحلة 5: الفضاءات والملاعب، الموظفون، الوسائل التعليمية، الإعارة
// =====================================================================
import type {
  BuildingInput,
  FacilityInput,
  LoanInput,
  LoanReturnInput,
  ResourceInput,
  ResourceUnitInput,
  RoomInput,
  StaffInput,
} from "@hassan/validation";

export type SpaceStatus = "GOOD" | "NEEDS_MAINTENANCE" | "OUT_OF_SERVICE";
export interface Building { id: string; code: string; name: string; floors?: number; builtYear?: number; status: SpaceStatus; notes?: string; archivedAt?: string; rooms: number }
export interface Room {
  id: string;
  code: string;
  name: string;
  buildingId?: string;
  building?: string;
  spaceTypeId: string;
  floor?: string;
  locationNote?: string;
  areaM2?: number;
  capacity?: number;
  status: SpaceStatus;
  archivedAt?: string;
  counts: { assets: number; resourceUnits: number; facilities: number };
}
export interface RoomContents {
  assets: { id: string; inventoryNumber: string; name: string; status: AssetStatus; quantity: number }[];
  resourceUnits: { id: string; inventoryNumber: string; status: UnitStatus; resourceId: string; resource: string }[];
  resources: { id: string; code: string; name: string; quantityTotal: number }[];
  facilities: { id: string; code: string; name: string; status: SpaceStatus }[];
}
export interface Facility {
  id: string;
  code: string;
  name: string;
  facilityTypeId: string;
  roomId?: string;
  room?: string;
  surfaceCondition?: string;
  netsGoalsCondition?: string;
  status: SpaceStatus;
  notes?: string;
  archivedAt?: string;
  equipment: number;
}
export interface SpacesApi {
  buildings(schoolId: string, archived?: boolean): Promise<Building[]>;
  createBuilding(schoolId: string, i: BuildingInput): Promise<{ id: string }>;
  updateBuilding(schoolId: string, id: string, i: BuildingInput): Promise<{ id: string }>;
  setBuildingArchived(schoolId: string, id: string, archived: boolean): Promise<unknown>;
  rooms(schoolId: string, q?: { q?: string; buildingId?: string; spaceTypeId?: string; status?: string; archived?: boolean }): Promise<Room[]>;
  roomContents(schoolId: string, id: string): Promise<RoomContents>;
  createRoom(schoolId: string, i: RoomInput): Promise<{ id: string }>;
  updateRoom(schoolId: string, id: string, i: RoomInput): Promise<{ id: string }>;
  setRoomArchived(schoolId: string, id: string, archived: boolean): Promise<unknown>;
  facilities(schoolId: string, archived?: boolean): Promise<Facility[]>;
  facilityEquipment(schoolId: string, id: string): Promise<RoomContents["assets"]>;
  createFacility(schoolId: string, i: FacilityInput): Promise<{ id: string }>;
  updateFacility(schoolId: string, id: string, i: FacilityInput): Promise<{ id: string }>;
  setFacilityArchived(schoolId: string, id: string, archived: boolean): Promise<unknown>;
}

export type StaffType = "TEACHER" | "ADMINISTRATIVE" | "SUPPORT" | "OTHER";
export interface Staff { id: string; fullNameAr: string; fullNameFr?: string; type: StaffType; staffNumber?: string; phone?: string; email?: string; isActive: boolean; activeLoans: number; assets: number }
export interface StaffApi {
  list(schoolId: string, q?: { q?: string; all?: boolean }): Promise<Staff[]>;
  create(schoolId: string, i: StaffInput): Promise<{ id: string }>;
  update(schoolId: string, id: string, i: StaffInput): Promise<{ id: string }>;
}

export type UnitStatus = "AVAILABLE" | "ON_LOAN" | "DAMAGED" | "UNDER_MAINTENANCE" | "DISPOSED";
export interface ResourceSummary {
  id: string;
  code: string;
  name: string;
  resourceTypeId?: string;
  categoryId?: string;
  trackingMode: "INDIVIDUAL" | "QUANTITY";
  roomId?: string;
  room?: string;
  acquisitionDate?: string;
  isLendable: boolean;
  hasPhoto: boolean;
  archivedAt?: string;
  total: number;
  available: number;
  onLoan: number;
  damaged: number;
  maintenance: number;
}
export interface ResourceUnit {
  id: string;
  inventoryNumber: string;
  serialNumber?: string;
  status: UnitStatus;
  roomId?: string;
  room?: string;
  qrToken: string;
  loan?: { id: string; number: string; borrower: string; dueAt: string };
}
export interface ResourceDetail extends ResourceSummary { photoDataUrl?: string; units: ResourceUnit[] }
export interface ResourcesApi {
  list(schoolId: string, q?: { q?: string; resourceTypeId?: string; archived?: boolean; lendable?: boolean }): Promise<ResourceSummary[]>;
  get(schoolId: string, id: string): Promise<ResourceDetail>;
  create(schoolId: string, i: ResourceInput): Promise<{ id: string }>;
  update(schoolId: string, id: string, i: ResourceInput): Promise<{ id: string }>;
  setDamaged(schoolId: string, id: string, quantityDamaged: number, reason: string): Promise<unknown>;
  setArchived(schoolId: string, id: string, archived: boolean): Promise<unknown>;
  addUnit(schoolId: string, id: string, i: ResourceUnitInput): Promise<{ id: string; inventoryNumber: string }>;
  updateUnit(schoolId: string, id: string, unitId: string, i: ResourceUnitInput): Promise<{ id: string }>;
}

export type LoanStatus = "ACTIVE" | "PARTIALLY_RETURNED" | "RETURNED" | "CANCELLED";
export interface LoanReturn { id: string; quantity: number; returnedAt: string; conditionIn?: string; damaged: boolean; notes?: string; receivedBy?: string }
export interface Loan {
  id: string;
  number: string;
  resourceId: string;
  resource: { code: string; name: string; trackingMode: "INDIVIDUAL" | "QUANTITY" };
  unitId?: string;
  unit?: string;
  quantity: number;
  returnedQuantity: number;
  outstanding: number;
  borrowerStaffId: string;
  borrower: string;
  borrowerFr?: string;
  loanedAt: string;
  dueAt: string;
  conditionOut?: string;
  status: LoanStatus;
  notes?: string;
  overdue: boolean;
  lateDays: number;
  handedOverBy?: string;
  returns: LoanReturn[];
}
export interface LoanQuery { status?: string; overdue?: boolean; borrowerId?: string; resourceId?: string; q?: string; page?: number; pageSize?: number }
export interface LoansApi {
  list(schoolId: string, q: LoanQuery): Promise<Paged<Loan>>;
  get(schoolId: string, id: string): Promise<Loan>;
  create(schoolId: string, i: LoanInput): Promise<{ id: string; number: string; replayed: boolean }>;
  returnLoan(schoolId: string, id: string, i: LoanReturnInput): Promise<{ id: string; replayed: boolean }>;
}
