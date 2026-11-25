import type {
  ApprovalWorkflowInput,
  CustodyInput,
  DeliveryInput,
  InventoryCountInput,
  InventorySessionInput,
  InvoiceInput,
  MaintenanceRecordInput,
  MaintenanceRequestInput,
  MaintenanceScheduleInput,
  MaintenanceTransitionInput,
  PostDeliveryInput,
  PurchaseOrderInput,
} from "@hassan/validation";
import type { Paged } from "../phase4";
import type {
  ApprovalWorkflow,
  CustodyApi,
  CustodyQuery,
  CustodyRecord,
  Discrepancies,
  InventoryApi,
  InventoryLine,
  InventoryMove,
  InventorySession,
  InventoryStatus,
  MaintenanceApi,
  MaintenanceQuery,
  MaintenanceRequest,
  MaintenanceSchedule,
  MaintenanceStatus,
  PoStatus,
  PurchaseOrder,
  PurchasingApi,
} from "../phase6";
import type { HttpApi } from "./httpApi";

const s = (schoolId: string) => `/schools/${schoolId}`;
type St<T> = { id: string; status: T };

export class HttpMaintenanceApi implements MaintenanceApi {
  constructor(private h: HttpApi) {}
  list(sid: string, q: MaintenanceQuery) {
    return this.h.request<Paged<MaintenanceRequest>>("GET", `${s(sid)}/maintenance/requests`, { query: { ...q, open: q.open ? 1 : undefined } });
  }
  get(sid: string, id: string) {
    return this.h.request<MaintenanceRequest>("GET", `${s(sid)}/maintenance/requests/${id}`);
  }
  assignees(sid: string) {
    return this.h.request<{ id: string; fullNameAr: string }[]>("GET", `${s(sid)}/maintenance/assignees`);
  }
  create(sid: string, i: MaintenanceRequestInput) {
    return this.h.request<{ id: string; number: string; replayed: boolean }>("POST", `${s(sid)}/maintenance/requests`, { body: i });
  }
  update(sid: string, id: string, i: Pick<MaintenanceRequestInput, "damageTypeId" | "description" | "urgency" | "assigneeId">) {
    return this.h.request<{ id: string }>("PUT", `${s(sid)}/maintenance/requests/${id}`, { body: i });
  }
  transition(sid: string, id: string, i: MaintenanceTransitionInput) {
    return this.h.request<St<MaintenanceStatus>>("POST", `${s(sid)}/maintenance/requests/${id}/transition`, { body: i });
  }
  addRecord(sid: string, id: string, i: MaintenanceRecordInput) {
    return this.h.request<{ id: string }>("POST", `${s(sid)}/maintenance/requests/${id}/records`, { body: i });
  }
  schedules(sid: string) {
    return this.h.request<MaintenanceSchedule[]>("GET", `${s(sid)}/maintenance/schedules`);
  }
  saveSchedule(sid: string, id: string | null, i: MaintenanceScheduleInput) {
    return id ? this.h.request<{ id: string }>("PUT", `${s(sid)}/maintenance/schedules/${id}`, { body: i }) : this.h.request<{ id: string }>("POST", `${s(sid)}/maintenance/schedules`, { body: i });
  }
  generate(sid: string, id: string) {
    return this.h.request<{ id: string; number: string }>("POST", `${s(sid)}/maintenance/schedules/${id}/generate`);
  }
}

export class HttpCustodyApi implements CustodyApi {
  constructor(private h: HttpApi) {}
  list(sid: string, q: CustodyQuery) {
    return this.h.request<Paged<CustodyRecord>>("GET", `${s(sid)}/custody`, { query: { ...q } });
  }
  get(sid: string, id: string) {
    return this.h.request<CustodyRecord>("GET", `${s(sid)}/custody/${id}`);
  }
  create(sid: string, i: CustodyInput) {
    return this.h.request<{ id: string; number: string; replayed: boolean }>("POST", `${s(sid)}/custody`, { body: i });
  }
}

export class HttpInventoryApi implements InventoryApi {
  constructor(private h: HttpApi) {}
  list(sid: string) {
    return this.h.request<InventorySession[]>("GET", `${s(sid)}/inventory-sessions`);
  }
  assignable(sid: string) {
    return this.h.request<{ id: string; fullNameAr: string }[]>("GET", `${s(sid)}/inventory-sessions/assignable-users`);
  }
  get(sid: string, id: string) {
    return this.h.request<InventorySession>("GET", `${s(sid)}/inventory-sessions/${id}`);
  }
  lines(sid: string, id: string, f: { roomId?: string; filter?: string; q?: string } = {}) {
    return this.h.request<InventoryLine[]>("GET", `${s(sid)}/inventory-sessions/${id}/lines`, { query: { ...f } });
  }
  discrepancies(sid: string, id: string) {
    return this.h.request<Discrepancies>("GET", `${s(sid)}/inventory-sessions/${id}/discrepancies`);
  }
  create(sid: string, i: InventorySessionInput) {
    return this.h.request<{ id: string; number: string }>("POST", `${s(sid)}/inventory-sessions`, { body: i });
  }
  update(sid: string, id: string, i: InventorySessionInput) {
    return this.h.request<{ id: string }>("PUT", `${s(sid)}/inventory-sessions/${id}`, { body: i });
  }
  move(sid: string, id: string, m: InventoryMove) {
    return this.h.request<St<InventoryStatus>>("POST", `${s(sid)}/inventory-sessions/${id}/${m}`);
  }
  count(sid: string, id: string, i: InventoryCountInput) {
    return this.h.request<{ lineId: string; replayed: boolean; unexpected?: boolean }>("POST", `${s(sid)}/inventory-sessions/${id}/counts`, { body: i });
  }
  validate(sid: string, id: string, reportNotes: string) {
    return this.h.request<St<InventoryStatus>>("POST", `${s(sid)}/inventory-sessions/${id}/validate`, { body: { reportNotes } });
  }
}

export class HttpPurchasingApi implements PurchasingApi {
  constructor(private h: HttpApi) {}
  workflows(sid: string) {
    return this.h.request<ApprovalWorkflow[]>("GET", `${s(sid)}/approval-workflows`);
  }
  saveWorkflow(sid: string, id: string | null, i: ApprovalWorkflowInput) {
    return id ? this.h.request<{ id: string }>("PUT", `${s(sid)}/approval-workflows/${id}`, { body: i }) : this.h.request<{ id: string }>("POST", `${s(sid)}/approval-workflows`, { body: i });
  }
  list(sid: string, q: { q?: string; status?: string; page?: number; pageSize?: number }) {
    return this.h.request<Paged<PurchaseOrder>>("GET", `${s(sid)}/purchase-orders`, { query: { ...q } });
  }
  get(sid: string, id: string) {
    return this.h.request<PurchaseOrder>("GET", `${s(sid)}/purchase-orders/${id}`);
  }
  create(sid: string, i: PurchaseOrderInput) {
    return this.h.request<{ id: string; number: string }>("POST", `${s(sid)}/purchase-orders`, { body: i });
  }
  update(sid: string, id: string, i: PurchaseOrderInput) {
    return this.h.request<{ id: string }>("PUT", `${s(sid)}/purchase-orders/${id}`, { body: i });
  }
  submit(sid: string, id: string, workflowId?: string) {
    return this.h.request<St<PoStatus>>("POST", `${s(sid)}/purchase-orders/${id}/submit`, { body: { workflowId: workflowId || undefined } });
  }
  decide(sid: string, id: string, stepId: string, decision: "APPROVED" | "REJECTED", comment?: string) {
    return this.h.request<St<PoStatus>>("POST", `${s(sid)}/purchase-orders/${id}/approvals/${stepId}`, { body: { decision, comment } });
  }
  order(sid: string, id: string, i: { supplierId: string; orderDocRef?: string; orderedAt?: string }) {
    return this.h.request<St<PoStatus>>("POST", `${s(sid)}/purchase-orders/${id}/order`, { body: i });
  }
  cancel(sid: string, id: string, reason: string) {
    return this.h.request<St<PoStatus>>("POST", `${s(sid)}/purchase-orders/${id}/cancel`, { body: { reason } });
  }
  deliver(sid: string, id: string, i: DeliveryInput) {
    return this.h.request<{ id: string; number: string; status: PoStatus }>("POST", `${s(sid)}/purchase-orders/${id}/deliveries`, { body: i });
  }
  post(sid: string, i: PostDeliveryInput) {
    return this.h.request<{ postedAs: "STOCK" | "ASSETS"; created: string[] }>("POST", `${s(sid)}/deliveries/post`, { body: i });
  }
  addInvoice(sid: string, id: string, i: InvoiceInput) {
    return this.h.request<{ id: string }>("POST", `${s(sid)}/purchase-orders/${id}/invoices`, { body: i });
  }
  close(sid: string, id: string) {
    return this.h.request<St<PoStatus>>("POST", `${s(sid)}/purchase-orders/${id}/close`);
  }
}
