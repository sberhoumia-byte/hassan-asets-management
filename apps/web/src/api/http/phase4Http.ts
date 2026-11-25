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
    return this.h.request<{ kind: "asset"; id: string; schoolId: string }>("GET", `/scan/${encodeURIComponent(token)}`);
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
