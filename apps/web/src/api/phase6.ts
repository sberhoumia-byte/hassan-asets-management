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
import type { Paged } from "./phase4";

// ---------------- الصيانة ----------------
export type MaintenanceStatus = "NEW" | "UNDER_REVIEW" | "IN_REPAIR" | "REPAIRED" | "UNREPAIRABLE" | "CLOSED";
export type TargetType = "asset" | "room" | "facility" | "resourceUnit";
export interface MaintenanceRecord {
  id: string;
  contractor?: string;
  cost?: number | null;
  interventionReport?: string;
  startedAt?: string;
  repairedAt?: string;
  outcome: "IN_REPAIR" | "REPAIRED" | "UNREPAIRABLE";
  invoice?: { number: string; date: string; amount: number; supplier: string };
  by?: string;
  at: string;
}
export interface MaintenanceRequest {
  id: string;
  number: string;
  target: { type: TargetType; id: string; label: string };
  type: "PREVENTIVE" | "CORRECTIVE" | "EMERGENCY";
  damageTypeId?: string;
  description: string;
  reportedAt: string;
  reportedBy?: string;
  urgency: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  assigneeId?: string;
  assignee?: string;
  status: MaintenanceStatus;
  hasPhoto: boolean;
  photoDataUrl?: string;
  schedule?: { id: string; title: string };
  closedAt?: string;
  totalCost: number;
  records: MaintenanceRecord[];
}
export interface MaintenanceSchedule {
  id: string;
  title: string;
  targetType: TargetType;
  targetId: string;
  target: string;
  intervalDays: number;
  nextDueAt: string;
  remindDaysBefore: number;
  isActive: boolean;
  dueSoon: boolean;
  overdue: boolean;
}
export interface MaintenanceQuery { q?: string; status?: string; urgency?: string; open?: boolean; targetType?: string; page?: number; pageSize?: number }
export interface MaintenanceApi {
  list(schoolId: string, q: MaintenanceQuery): Promise<Paged<MaintenanceRequest>>;
  get(schoolId: string, id: string): Promise<MaintenanceRequest>;
  assignees(schoolId: string): Promise<{ id: string; fullNameAr: string }[]>;
  create(schoolId: string, i: MaintenanceRequestInput): Promise<{ id: string; number: string; replayed: boolean }>;
  update(schoolId: string, id: string, i: Pick<MaintenanceRequestInput, "damageTypeId" | "description" | "urgency" | "assigneeId">): Promise<{ id: string }>;
  transition(schoolId: string, id: string, i: MaintenanceTransitionInput): Promise<{ id: string; status: MaintenanceStatus }>;
  addRecord(schoolId: string, id: string, i: MaintenanceRecordInput): Promise<{ id: string }>;
  schedules(schoolId: string): Promise<MaintenanceSchedule[]>;
  saveSchedule(schoolId: string, id: string | null, i: MaintenanceScheduleInput): Promise<{ id: string }>;
  generate(schoolId: string, id: string): Promise<{ id: string; number: string }>;
}

// ---------------- العهدة ----------------
export type CustodyAction = "HANDOVER" | "ASSIGNMENT" | "RELOCATION" | "TRANSFER" | "RETURN";
export interface CustodyRecord {
  id: string;
  number: string;
  action: CustodyAction;
  asset: { id: string; inventoryNumber: string; name: string; quantity: number };
  fromStaffId?: string;
  fromStaff?: string;
  toStaffId?: string;
  toStaff?: string;
  toStaffNumber?: string;
  fromRoom?: string;
  toRoom?: string;
  occurredAt: string;
  notes?: string;
  by?: string;
}
export interface CustodyQuery { assetId?: string; staffId?: string; action?: string; q?: string; page?: number; pageSize?: number }
export interface CustodyApi {
  list(schoolId: string, q: CustodyQuery): Promise<Paged<CustodyRecord>>;
  get(schoolId: string, id: string): Promise<CustodyRecord>;
  create(schoolId: string, i: CustodyInput): Promise<{ id: string; number: string; replayed: boolean }>;
}

// ---------------- الجرد ----------------
export type InventoryStatus = "DRAFT" | "OPEN" | "COUNTING_DONE" | "VALIDATED" | "CLOSED" | "ARCHIVED";
export type InventoryIssue = "MISSING" | "NOT_COUNTED" | "SURPLUS" | "UNEXPECTED" | "MISPLACED";
export interface InventorySession {
  id: string;
  number: string;
  type: "ANNUAL" | "PERIODIC" | "EXCEPTIONAL";
  status: InventoryStatus;
  startDate: string;
  endDate: string;
  includesStock: boolean;
  rooms: { id: string; label: string }[];
  assignees: { id: string; name: string }[];
  reportNotes?: string;
  validatedBy?: string;
  validatedAt?: string;
  closedAt?: string;
  createdBy?: string;
  createdAt: string;
  stats: { lines: number; counted: number; withIssue: number };
}
export interface InventoryLine {
  id: string;
  kind: "ASSET" | "RESOURCE_UNIT" | "RESOURCE_QUANTITY" | "STOCK_ITEM";
  ref: string;
  name: string;
  expectedRoomId?: string;
  expectedRoom?: string;
  foundRoomId?: string;
  foundRoom?: string;
  expectedQty: number;
  countedQty?: number;
  conditionFound?: string;
  isUnexpected: boolean;
  notes?: string;
  countedAt?: string;
  issues: InventoryIssue[];
}
export interface Discrepancies {
  missing: InventoryLine[];
  notCounted: InventoryLine[];
  surplus: InventoryLine[];
  unexpected: InventoryLine[];
  misplaced: InventoryLine[];
  condition: InventoryLine[];
  totals: { lines: number; counted: number };
}
export type InventoryMove = "open" | "complete" | "reopen" | "close" | "archive";
export interface InventoryApi {
  list(schoolId: string): Promise<InventorySession[]>;
  assignable(schoolId: string): Promise<{ id: string; fullNameAr: string }[]>;
  get(schoolId: string, id: string): Promise<InventorySession>;
  lines(schoolId: string, id: string, f?: { roomId?: string; filter?: string; q?: string }): Promise<InventoryLine[]>;
  discrepancies(schoolId: string, id: string): Promise<Discrepancies>;
  create(schoolId: string, i: InventorySessionInput): Promise<{ id: string; number: string }>;
  update(schoolId: string, id: string, i: InventorySessionInput): Promise<{ id: string }>;
  move(schoolId: string, id: string, m: InventoryMove): Promise<{ id: string; status: InventoryStatus }>;
  count(schoolId: string, id: string, i: InventoryCountInput): Promise<{ lineId: string; replayed: boolean; unexpected?: boolean }>;
  validate(schoolId: string, id: string, reportNotes: string): Promise<{ id: string; status: InventoryStatus }>;
}

// ---------------- الطلبيات ----------------
export type PoStatus = "NEED_RECORDED" | "ESTIMATED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ORDERED" | "PARTIALLY_DELIVERED" | "DELIVERED" | "INVOICED" | "CLOSED" | "CANCELLED";
export interface ApprovalWorkflow { id: string; name: string; fundingSourceId?: string; managingBody?: string; isActive: boolean; steps: { id: string; order: number; name: string; requiredRoleCode?: string }[] }
export interface PurchaseOrder {
  id: string;
  number: string;
  title: string;
  needDescription?: string;
  status: PoStatus;
  fundingSourceId?: string;
  budgetLine?: string;
  estimatedTotal?: number;
  supplierId?: string;
  supplier?: string;
  workflow?: { id: string; name: string };
  orderDocRef?: string;
  orderedAt?: string;
  createdAt: string;
  items: { id: string; description: string; quantity: number; unitId?: string; estimatedUnitCost?: number; targetKind: "ASSET" | "STOCK" | "RESOURCE"; inventoryItemId?: string; accepted: number }[];
  approvals: { stepId: string; order: number; name: string; requiredRoleCode?: string; decision: "PENDING" | "APPROVED" | "REJECTED"; decidedBy?: string; decidedAt?: string; comment?: string }[];
  deliveries: {
    id: string;
    number: string;
    receivedAt: string;
    conformity: "CONFORM" | "NON_CONFORM" | "PARTIAL";
    conformityNotes?: string;
    items: { id: string; purchaseOrderItemId?: string; description: string; quantityReceived: number; quantityAccepted: number; postedAt?: string; postedAs?: string }[];
  }[];
  invoices: { id: string; invoiceNumber: string; invoiceDate: string; amount: number }[];
}
export interface PurchasingApi {
  workflows(schoolId: string): Promise<ApprovalWorkflow[]>;
  saveWorkflow(schoolId: string, id: string | null, i: ApprovalWorkflowInput): Promise<{ id: string }>;
  list(schoolId: string, q: { q?: string; status?: string; page?: number; pageSize?: number }): Promise<Paged<PurchaseOrder>>;
  get(schoolId: string, id: string): Promise<PurchaseOrder>;
  create(schoolId: string, i: PurchaseOrderInput): Promise<{ id: string; number: string }>;
  update(schoolId: string, id: string, i: PurchaseOrderInput): Promise<{ id: string }>;
  submit(schoolId: string, id: string, workflowId?: string): Promise<{ id: string; status: PoStatus }>;
  decide(schoolId: string, id: string, stepId: string, decision: "APPROVED" | "REJECTED", comment?: string): Promise<{ id: string; status: PoStatus }>;
  order(schoolId: string, id: string, i: { supplierId: string; orderDocRef?: string; orderedAt?: string }): Promise<{ id: string; status: PoStatus }>;
  cancel(schoolId: string, id: string, reason: string): Promise<{ id: string; status: PoStatus }>;
  deliver(schoolId: string, id: string, i: DeliveryInput): Promise<{ id: string; number: string; status: PoStatus }>;
  post(schoolId: string, i: PostDeliveryInput): Promise<{ postedAs: "STOCK" | "ASSETS"; created: string[] }>;
  addInvoice(schoolId: string, id: string, i: InvoiceInput): Promise<{ id: string }>;
  close(schoolId: string, id: string): Promise<{ id: string; status: PoStatus }>;
}
