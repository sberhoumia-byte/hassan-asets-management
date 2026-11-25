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
  BuildingInput,
  FacilityInput,
  LoanInput,
  LoanReturnInput,
  ResourceInput,
  ResourceUnitInput,
  RoomInput,
  StaffInput,
} from "@hassan/validation";
import type {
  Asset,
  AssetHistoryEntry,
  AssetQuery,
  AssetsApi,
  CatalogApi,
  Category,
  LookupValue,
  MovementQuery,
  MovementResult,
  Paged,
  StockAlerts,
  StockApi,
  StockItem,
  StockMovement,
  Supplier,
  SuppliersApi,
  Warehouse,
  Building,
  Facility,
  Loan,
  LoanQuery,
  LoansApi,
  ResourceDetail,
  ResourceSummary,
  ResourcesApi,
  Room,
  RoomContents,
  SpacesApi,
  Staff,
  StaffApi,
} from "../phase4";
import type { HttpApi } from "./httpApi";

const s = (schoolId: string) => `/schools/${schoolId}`;

export class HttpCatalogApi implements CatalogApi {
  constructor(private h: HttpApi) {}
  categories(sid: string) {
    return this.h.request<Category[]>("GET", `${s(sid)}/categories`);
  }
  createCategory(sid: string, input: CategoryInput) {
    return this.h.request<Category>("POST", `${s(sid)}/categories`, { body: input });
  }
  updateCategory(sid: string, id: string, input: CategoryInput) {
    return this.h.request<Category>("PUT", `${s(sid)}/categories/${id}`, { body: input });
  }
  lookups(sid: string, listKey?: string, all = false) {
    return this.h.request<LookupValue[]>("GET", `${s(sid)}/lookups`, { query: { listKey, all: all ? 1 : undefined } });
  }
  createLookup(sid: string, listKey: string, input: LookupValueInput) {
    return this.h.request<LookupValue>("POST", `${s(sid)}/lookups/${listKey}`, { body: input });
  }
  updateLookup(sid: string, id: string, input: LookupValueInput) {
    return this.h.request<LookupValue>("PUT", `${s(sid)}/lookups/value/${id}`, { body: input });
  }
  numbering(sid: string) {
    return this.h.request<{ inventoryNumberPattern: string }>("GET", `${s(sid)}/settings/numbering`);
  }
  setNumbering(sid: string, inventoryNumberPattern: string) {
    return this.h.request<{ inventoryNumberPattern: string }>("PUT", `${s(sid)}/settings/numbering`, { body: { inventoryNumberPattern } });
  }
}

export class HttpAssetsApi implements AssetsApi {
  constructor(private h: HttpApi) {}
  list(sid: string, q: AssetQuery) {
    return this.h.request<Paged<Asset>>("GET", `${s(sid)}/assets`, {
      query: { q: q.q, categoryId: q.categoryId, status: q.status, archived: q.archived ? 1 : undefined, page: q.page, pageSize: q.pageSize },
    });
  }
  get(sid: string, id: string) {
    return this.h.request<Asset>("GET", `${s(sid)}/assets/${id}`);
  }
  create(sid: string, input: AssetInput) {
    return this.h.request<Asset>("POST", `${s(sid)}/assets`, { body: input });
  }
  update(sid: string, id: string, input: AssetInput) {
    return this.h.request<Asset>("PUT", `${s(sid)}/assets/${id}`, { body: input });
  }
  archive(sid: string, id: string, reason: string) {
    return this.h.request<Asset>("POST", `${s(sid)}/assets/${id}/archive`, { body: { reason } });
  }
  history(sid: string, id: string) {
    return this.h.request<AssetHistoryEntry[]>("GET", `${s(sid)}/assets/${id}/history`);
  }
  scan(token: string) {
    return this.h.request<{ kind: "asset" | "resourceUnit"; id: string; unitId?: string; schoolId: string }>("GET", `/scan/${encodeURIComponent(token)}`);
  }
}

export class HttpStockApi implements StockApi {
  constructor(private h: HttpApi) {}
  warehouses(sid: string) {
    return this.h.request<Warehouse[]>("GET", `${s(sid)}/warehouses`);
  }
  createWarehouse(sid: string, input: WarehouseInput) {
    return this.h.request<Warehouse>("POST", `${s(sid)}/warehouses`, { body: input });
  }
  updateWarehouse(sid: string, id: string, input: WarehouseInput) {
    return this.h.request<Warehouse>("PUT", `${s(sid)}/warehouses/${id}`, { body: input });
  }
  items(sid: string, q: { q?: string; alert?: string; all?: boolean } = {}) {
    return this.h.request<StockItem[]>("GET", `${s(sid)}/stock/items`, { query: { q: q.q, alert: q.alert, all: q.all ? 1 : undefined } });
  }
  createItem(sid: string, input: StockItemInput) {
    return this.h.request<{ id: string }>("POST", `${s(sid)}/stock/items`, { body: input });
  }
  updateItem(sid: string, id: string, input: StockItemInput) {
    return this.h.request<{ id: string }>("PUT", `${s(sid)}/stock/items/${id}`, { body: input });
  }
  movements(sid: string, q: MovementQuery) {
    return this.h.request<Paged<StockMovement>>("GET", `${s(sid)}/stock/movements`, { query: { ...q } });
  }
  private mv(sid: string, path: string, body: unknown) {
    return this.h.request<MovementResult>("POST", `${s(sid)}/stock/movements/${path}`, { body });
  }
  stockIn(sid: string, input: StockInInput) {
    return this.mv(sid, "in", input);
  }
  stockOut(sid: string, input: StockOutInput) {
    return this.mv(sid, "out", input);
  }
  stockReturn(sid: string, input: StockReturnInput) {
    return this.mv(sid, "return", input);
  }
  transfer(sid: string, input: StockTransferInput) {
    return this.mv(sid, "transfer", input);
  }
  adjust(sid: string, input: StockAdjustInput) {
    return this.mv(sid, "adjust", input);
  }
  reverse(sid: string, id: string, reason: string) {
    return this.mv(sid, `${id}/reverse`, { reason });
  }
  alerts(sid: string) {
    return this.h.request<StockAlerts>("GET", `${s(sid)}/stock/alerts`);
  }
}

export class HttpSuppliersApi implements SuppliersApi {
  constructor(private h: HttpApi) {}
  list(sid: string, q: { q?: string; archived?: boolean } = {}) {
    return this.h.request<Supplier[]>("GET", `${s(sid)}/suppliers`, { query: { q: q.q, archived: q.archived ? 1 : undefined } });
  }
  create(sid: string, input: SupplierInput) {
    return this.h.request<{ id: string }>("POST", `${s(sid)}/suppliers`, { body: input });
  }
  update(sid: string, id: string, input: SupplierInput) {
    return this.h.request<{ id: string }>("PUT", `${s(sid)}/suppliers/${id}`, { body: input });
  }
  archive(sid: string, id: string) {
    return this.h.request("POST", `${s(sid)}/suppliers/${id}/archive`);
  }
  restore(sid: string, id: string) {
    return this.h.request("POST", `${s(sid)}/suppliers/${id}/restore`);
  }
}

const flag = (b?: boolean) => (b ? 1 : undefined);

export class HttpSpacesApi implements SpacesApi {
  constructor(private h: HttpApi) {}
  buildings(sid: string, archived?: boolean) {
    return this.h.request<Building[]>("GET", `${s(sid)}/buildings`, { query: { archived: flag(archived) } });
  }
  createBuilding(sid: string, i: BuildingInput) {
    return this.h.request<{ id: string }>("POST", `${s(sid)}/buildings`, { body: i });
  }
  updateBuilding(sid: string, id: string, i: BuildingInput) {
    return this.h.request<{ id: string }>("PUT", `${s(sid)}/buildings/${id}`, { body: i });
  }
  setBuildingArchived(sid: string, id: string, archived: boolean) {
    return this.h.request("POST", `${s(sid)}/buildings/${id}/${archived ? "archive" : "restore"}`);
  }
  rooms(sid: string, q: { q?: string; buildingId?: string; spaceTypeId?: string; status?: string; archived?: boolean } = {}) {
    return this.h.request<Room[]>("GET", `${s(sid)}/rooms`, { query: { ...q, archived: flag(q.archived) } });
  }
  roomContents(sid: string, id: string) {
    return this.h.request<RoomContents>("GET", `${s(sid)}/rooms/${id}/contents`);
  }
  createRoom(sid: string, i: RoomInput) {
    return this.h.request<{ id: string }>("POST", `${s(sid)}/rooms`, { body: i });
  }
  updateRoom(sid: string, id: string, i: RoomInput) {
    return this.h.request<{ id: string }>("PUT", `${s(sid)}/rooms/${id}`, { body: i });
  }
  setRoomArchived(sid: string, id: string, archived: boolean) {
    return this.h.request("POST", `${s(sid)}/rooms/${id}/${archived ? "archive" : "restore"}`);
  }
  facilities(sid: string, archived?: boolean) {
    return this.h.request<Facility[]>("GET", `${s(sid)}/facilities`, { query: { archived: flag(archived) } });
  }
  facilityEquipment(sid: string, id: string) {
    return this.h.request<RoomContents["assets"]>("GET", `${s(sid)}/facilities/${id}/equipment`);
  }
  createFacility(sid: string, i: FacilityInput) {
    return this.h.request<{ id: string }>("POST", `${s(sid)}/facilities`, { body: i });
  }
  updateFacility(sid: string, id: string, i: FacilityInput) {
    return this.h.request<{ id: string }>("PUT", `${s(sid)}/facilities/${id}`, { body: i });
  }
  setFacilityArchived(sid: string, id: string, archived: boolean) {
    return this.h.request("POST", `${s(sid)}/facilities/${id}/${archived ? "archive" : "restore"}`);
  }
}

export class HttpStaffApi implements StaffApi {
  constructor(private h: HttpApi) {}
  list(sid: string, q: { q?: string; all?: boolean } = {}) {
    return this.h.request<Staff[]>("GET", `${s(sid)}/staff`, { query: { q: q.q, all: flag(q.all) } });
  }
  create(sid: string, i: StaffInput) {
    return this.h.request<{ id: string }>("POST", `${s(sid)}/staff`, { body: i });
  }
  update(sid: string, id: string, i: StaffInput) {
    return this.h.request<{ id: string }>("PUT", `${s(sid)}/staff/${id}`, { body: i });
  }
}

export class HttpResourcesApi implements ResourcesApi {
  constructor(private h: HttpApi) {}
  list(sid: string, q: { q?: string; resourceTypeId?: string; archived?: boolean; lendable?: boolean } = {}) {
    return this.h.request<ResourceSummary[]>("GET", `${s(sid)}/resources`, {
      query: { q: q.q, resourceTypeId: q.resourceTypeId, archived: flag(q.archived), lendable: flag(q.lendable) },
    });
  }
  get(sid: string, id: string) {
    return this.h.request<ResourceDetail>("GET", `${s(sid)}/resources/${id}`);
  }
  create(sid: string, i: ResourceInput) {
    return this.h.request<{ id: string }>("POST", `${s(sid)}/resources`, { body: i });
  }
  update(sid: string, id: string, i: ResourceInput) {
    return this.h.request<{ id: string }>("PUT", `${s(sid)}/resources/${id}`, { body: i });
  }
  setDamaged(sid: string, id: string, quantityDamaged: number, reason: string) {
    return this.h.request("POST", `${s(sid)}/resources/${id}/damaged`, { body: { quantityDamaged, reason } });
  }
  setArchived(sid: string, id: string, archived: boolean) {
    return this.h.request("POST", `${s(sid)}/resources/${id}/${archived ? "archive" : "restore"}`);
  }
  addUnit(sid: string, id: string, i: ResourceUnitInput) {
    return this.h.request<{ id: string; inventoryNumber: string }>("POST", `${s(sid)}/resources/${id}/units`, { body: i });
  }
  updateUnit(sid: string, id: string, unitId: string, i: ResourceUnitInput) {
    return this.h.request<{ id: string }>("PUT", `${s(sid)}/resources/${id}/units/${unitId}`, { body: i });
  }
}

export class HttpLoansApi implements LoansApi {
  constructor(private h: HttpApi) {}
  list(sid: string, q: LoanQuery) {
    return this.h.request<Paged<Loan>>("GET", `${s(sid)}/loans`, { query: { ...q, overdue: flag(q.overdue) } });
  }
  get(sid: string, id: string) {
    return this.h.request<Loan>("GET", `${s(sid)}/loans/${id}`);
  }
  create(sid: string, i: LoanInput) {
    return this.h.request<{ id: string; number: string; replayed: boolean }>("POST", `${s(sid)}/loans`, { body: i });
  }
  returnLoan(sid: string, id: string, i: LoanReturnInput) {
    return this.h.request<{ id: string; replayed: boolean }>("POST", `${s(sid)}/loans/${id}/returns`, { body: i });
  }
}
