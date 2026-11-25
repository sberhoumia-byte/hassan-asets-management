/**
 * كتالوج التقارير: لكل تقرير صلاحية الوحدة، المرشحات المقبولة، الأعمدة، واستعلام البيانات من القاعدة.
 * كل القيم محسوبة من القاعدة لحظة الطلب؛ لا بيانات مفترضة.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { lateDays } from "@hassan/shared";
import type { ReportFilterKey, ReportFilters, ReportKey } from "@hassan/validation";
import { E } from "../common/errors";
import type { Fmt } from "./i18n";
import type { InventoryService } from "../inventory/inventory.service";
import type { ResourcesService } from "../resources/resources.service";

export type CellKind = "text" | "code" | "num" | "money" | "date" | "datetime";
export type Raw = string | number | null | undefined;

export interface ColDef {
  key: string;
  label: string; // مفتاح ترجمة
  kind?: CellKind;
  total?: boolean;
  width?: number; // نسبة مئوية في PDF
}

export interface ReportData {
  columns: ColDef[];
  rows: Record<string, Raw>[];
  /** مؤشرات تظهر أعلى التقرير. */
  summary?: [string, string][];
  /** تقارير مركبة (التقرير السنوي): أقسام من أزواج (مؤشر، قيمة). */
  sections?: { title: string; rows: [string, Raw, CellKind?][] }[];
  /** سطر إضافي تحت العنوان (مثلاً رقم دورة الجرد). */
  subject?: string;
}

export interface RunCtx {
  prisma: PrismaClient;
  schoolId: string;
  f: ReportFilters;
  fmt: Fmt;
  now: Date;
  inventory: InventoryService;
  resources: ResourcesService;
}

export interface ReportDef {
  key: ReportKey;
  group: "assets" | "stock" | "spaces" | "resources" | "maintenance" | "purchasing" | "custody" | "inventory" | "general";
  perm: string;
  filters: ReportFilterKey[];
  statuses?: { prefix: string; values: readonly string[] };
  run: (c: RunCtx) => Promise<ReportData>;
}

/** أقصى عدد أسطر في تقرير واحد (يُطلب تضييق المرشحات بعده). */
export const MAX_ROWS = 5000;

const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999Z`);
const range = (f: ReportFilters): { gte?: Date; lte?: Date } | undefined =>
  f.from || f.to ? { ...(f.from ? { gte: dayStart(f.from) } : {}), ...(f.to ? { lte: dayEnd(f.to) } : {}) } : undefined;
const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const n = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? null : Number(d));
const contains = (q?: string) => (q ? { contains: q, mode: "insensitive" as const } : undefined);

function capped<T>(rows: T[]): T[] {
  if (rows.length > MAX_ROWS) throw E.rule("REPORT_TOO_LARGE", { max: MAX_ROWS });
  return rows;
}

function checkStatus(def: ReportDef, f: ReportFilters) {
  if (f.status && !def.statuses?.values.includes(f.status)) throw E.validation({ fields: { status: "errors.invalidChoice" } });
}

/** تسميات القوائم المرجعية (عامة + خاصة بالمؤسسة) حسب اللغة. */
async function lookups(c: RunCtx) {
  const rows = await c.prisma.lookupValue.findMany({ where: { OR: [{ schoolId: null }, { schoolId: c.schoolId }] } });
  const byId = new Map(rows.map((r) => [r.id, c.fmt.lang === "fr" && r.labelFr ? r.labelFr : r.labelAr]));
  const byCode = new Map(rows.map((r) => [`${r.listKey}:${r.code}`, c.fmt.lang === "fr" && r.labelFr ? r.labelFr : r.labelAr]));
  return { id: (id?: string | null) => (id ? (byId.get(id) ?? "") : ""), code: (list: string, code?: string | null) => (code ? (byCode.get(`${list}:${code}`) ?? code) : "") };
}

const catName = (c: RunCtx, cat?: { nameAr: string; nameFr: string | null } | null) => (cat ? (c.fmt.lang === "fr" && cat.nameFr ? cat.nameFr : cat.nameAr) : "");
const staffName = (c: RunCtx, s?: { fullNameAr: string; fullNameFr: string | null } | null) => (s ? (c.fmt.lang === "fr" && s.fullNameFr ? s.fullNameFr : s.fullNameAr) : "");
const sum = (rows: Record<string, Raw>[], k: string) => rows.reduce((a, r) => a + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);

const ASSET_STATUSES = ["AVAILABLE", "DAMAGED", "UNDER_REPAIR", "DISPOSED"] as const;
const MV_TYPES = ["OPENING", "IN", "OUT", "TRANSFER_OUT", "TRANSFER_IN", "RETURN", "ADJUSTMENT", "REVERSAL"] as const;
const SPACE_STATUSES = ["GOOD", "NEEDS_MAINTENANCE", "OUT_OF_SERVICE"] as const;
const LOAN_STATUSES = ["ACTIVE", "PARTIALLY_RETURNED", "RETURNED"] as const;
const MNT_STATUSES = ["NEW", "UNDER_REVIEW", "IN_REPAIR", "REPAIRED", "UNREPAIRABLE", "CLOSED"] as const;
const PO_STATUSES = ["NEED_RECORDED", "ESTIMATED", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_DELIVERED", "DELIVERED", "INVOICED", "CLOSED", "REJECTED", "CANCELLED"] as const;
const CUSTODY_ACTIONS = ["HANDOVER", "ASSIGNMENT", "RELOCATION", "TRANSFER", "RETURN"] as const;
const INV_STATUSES = ["DRAFT", "OPEN", "COUNTING_DONE", "VALIDATED", "CLOSED", "ARCHIVED"] as const;

async function loanRows(c: RunCtx, where: Prisma.ResourceLoanWhereInput, overdueOnly: boolean) {
  const loans = capped(
    await c.prisma.resourceLoan.findMany({
      where: { schoolId: c.schoolId, status: { not: "CANCELLED" }, ...where },
      include: { resource: true, unit: true, borrower: true, returns: { select: { quantity: true, returnedAt: true } } },
      orderBy: [{ loanedAt: "asc" }, { number: "asc" }],
      take: MAX_ROWS + 1,
    }),
  );
  const t = c.fmt.t;
  return loans
    .map((l) => {
      const returned = l.returns.reduce((a, r) => a + r.quantity, 0);
      const last = l.returns.reduce<Date | null>((a, r) => (!a || r.returnedAt > a ? r.returnedAt : a), null);
      const late = l.status === "RETURNED" ? lateDays(l.dueAt, last ?? c.now) : lateDays(l.dueAt, c.now);
      return {
        number: l.number,
        loanedAt: isoDay(l.loanedAt),
        resource: `${l.resource.code} — ${l.resource.name}`,
        unit: l.unit?.inventoryNumber ?? "",
        quantity: l.quantity,
        borrower: staffName(c, l.borrower),
        dueAt: isoDay(l.dueAt),
        status: t(`loanStatus.${l.status}`),
        returned,
        outstanding: l.quantity - returned,
        lateDays: late,
        _overdue: l.status !== "RETURNED" && late > 0,
      };
    })
    .filter((r) => !overdueOnly || r._overdue)
    .map(({ _overdue, ...r }) => r);
}

export const REPORTS: ReportDef[] = [
  {
    key: "ASSETS",
    group: "assets",
    perm: "assets.view",
    filters: ["q", "categoryId", "roomId", "status", "from", "to", "includeArchived"],
    statuses: { prefix: "assetStatus", values: ASSET_STATUSES },
    async run(c) {
      const { f, fmt } = c;
      const rows = capped(
        await c.prisma.asset.findMany({
          where: {
            schoolId: c.schoolId,
            ...(f.includeArchived ? {} : { archivedAt: null }),
            ...(f.categoryId ? { categoryId: f.categoryId } : {}),
            ...(f.roomId ? { roomId: f.roomId } : {}),
            ...(f.status ? { status: f.status as never } : {}),
            ...(range(f) ? { acquisitionDate: range(f) } : {}),
            ...(f.q ? { OR: [{ name: contains(f.q) }, { inventoryNumber: contains(f.q) }, { serialNumber: contains(f.q) }] } : {}),
          },
          include: { category: true, room: true, responsible: true },
          orderBy: { inventoryNumber: "asc" },
          take: MAX_ROWS + 1,
        }),
      ).map((a) => ({
        inventoryNumber: a.inventoryNumber,
        name: a.name,
        category: catName(c, a.category),
        room: a.room?.name ?? "",
        quantity: a.quantity,
        status: fmt.t(`assetStatus.${a.status}`),
        acquisitionDate: isoDay(a.acquisitionDate),
        value: n(a.acquisitionValue),
        responsible: staffName(c, a.responsible),
      }));
      return {
        columns: [
          { key: "inventoryNumber", label: "rpt.col.inventoryNumber", kind: "code", width: 13 },
          { key: "name", label: "rpt.col.name", width: 20 },
          { key: "category", label: "rpt.col.category" },
          { key: "room", label: "rpt.col.room" },
          { key: "quantity", label: "rpt.col.quantity", kind: "num", total: true },
          { key: "status", label: "rpt.col.status" },
          { key: "acquisitionDate", label: "rpt.col.acquisitionDate", kind: "date" },
          { key: "value", label: "rpt.col.value", kind: "money", total: true },
          { key: "responsible", label: "rpt.col.responsible" },
        ],
        rows,
        summary: [
          ["rpt.sum.count", fmt.num(rows.length)],
          ["rpt.sum.value", fmt.money(sum(rows, "value"))],
        ],
      };
    },
  },
  {
    key: "STOCK",
    group: "stock",
    perm: "stock.view",
    filters: ["q", "categoryId", "warehouseId"],
    async run(c) {
      const { f, fmt } = c;
      const lk = await lookups(c);
      const items = capped(
        await c.prisma.inventoryItem.findMany({
          where: {
            schoolId: c.schoolId,
            isActive: true,
            ...(f.categoryId ? { categoryId: f.categoryId } : {}),
            ...(f.q ? { OR: [{ name: contains(f.q) }, { code: contains(f.q) }] } : {}),
          },
          include: { category: true, balances: { where: f.warehouseId ? { warehouseId: f.warehouseId } : {}, include: { warehouse: true } } },
          orderBy: { code: "asc" },
          take: MAX_ROWS + 1,
        }),
      );
      const rows = items.flatMap((it) => {
        const base = { code: it.code, name: it.name, category: catName(c, it.category), unit: lk.id(it.unitId), min: n(it.minQuantity) };
        const bals = it.balances.length ? it.balances : [null];
        return bals.map((b) => {
          const qty = b ? Number(b.quantity) : 0;
          return { ...base, warehouse: b?.warehouse.name ?? "", quantity: qty, state: fmt.t(Number(it.minQuantity) > 0 && qty <= Number(it.minQuantity) ? "rpt.val.low" : "rpt.val.ok") };
        });
      });
      return {
        columns: [
          { key: "code", label: "rpt.col.code", kind: "code" },
          { key: "name", label: "rpt.col.item", width: 24 },
          { key: "category", label: "rpt.col.category" },
          { key: "warehouse", label: "rpt.col.warehouse" },
          { key: "unit", label: "rpt.col.unit" },
          { key: "quantity", label: "rpt.col.balance", kind: "num" },
          { key: "min", label: "rpt.col.minQuantity", kind: "num" },
          { key: "state", label: "rpt.col.state" },
        ],
        rows,
        summary: [
          ["rpt.sum.items", fmt.num(items.length)],
          ["rpt.sum.lowItems", fmt.num(rows.filter((r) => r.state === fmt.t("rpt.val.low")).length)],
        ],
      };
    },
  },
  {
    key: "STOCK_MOVEMENTS",
    group: "stock",
    perm: "stock.view",
    filters: ["q", "from", "to", "status", "warehouseId"],
    statuses: { prefix: "mvType", values: MV_TYPES },
    async run(c) {
      const { f, fmt } = c;
      const rows = capped(
        await c.prisma.stockMovement.findMany({
          where: {
            schoolId: c.schoolId,
            ...(range(f) ? { occurredAt: range(f) } : {}),
            ...(f.status ? { type: f.status as never } : {}),
            ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
            ...(f.q ? { item: { OR: [{ name: contains(f.q) }, { code: contains(f.q) }] } } : {}),
          },
          include: { item: true, warehouse: true, recipient: true, supplier: true },
          orderBy: [{ occurredAt: "asc" }, { number: "asc" }],
          take: MAX_ROWS + 1,
        }),
      ).map((m) => ({
        number: m.number,
        occurredAt: m.occurredAt.toISOString(),
        type: fmt.t(`mvType.${m.type}`),
        item: `${m.item.code} — ${m.item.name}`,
        warehouse: m.warehouse.name,
        quantity: m.direction * Number(m.quantity),
        unitCost: n(m.unitCost),
        party: m.recipient ? staffName(c, m.recipient) : (m.supplier?.name ?? ""),
        reason: m.reason ?? "",
      }));
      return {
        columns: [
          { key: "number", label: "rpt.col.number", kind: "code" },
          { key: "occurredAt", label: "rpt.col.date", kind: "datetime" },
          { key: "type", label: "rpt.col.type" },
          { key: "item", label: "rpt.col.item", width: 22 },
          { key: "warehouse", label: "rpt.col.warehouse" },
          { key: "quantity", label: "rpt.col.signedQty", kind: "num" },
          { key: "unitCost", label: "rpt.col.unitCost", kind: "money" },
          { key: "party", label: "rpt.col.party" },
          { key: "reason", label: "rpt.col.reason" },
        ],
        rows,
        summary: [
          ["rpt.sum.count", fmt.num(rows.length)],
          ["rpt.sum.in", fmt.num(rows.filter((r) => r.quantity > 0).length)],
          ["rpt.sum.out", fmt.num(rows.filter((r) => r.quantity < 0).length)],
        ],
      };
    },
  },
  {
    key: "STOCK_LOW",
    group: "stock",
    perm: "stock.view",
    filters: ["q", "categoryId"],
    async run(c) {
      const { f, fmt } = c;
      const lk = await lookups(c);
      const items = await c.prisma.inventoryItem.findMany({
        where: {
          schoolId: c.schoolId,
          isActive: true,
          minQuantity: { gt: 0 },
          ...(f.categoryId ? { categoryId: f.categoryId } : {}),
          ...(f.q ? { OR: [{ name: contains(f.q) }, { code: contains(f.q) }] } : {}),
        },
        include: { balances: true },
        orderBy: { code: "asc" },
      });
      const rows = capped(
        items
          .map((it) => {
            const qty = it.balances.reduce((a, b) => a + Number(b.quantity), 0);
            return { code: it.code, name: it.name, unit: lk.id(it.unitId), quantity: qty, min: Number(it.minQuantity), shortfall: Math.max(0, Number(it.minQuantity) - qty) };
          })
          .filter((r) => r.quantity <= r.min),
      );
      return {
        columns: [
          { key: "code", label: "rpt.col.code", kind: "code" },
          { key: "name", label: "rpt.col.item", width: 30 },
          { key: "unit", label: "rpt.col.unit" },
          { key: "quantity", label: "rpt.col.balance", kind: "num" },
          { key: "min", label: "rpt.col.minQuantity", kind: "num" },
          { key: "shortfall", label: "rpt.col.shortfall", kind: "num" },
        ],
        rows,
        summary: [["rpt.sum.lowItems", fmt.num(rows.length)]],
      };
    },
  },
  {
    key: "SPACES",
    group: "spaces",
    perm: "spaces.view",
    filters: ["q", "status", "includeArchived"],
    statuses: { prefix: "spaceStatus", values: SPACE_STATUSES },
    async run(c) {
      const { f, fmt } = c;
      const lk = await lookups(c);
      const rows = capped(
        await c.prisma.room.findMany({
          where: {
            schoolId: c.schoolId,
            ...(f.includeArchived ? {} : { archivedAt: null }),
            ...(f.status ? { status: f.status as never } : {}),
            ...(f.q ? { OR: [{ name: contains(f.q) }, { code: contains(f.q) }] } : {}),
          },
          include: { building: true, _count: { select: { assets: { where: { archivedAt: null } }, resourceUnits: true } } },
          orderBy: { code: "asc" },
          take: MAX_ROWS + 1,
        }),
      ).map((r) => ({
        code: r.code,
        name: r.name,
        building: r.building?.name ?? "",
        type: lk.id(r.spaceTypeId),
        floor: r.floor ?? "",
        capacity: r.capacity,
        area: n(r.areaM2),
        status: fmt.t(`spaceStatus.${r.status}`),
        assets: r._count.assets,
        units: r._count.resourceUnits,
      }));
      return {
        columns: [
          { key: "code", label: "rpt.col.code", kind: "code" },
          { key: "name", label: "rpt.col.name", width: 18 },
          { key: "building", label: "rpt.col.building" },
          { key: "type", label: "rpt.col.type" },
          { key: "floor", label: "rpt.col.floor" },
          { key: "capacity", label: "rpt.col.capacity", kind: "num" },
          { key: "area", label: "rpt.col.area", kind: "num", total: true },
          { key: "status", label: "rpt.col.status" },
          { key: "assets", label: "rpt.col.assetsCount", kind: "num", total: true },
          { key: "units", label: "rpt.col.unitsCount", kind: "num", total: true },
        ],
        rows,
        summary: [
          ["rpt.sum.spaces", fmt.num(rows.length)],
          ["rpt.sum.needsMaintenance", fmt.num(rows.filter((r) => r.status !== fmt.t("spaceStatus.GOOD")).length)],
        ],
      };
    },
  },
  {
    key: "FACILITIES",
    group: "spaces",
    perm: "facilities.view",
    filters: ["q", "status", "includeArchived"],
    statuses: { prefix: "spaceStatus", values: SPACE_STATUSES },
    async run(c) {
      const { f, fmt } = c;
      const lk = await lookups(c);
      const rows = capped(
        await c.prisma.facility.findMany({
          where: {
            schoolId: c.schoolId,
            ...(f.includeArchived ? {} : { archivedAt: null }),
            ...(f.status ? { status: f.status as never } : {}),
            ...(f.q ? { OR: [{ name: contains(f.q) }, { code: contains(f.q) }] } : {}),
          },
          include: { room: true },
          orderBy: { code: "asc" },
          take: MAX_ROWS + 1,
        }),
      ).map((x) => ({
        code: x.code,
        name: x.name,
        type: lk.id(x.facilityTypeId),
        room: x.room?.name ?? "",
        surface: lk.code("CONDITION", x.surfaceCondition),
        nets: lk.code("CONDITION", x.netsGoalsCondition),
        status: fmt.t(`spaceStatus.${x.status}`),
        notes: x.notes ?? "",
      }));
      return {
        columns: [
          { key: "code", label: "rpt.col.code", kind: "code" },
          { key: "name", label: "rpt.col.name", width: 18 },
          { key: "type", label: "rpt.col.type" },
          { key: "room", label: "rpt.col.room" },
          { key: "surface", label: "rpt.col.surface" },
          { key: "nets", label: "rpt.col.nets" },
          { key: "status", label: "rpt.col.status" },
          { key: "notes", label: "rpt.col.notes" },
        ],
        rows,
        summary: [["rpt.sum.count", fmt.num(rows.length)]],
      };
    },
  },
  {
    key: "RESOURCES",
    group: "resources",
    perm: "resources.view",
    filters: ["q"],
    async run(c) {
      const { fmt } = c;
      const lk = await lookups(c);
      const list = capped(await c.resources.list(c.schoolId, { q: c.f.q }));
      const rows = list.map((r) => ({
        code: r.code,
        name: r.name,
        type: lk.id(r.resourceTypeId),
        mode: fmt.t(`resources.mode.${r.trackingMode}`),
        room: r.room ?? "",
        total: r.total,
        available: r.available,
        onLoan: r.onLoan,
        damaged: r.damaged,
        maintenance: r.maintenance,
      }));
      return {
        columns: [
          { key: "code", label: "rpt.col.code", kind: "code" },
          { key: "name", label: "rpt.col.name", width: 20 },
          { key: "type", label: "rpt.col.type" },
          { key: "mode", label: "rpt.col.trackingMode" },
          { key: "room", label: "rpt.col.room" },
          { key: "total", label: "rpt.col.total", kind: "num", total: true },
          { key: "available", label: "rpt.col.available", kind: "num", total: true },
          { key: "onLoan", label: "rpt.col.onLoan", kind: "num", total: true },
          { key: "damaged", label: "rpt.col.damaged", kind: "num", total: true },
          { key: "maintenance", label: "rpt.col.underMaintenance", kind: "num", total: true },
        ],
        rows,
        summary: [
          ["rpt.sum.resources", fmt.num(rows.length)],
          ["rpt.col.onLoan", fmt.num(sum(rows, "onLoan"))],
          ["rpt.col.damaged", fmt.num(sum(rows, "damaged"))],
        ],
      };
    },
  },
  {
    key: "LOANS",
    group: "resources",
    perm: "loans.view",
    filters: ["from", "to", "status"],
    statuses: { prefix: "loanStatus", values: LOAN_STATUSES },
    async run(c) {
      const rows = await loanRows(c, { ...(range(c.f) ? { loanedAt: range(c.f) } : {}), ...(c.f.status ? { status: c.f.status as never } : {}) }, false);
      return { columns: loanColumns, rows, summary: loanSummary(c, rows) };
    },
  },
  {
    key: "LOANS_OVERDUE",
    group: "resources",
    perm: "loans.view",
    filters: [],
    async run(c) {
      const rows = await loanRows(c, { status: { in: ["ACTIVE", "PARTIALLY_RETURNED"] }, dueAt: { lt: c.now } }, true);
      return { columns: loanColumns, rows, summary: loanSummary(c, rows) };
    },
  },
  {
    key: "RETURNS",
    group: "resources",
    perm: "loans.view",
    filters: ["from", "to"],
    async run(c) {
      const { f, fmt } = c;
      const lk = await lookups(c);
      const rets = capped(
        await c.prisma.resourceReturn.findMany({
          where: { loan: { schoolId: c.schoolId }, ...(range(f) ? { returnedAt: range(f) } : {}) },
          include: { loan: { include: { resource: true, borrower: true, unit: true } } },
          orderBy: { returnedAt: "asc" },
          take: MAX_ROWS + 1,
        }),
      );
      const users = new Map(
        (await c.prisma.user.findMany({ where: { id: { in: [...new Set(rets.map((r) => r.receivedById))] } }, select: { id: true, fullNameAr: true } })).map((u) => [u.id, u.fullNameAr]),
      );
      const rows = rets.map((r) => ({
        returnedAt: r.returnedAt.toISOString(),
        loan: r.loan.number,
        resource: `${r.loan.resource.code} — ${r.loan.resource.name}`,
        unit: r.loan.unit?.inventoryNumber ?? "",
        borrower: staffName(c, r.loan.borrower),
        quantity: r.quantity,
        condition: lk.code("CONDITION", r.conditionIn),
        damaged: r.damaged ? fmt.t("common.yes") : fmt.t("common.no"),
        receivedBy: users.get(r.receivedById) ?? "",
      }));
      return {
        columns: [
          { key: "returnedAt", label: "rpt.col.returnedAt", kind: "datetime" },
          { key: "loan", label: "rpt.col.loanNumber", kind: "code" },
          { key: "resource", label: "rpt.col.resource", width: 20 },
          { key: "unit", label: "rpt.col.unit", kind: "code" },
          { key: "borrower", label: "rpt.col.borrower" },
          { key: "quantity", label: "rpt.col.quantity", kind: "num", total: true },
          { key: "condition", label: "rpt.col.condition" },
          { key: "damaged", label: "rpt.col.damaged" },
          { key: "receivedBy", label: "rpt.col.receivedBy" },
        ],
        rows,
        summary: [
          ["rpt.sum.returns", fmt.num(rows.length)],
          ["rpt.sum.damagedReturns", fmt.num(rets.filter((r) => r.damaged).length)],
        ],
      };
    },
  },
  {
    key: "MAINTENANCE",
    group: "maintenance",
    perm: "maintenance.view",
    filters: ["from", "to", "status"],
    statuses: { prefix: "mntStatus", values: MNT_STATUSES },
    async run(c) {
      const { f, fmt } = c;
      const reqs = capped(
        await c.prisma.maintenanceRequest.findMany({
          where: { schoolId: c.schoolId, ...(range(f) ? { reportedAt: range(f) } : {}), ...(f.status ? { status: f.status as never } : {}) },
          include: { asset: true, room: true, facility: true, resourceUnit: { include: { resource: true } }, records: { select: { cost: true } } },
          orderBy: [{ reportedAt: "asc" }, { number: "asc" }],
          take: MAX_ROWS + 1,
        }),
      );
      const rows = reqs.map((r) => ({
        number: r.number,
        reportedAt: r.reportedAt.toISOString(),
        target: r.asset
          ? `${r.asset.inventoryNumber} — ${r.asset.name}`
          : r.resourceUnit
            ? `${r.resourceUnit.inventoryNumber} — ${r.resourceUnit.resource.name}`
            : (r.room?.name ?? r.facility?.name ?? ""),
        type: fmt.t(`mntType.${r.type}`),
        urgency: fmt.t(`urgency.${r.urgency}`),
        status: fmt.t(`mntStatus.${r.status}`),
        closedAt: r.closedAt ? r.closedAt.toISOString() : null,
        cost: r.records.reduce((a, x) => a + Number(x.cost ?? 0), 0),
      }));
      return {
        columns: [
          { key: "number", label: "rpt.col.number", kind: "code" },
          { key: "reportedAt", label: "rpt.col.reportedAt", kind: "date" },
          { key: "target", label: "rpt.col.target", width: 24 },
          { key: "type", label: "rpt.col.type" },
          { key: "urgency", label: "rpt.col.urgency" },
          { key: "status", label: "rpt.col.status" },
          { key: "closedAt", label: "rpt.col.closedAt", kind: "date" },
          { key: "cost", label: "rpt.col.cost", kind: "money", total: true },
        ],
        rows,
        summary: [
          ["rpt.sum.requests", fmt.num(rows.length)],
          ["rpt.sum.open", fmt.num(reqs.filter((r) => !["CLOSED", "REPAIRED", "UNREPAIRABLE"].includes(r.status)).length)],
          ["rpt.sum.cost", fmt.money(sum(rows, "cost"))],
        ],
      };
    },
  },
  {
    key: "PURCHASING",
    group: "purchasing",
    perm: "purchasing.view",
    filters: ["from", "to", "status", "supplierId"],
    statuses: { prefix: "poStatus", values: PO_STATUSES },
    async run(c) {
      const { f, fmt } = c;
      const rows = capped(
        await c.prisma.purchaseOrder.findMany({
          where: {
            schoolId: c.schoolId,
            ...(range(f) ? { createdAt: range(f) } : {}),
            ...(f.status ? { status: f.status as never } : {}),
            ...(f.supplierId ? { supplierId: f.supplierId } : {}),
          },
          include: { supplier: true, invoices: { select: { amount: true } } },
          orderBy: [{ createdAt: "asc" }, { number: "asc" }],
          take: MAX_ROWS + 1,
        }),
      ).map((p) => ({
        number: p.number,
        createdAt: p.createdAt.toISOString(),
        title: p.title,
        supplier: p.supplier?.name ?? "",
        status: fmt.t(`poStatus.${p.status}`),
        estimated: n(p.estimatedTotal),
        invoiced: p.invoices.reduce((a, i) => a + Number(i.amount), 0),
      }));
      return {
        columns: [
          { key: "number", label: "rpt.col.number", kind: "code" },
          { key: "createdAt", label: "rpt.col.date", kind: "date" },
          { key: "title", label: "rpt.col.subject", width: 26 },
          { key: "supplier", label: "rpt.col.supplier" },
          { key: "status", label: "rpt.col.status" },
          { key: "estimated", label: "rpt.col.estimated", kind: "money", total: true },
          { key: "invoiced", label: "rpt.col.invoiced", kind: "money", total: true },
        ],
        rows,
        summary: [
          ["rpt.sum.orders", fmt.num(rows.length)],
          ["rpt.sum.estimated", fmt.money(sum(rows, "estimated"))],
          ["rpt.sum.invoiced", fmt.money(sum(rows, "invoiced"))],
        ],
      };
    },
  },
  {
    key: "SUPPLIERS",
    group: "purchasing",
    perm: "suppliers.view",
    filters: ["q", "includeArchived"],
    async run(c) {
      const { f, fmt } = c;
      const lk = await lookups(c);
      const rows = capped(
        await c.prisma.supplier.findMany({
          where: {
            schoolId: c.schoolId,
            ...(f.includeArchived ? {} : { archivedAt: null }),
            ...(f.q ? { OR: [{ name: contains(f.q) }, { ice: contains(f.q) }] } : {}),
          },
          include: { _count: { select: { purchaseOrders: true } }, invoices: { select: { amount: true } } },
          orderBy: { name: "asc" },
          take: MAX_ROWS + 1,
        }),
      ).map((s) => ({
        name: s.name,
        activity: lk.id(s.activityId),
        phone: s.phone ?? "",
        email: s.email ?? "",
        ice: s.ice ?? "",
        orders: s._count.purchaseOrders,
        invoiced: s.invoices.reduce((a, i) => a + Number(i.amount), 0),
      }));
      return {
        columns: [
          { key: "name", label: "rpt.col.name", width: 22 },
          { key: "activity", label: "rpt.col.activity" },
          { key: "phone", label: "rpt.col.phone", kind: "code" },
          { key: "email", label: "rpt.col.email", kind: "code" },
          { key: "ice", label: "rpt.col.ice", kind: "code" },
          { key: "orders", label: "rpt.col.orders", kind: "num", total: true },
          { key: "invoiced", label: "rpt.col.invoiced", kind: "money", total: true },
        ],
        rows,
        summary: [["rpt.sum.suppliers", fmt.num(rows.length)]],
      };
    },
  },
  {
    key: "CUSTODY",
    group: "custody",
    perm: "custody.view",
    filters: ["from", "to", "status"],
    statuses: { prefix: "custodyAction", values: CUSTODY_ACTIONS },
    async run(c) {
      const { f, fmt } = c;
      const rows = capped(
        await c.prisma.custodyRecord.findMany({
          where: { schoolId: c.schoolId, ...(range(f) ? { occurredAt: range(f) } : {}), ...(f.status ? { action: f.status as never } : {}) },
          include: { asset: true, fromStaff: true, toStaff: true, fromRoom: true, toRoom: true },
          orderBy: [{ occurredAt: "asc" }, { number: "asc" }],
          take: MAX_ROWS + 1,
        }),
      ).map((r) => ({
        number: r.number,
        occurredAt: r.occurredAt.toISOString(),
        action: fmt.t(`custodyAction.${r.action}`),
        asset: `${r.asset.inventoryNumber} — ${r.asset.name}`,
        from: [staffName(c, r.fromStaff), r.fromRoom?.name].filter(Boolean).join(" / "),
        to: [staffName(c, r.toStaff), r.toRoom?.name].filter(Boolean).join(" / "),
      }));
      return {
        columns: [
          { key: "number", label: "rpt.col.number", kind: "code" },
          { key: "occurredAt", label: "rpt.col.date", kind: "date" },
          { key: "action", label: "rpt.col.action" },
          { key: "asset", label: "rpt.col.asset", width: 26 },
          { key: "from", label: "rpt.col.from" },
          { key: "to", label: "rpt.col.to" },
        ],
        rows,
        summary: [["rpt.sum.operations", fmt.num(rows.length)]],
      };
    },
  },
  {
    key: "INVENTORY",
    group: "inventory",
    perm: "inventory.view",
    filters: ["from", "to", "status"],
    statuses: { prefix: "invStatus", values: INV_STATUSES },
    async run(c) {
      const { f, fmt } = c;
      const sessions = capped(
        await c.prisma.inventorySession.findMany({
          where: { schoolId: c.schoolId, ...(range(f) ? { startDate: range(f) } : {}), ...(f.status ? { status: f.status as never } : {}) },
          orderBy: [{ startDate: "asc" }, { number: "asc" }],
          take: MAX_ROWS + 1,
        }),
      );
      const rows = [];
      for (const s of sessions) {
        const d = await c.inventory.discrepancies(c.schoolId, s.id);
        rows.push({
          number: s.number,
          type: fmt.t(`invType.${s.type}`),
          status: fmt.t(`invStatus.${s.status}`),
          startDate: isoDay(s.startDate),
          endDate: isoDay(s.endDate),
          lines: d.totals.lines,
          counted: d.totals.counted,
          missing: d.missing.length,
          misplaced: d.misplaced.length,
          surplus: d.surplus.length + d.unexpected.length,
        });
      }
      return {
        columns: [
          { key: "number", label: "rpt.col.number", kind: "code" },
          { key: "type", label: "rpt.col.type" },
          { key: "status", label: "rpt.col.status" },
          { key: "startDate", label: "rpt.col.startDate", kind: "date" },
          { key: "endDate", label: "rpt.col.endDate", kind: "date" },
          { key: "lines", label: "rpt.col.lines", kind: "num" },
          { key: "counted", label: "rpt.col.counted", kind: "num" },
          { key: "missing", label: "rpt.col.missing", kind: "num" },
          { key: "misplaced", label: "rpt.col.misplaced", kind: "num" },
          { key: "surplus", label: "rpt.col.surplus", kind: "num" },
        ],
        rows,
        summary: [["rpt.sum.sessions", fmt.num(rows.length)]],
      };
    },
  },
  {
    key: "DISCREPANCIES",
    group: "inventory",
    perm: "inventory.view",
    filters: ["sessionId"],
    async run(c) {
      const { f, fmt } = c;
      if (!f.sessionId) throw E.validation({ fields: { sessionId: "errors.required" } });
      const s = await c.inventory.get(c.schoolId, f.sessionId);
      const d = await c.inventory.discrepancies(c.schoolId, f.sessionId);
      const kinds = ["missing", "misplaced", "surplus", "unexpected", "notCounted", "condition"] as const;
      const rows = kinds.flatMap((k) =>
        d[k].map((l) => ({
          kind: fmt.t(`invDisc.${k}`),
          ref: l.ref,
          name: l.name,
          expected: l.expectedQty,
          counted: l.countedQty ?? null,
          room: k === "condition" ? (l.conditionFound ?? "") : (l.foundRoom ?? l.expectedRoom ?? ""),
        })),
      );
      return {
        subject: `${fmt.t("rpt.f.sessionId")}: ${s.number} — ${fmt.t(`invType.${s.type}`)} (${fmt.t(`invStatus.${s.status}`)})`,
        columns: [
          { key: "kind", label: "rpt.col.issue" },
          { key: "ref", label: "rpt.col.ref", kind: "code" },
          { key: "name", label: "rpt.col.item", width: 26 },
          { key: "expected", label: "rpt.col.expected", kind: "num" },
          { key: "counted", label: "rpt.col.counted", kind: "num" },
          { key: "room", label: "rpt.col.foundRoom" },
        ],
        rows,
        summary: kinds.map((k): [string, string] => [`invDisc.${k}`, fmt.num(d[k].length)]),
      };
    },
  },
  {
    key: "ANNUAL",
    group: "general",
    perm: "dashboard.view",
    filters: ["year"],
    async run(c) {
      const year = c.f.year ?? c.now.getUTCFullYear();
      const y = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
      const p = c.prisma;
      const sid = c.schoolId;
      const [assetsActive, assetsValue, acquired, acquiredValue, disposed, damaged] = await Promise.all([
        p.asset.count({ where: { schoolId: sid, archivedAt: null } }),
        p.asset.aggregate({ where: { schoolId: sid, archivedAt: null }, _sum: { acquisitionValue: true } }),
        p.asset.count({ where: { schoolId: sid, acquisitionDate: y } }),
        p.asset.aggregate({ where: { schoolId: sid, acquisitionDate: y }, _sum: { acquisitionValue: true } }),
        p.asset.count({ where: { schoolId: sid, archivedAt: y } }),
        p.asset.count({ where: { schoolId: sid, archivedAt: null, status: { in: ["DAMAGED", "UNDER_REPAIR"] } } }),
      ]);
      const mv = await p.stockMovement.groupBy({ by: ["direction"], where: { schoolId: sid, occurredAt: y }, _count: { _all: true } });
      const [loans, returns, overdue, resources] = await Promise.all([
        p.resourceLoan.count({ where: { schoolId: sid, loanedAt: y, status: { not: "CANCELLED" } } }),
        p.resourceReturn.count({ where: { loan: { schoolId: sid }, returnedAt: y } }),
        p.resourceLoan.count({ where: { schoolId: sid, status: { in: ["ACTIVE", "PARTIALLY_RETURNED"] }, dueAt: { lt: c.now } } }),
        p.educationalResource.count({ where: { schoolId: sid, archivedAt: null } }),
      ]);
      const [mReq, mDone, mCost] = await Promise.all([
        p.maintenanceRequest.count({ where: { schoolId: sid, reportedAt: y } }),
        p.maintenanceRequest.count({ where: { schoolId: sid, closedAt: y } }),
        p.maintenanceRecord.aggregate({ where: { request: { schoolId: sid }, createdAt: y }, _sum: { cost: true } }),
      ]);
      const [pos, invoiced, custody, sessions, validated] = await Promise.all([
        p.purchaseOrder.count({ where: { schoolId: sid, createdAt: y } }),
        p.invoice.aggregate({ where: { schoolId: sid, invoiceDate: y }, _sum: { amount: true } }),
        p.custodyRecord.count({ where: { schoolId: sid, occurredAt: y } }),
        p.inventorySession.count({ where: { schoolId: sid, startDate: y } }),
        p.inventorySession.count({ where: { schoolId: sid, validatedAt: y } }),
      ]);
      const dirCount = (d: number) => mv.find((m) => m.direction === d)?._count._all ?? 0;
      const sections: ReportData["sections"] = [
        {
          title: "rpt.annual.assets",
          rows: [
            ["rpt.annual.assetsActive", assetsActive, "num"],
            ["rpt.annual.assetsValue", n(assetsValue._sum.acquisitionValue) ?? 0, "money"],
            ["rpt.annual.acquired", acquired, "num"],
            ["rpt.annual.acquiredValue", n(acquiredValue._sum.acquisitionValue) ?? 0, "money"],
            ["rpt.annual.disposed", disposed, "num"],
            ["rpt.annual.damagedNow", damaged, "num"],
          ],
        },
        {
          title: "rpt.annual.stock",
          rows: [
            ["rpt.annual.movementsIn", dirCount(1), "num"],
            ["rpt.annual.movementsOut", dirCount(-1), "num"],
          ],
        },
        {
          title: "rpt.annual.resources",
          rows: [
            ["rpt.annual.resourcesActive", resources, "num"],
            ["rpt.annual.loans", loans, "num"],
            ["rpt.annual.returns", returns, "num"],
            ["rpt.annual.overdueNow", overdue, "num"],
          ],
        },
        {
          title: "rpt.annual.maintenance",
          rows: [
            ["rpt.annual.requests", mReq, "num"],
            ["rpt.annual.closed", mDone, "num"],
            ["rpt.annual.cost", n(mCost._sum.cost) ?? 0, "money"],
          ],
        },
        {
          title: "rpt.annual.purchasing",
          rows: [
            ["rpt.annual.orders", pos, "num"],
            ["rpt.annual.invoiced", n(invoiced._sum.amount) ?? 0, "money"],
          ],
        },
        {
          title: "rpt.annual.custodyInventory",
          rows: [
            ["rpt.annual.custodyOps", custody, "num"],
            ["rpt.annual.sessions", sessions, "num"],
            ["rpt.annual.validated", validated, "num"],
          ],
        },
      ];
      return {
        subject: c.fmt.t("rpt.annual.year", { y: year }),
        columns: [
          { key: "section", label: "rpt.col.section" },
          { key: "indicator", label: "rpt.col.indicator", width: 50 },
          { key: "value", label: "rpt.col.value", kind: "num" },
        ],
        rows: [],
        sections,
      };
    },
  },
];

const loanColumns: ColDef[] = [
  { key: "number", label: "rpt.col.number", kind: "code" },
  { key: "loanedAt", label: "rpt.col.loanedAt", kind: "date" },
  { key: "resource", label: "rpt.col.resource", width: 20 },
  { key: "unit", label: "rpt.col.unit", kind: "code" },
  { key: "quantity", label: "rpt.col.quantity", kind: "num", total: true },
  { key: "borrower", label: "rpt.col.borrower" },
  { key: "dueAt", label: "rpt.col.dueAt", kind: "date" },
  { key: "status", label: "rpt.col.status" },
  { key: "outstanding", label: "rpt.col.outstanding", kind: "num", total: true },
  { key: "lateDays", label: "rpt.col.lateDays", kind: "num" },
];

function loanSummary(c: RunCtx, rows: Record<string, Raw>[]): [string, string][] {
  return [
    ["rpt.sum.loans", c.fmt.num(rows.length)],
    ["rpt.sum.overdue", c.fmt.num(rows.filter((r) => Number(r.lateDays) > 0 && Number(r.outstanding) > 0).length)],
  ];
}

export const REPORT_BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));

export function getDef(key: string, f: ReportFilters): ReportDef {
  const def = REPORT_BY_KEY.get(key as ReportKey);
  if (!def) throw E.notFound();
  checkStatus(def, f);
  return def;
}
