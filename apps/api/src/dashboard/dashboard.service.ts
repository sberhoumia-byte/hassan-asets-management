import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { onLoanQuantity } from "../resources/resources.service";

/** رموز سجل التدقيق ← مفاتيح الترجمة في الواجهة (activity.*). */
export const ACTIVITY_KEYS: Record<string, string> = {
  SETUP: "activity.setup",
  LOGIN: "activity.login",
  PASSWORD_CHANGE: "activity.passwordChanged",
  ACADEMY_CREATE: "activity.academyCreated",
  DIRECTORATE_CREATE: "activity.directorateCreated",
  SCHOOL_CREATE: "activity.schoolCreated",
  SCHOOL_UPDATE: "activity.schoolUpdated",
  BRANDING_SAVE: "activity.brandingSaved",
  BRANDING_RESET: "activity.brandingReset",
  USER_CREATE: "activity.userCreated",
  USER_UPDATE: "activity.userUpdated",
  USER_ROLES: "activity.userRolesChanged",
  USER_OVERRIDES: "activity.userPermissionsChanged",
  USER_RESET_PASSWORD: "activity.userPasswordReset",
  ACCOUNT_LOCKED: "activity.accountLocked",
  ASSET_CREATE: "activity.assetCreated",
  ASSET_UPDATE: "activity.assetUpdated",
  ASSET_ARCHIVE: "activity.assetArchived",
  STOCK_ITEM_CREATE: "activity.stockItemCreated",
  STOCK_IN: "activity.stockIn",
  STOCK_OUT: "activity.stockOut",
  STOCK_TRANSFER: "activity.stockTransfer",
  STOCK_RETURN: "activity.stockReturn",
  STOCK_ADJUST: "activity.stockAdjust",
  STOCK_REVERSE: "activity.stockReverse",
  SUPPLIER_CREATE: "activity.supplierCreated",
  BUILDING_CREATE: "activity.buildingCreated",
  ROOM_CREATE: "activity.roomCreated",
  FACILITY_CREATE: "activity.facilityCreated",
  STAFF_CREATE: "activity.staffCreated",
  RESOURCE_CREATE: "activity.resourceCreated",
  LOAN_CREATE: "activity.loanCreated",
  LOAN_RETURN: "activity.loanReturned",
  MAINTENANCE_CREATE: "activity.maintenanceCreated",
  MAINTENANCE_RECORD: "activity.maintenanceRecorded",
  CUSTODY_HANDOVER: "activity.custodyHandover",
  CUSTODY_ASSIGNMENT: "activity.custodyAssignment",
  CUSTODY_RELOCATION: "activity.custodyRelocation",
  CUSTODY_TRANSFER: "activity.custodyTransfer",
  CUSTODY_RETURN: "activity.custodyReturn",
  INVENTORY_CREATE: "activity.inventoryCreated",
  INVENTORY_OPEN: "activity.inventoryOpened",
  INVENTORY_VALIDATED: "activity.inventoryValidated",
  INVENTORY_CLOSED: "activity.inventoryClosed",
  PO_CREATE: "activity.poCreated",
  PO_APPROVED: "activity.poApproved",
  PO_REJECTED: "activity.poRejected",
  PO_DELIVERY: "activity.poDelivered",
  REPORT_GENERATE: "activity.reportGenerated",
  IMPORT_COMMIT: "activity.importCommitted",
  DOCUMENT_CREATE: "activity.documentCreated",
  DOCUMENT_VERSION_ADD: "activity.documentVersion",
};
/** عمليات المراجع المشتركة (بلا مؤسسة) التي تظهر في نشاط كل مؤسسة. */
const SHARED_ACTIONS = ["ACADEMY_CREATE", "DIRECTORATE_CREATE"];

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  /**
   * بيانات الرسوم البيانية — كلها من القاعدة لحظة الطلب.
   * السلاسل الشهرية تغطي آخر 12 شهراً (بما فيها الشهر الجاري) حتى لو كانت أصفاراً.
   */
  async charts(schoolId: string, now = new Date()) {
    const p = this.prisma;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      return d.toISOString().slice(0, 7);
    });
    const bucket = () => new Map(months.map((m) => [m, 0]));
    const key = (d: Date) => d.toISOString().slice(0, 7);

    // توزيع الممتلكات حسب التصنيف الأعلى (أكبر 7 + أخرى)
    const byCat = await p.asset.groupBy({ by: ["categoryId"], where: { schoolId, archivedAt: null, status: { not: "DISPOSED" } }, _count: { _all: true } });
    const cats = await p.assetCategory.findMany({ where: { id: { in: byCat.map((c) => c.categoryId) } }, select: { id: true, nameAr: true, nameFr: true } });
    const catName = new Map(cats.map((c) => [c.id, c]));
    const sorted = byCat.map((c) => ({ id: c.categoryId, count: c._count._all })).sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, 7).map((c) => ({ label: catName.get(c.id)?.nameAr ?? "", labelFr: catName.get(c.id)?.nameFr ?? undefined, value: c.count }));
    const rest = sorted.slice(7).reduce((a, c) => a + c.count, 0);
    const assetsByCategory = rest > 0 ? [...top, { label: "", others: true, value: rest }] : top;

    // حالة المخزون
    const items = await p.inventoryItem.findMany({ where: { schoolId, isActive: true }, select: { minQuantity: true, balances: { select: { quantity: true } } } });
    const stockStatus = { ok: 0, low: 0, empty: 0 };
    for (const it of items) {
      const q = it.balances.reduce((a, b) => a + Number(b.quantity), 0);
      if (q <= 0) stockStatus.empty++;
      else if (Number(it.minQuantity) > 0 && q <= Number(it.minQuantity)) stockStatus.low++;
      else stockStatus.ok++;
    }

    // توزيع الوسائل التعليمية (وحدات + كميات)
    const resources = await p.educationalResource.findMany({ where: { schoolId, archivedAt: null }, select: { id: true, trackingMode: true, quantityTotal: true, quantityDamaged: true, units: { select: { status: true } } } });
    const lent = await onLoanQuantity(p, resources.filter((r) => r.trackingMode === "QUANTITY").map((r) => r.id));
    const res = { available: 0, onLoan: 0, damaged: 0, maintenance: 0 };
    for (const r of resources) {
      if (r.trackingMode === "QUANTITY") {
        const l = lent.get(r.id) ?? 0;
        res.onLoan += l;
        res.damaged += r.quantityDamaged;
        res.available += Math.max(0, r.quantityTotal - r.quantityDamaged - l);
      } else
        for (const u of r.units) {
          if (u.status === "AVAILABLE") res.available++;
          else if (u.status === "ON_LOAN") res.onLoan++;
          else if (u.status === "DAMAGED") res.damaged++;
          else if (u.status === "UNDER_MAINTENANCE") res.maintenance++;
        }
    }

    // حالة الإعارات
    const [activeOk, overdue, returned12] = await Promise.all([
      p.resourceLoan.count({ where: { schoolId, status: { in: ["ACTIVE", "PARTIALLY_RETURNED"] }, dueAt: { gte: now } } }),
      p.resourceLoan.count({ where: { schoolId, status: { in: ["ACTIVE", "PARTIALLY_RETURNED"] }, dueAt: { lt: now } } }),
      p.resourceLoan.count({ where: { schoolId, status: "RETURNED", updatedAt: { gte: start } } }),
    ]);

    // الاقتناء الشهري (عدد وقيمة الممتلكات حسب تاريخ الاقتناء)
    const acq = await p.asset.findMany({ where: { schoolId, acquisitionDate: { gte: start } }, select: { acquisitionDate: true, acquisitionValue: true } });
    const acqCount = bucket();
    const acqValue = bucket();
    for (const a of acq) {
      const k = key(a.acquisitionDate!);
      if (!acqCount.has(k)) continue;
      acqCount.set(k, acqCount.get(k)! + 1);
      acqValue.set(k, acqValue.get(k)! + Number(a.acquisitionValue ?? 0));
    }

    // الصيانة الشهرية: طلبات جديدة مقابل مغلقة
    const [opened, closed] = await Promise.all([
      p.maintenanceRequest.findMany({ where: { schoolId, reportedAt: { gte: start } }, select: { reportedAt: true } }),
      p.maintenanceRequest.findMany({ where: { schoolId, closedAt: { gte: start } }, select: { closedAt: true } }),
    ]);
    const mOpen = bucket();
    const mClosed = bucket();
    for (const r of opened) if (mOpen.has(key(r.reportedAt))) mOpen.set(key(r.reportedAt), mOpen.get(key(r.reportedAt))! + 1);
    for (const r of closed) if (r.closedAt && mClosed.has(key(r.closedAt))) mClosed.set(key(r.closedAt), mClosed.get(key(r.closedAt))! + 1);

    // نتائج آخر 5 دورات جرد بعد العد
    const sessions = await p.inventorySession.findMany({ where: { schoolId, status: { in: ["COUNTING_DONE", "VALIDATED", "CLOSED", "ARCHIVED"] } }, orderBy: { startDate: "desc" }, take: 5 });
    const inventoryResults = [];
    for (const s of sessions.reverse()) {
      const d = await this.inventory.discrepancies(schoolId, s.id);
      const missing = d.missing.length + d.notCounted.length;
      const surplus = d.surplus.length + d.unexpected.length;
      inventoryResults.push({ number: s.number, matched: Math.max(0, d.totals.lines - missing - d.misplaced.length - surplus), missing, misplaced: d.misplaced.length, surplus });
    }

    return {
      months,
      assetsByCategory,
      stockStatus,
      resourcesDistribution: res,
      loansStatus: { active: activeOk, overdue, returned12 },
      acquisitions: months.map((m) => ({ month: m, count: acqCount.get(m)!, value: Math.round(acqValue.get(m)! * 100) / 100 })),
      maintenance: months.map((m) => ({ month: m, opened: mOpen.get(m)!, closed: mClosed.get(m)! })),
      inventoryResults,
    };
  }

  /** كل رقم محسوب من القاعدة. الوحدات التي لم تُبنَ بعد (المراحل 4–6) لا سجلات لها، فعدّها صفر فعلي. */
  async stats(schoolId: string) {
    const p = this.prisma;
    const now = new Date();
    const [assets, stockItems, buildings, rooms, facilities, resources, activeLoans, overdueLoans, openMaintenance] = await Promise.all([
      p.asset.count({ where: { schoolId, archivedAt: null, status: { not: "DISPOSED" } } }),
      p.inventoryItem.count({ where: { schoolId, isActive: true } }),
      p.building.count({ where: { schoolId, archivedAt: null } }),
      p.room.count({ where: { schoolId, archivedAt: null } }),
      p.facility.count({ where: { schoolId, archivedAt: null } }),
      p.educationalResource.count({ where: { schoolId, archivedAt: null } }),
      p.resourceLoan.count({ where: { schoolId, status: { in: ["ACTIVE", "PARTIALLY_RETURNED"] } } }),
      p.resourceLoan.count({ where: { schoolId, status: { in: ["ACTIVE", "PARTIALLY_RETURNED"] }, dueAt: { lt: now } } }),
      p.maintenanceRequest.count({ where: { schoolId, status: { notIn: ["REPAIRED", "UNREPAIRABLE", "CLOSED"] } } }),
    ]);
    return { assets, stockItems, buildingsRooms: buildings + rooms, facilities, resources, activeLoans, overdueLoans, openMaintenance };
  }

  async alerts(schoolId: string) {
    const p = this.prisma;
    const stock = await p.$queryRaw<{ low: bigint; out: bigint }[]>`
      SELECT COUNT(*) FILTER (WHERE t.total <= 0 AND (t."minQuantity" > 0 OR t.moved)) AS out,
             COUNT(*) FILTER (WHERE t.total > 0 AND t."minQuantity" > 0 AND t.total <= t."minQuantity") AS low
      FROM (SELECT i.id, i."minQuantity", COALESCE(SUM(b.quantity), 0) AS total,
                   EXISTS (SELECT 1 FROM stock_movements m WHERE m."itemId" = i.id) AS moved
            FROM inventory_items i LEFT JOIN stock_balances b ON b."itemId" = i.id
            WHERE i."schoolId" = ${schoolId}::uuid AND i."isActive" GROUP BY i.id) t`;
    // نفس قاعدة StockService.levelOf
    const [overdue, urgent, damaged, damagedUnits, schedules] = await Promise.all([
      p.resourceLoan.count({ where: { schoolId, status: { in: ["ACTIVE", "PARTIALLY_RETURNED"] }, dueAt: { lt: new Date() } } }),
      p.maintenanceRequest.count({
        where: { schoolId, urgency: { in: ["HIGH", "CRITICAL"] }, status: { notIn: ["REPAIRED", "UNREPAIRABLE", "CLOSED"] } },
      }),
      p.educationalResource.aggregate({ where: { schoolId, archivedAt: null }, _sum: { quantityDamaged: true } }),
      // الوحدات الفردية المعطوبة (الأصناف الكمية تُحسب من quantityDamaged أعلاه)
      p.educationalResourceUnit.count({ where: { status: "DAMAGED", resource: { schoolId, archivedAt: null } } }),
      // صيانة وقائية حلّ موعدها أو اقترب (حسب أيام التذكير لكل جدولة)
      p.maintenanceSchedule.findMany({ where: { schoolId, isActive: true }, select: { nextDueAt: true, remindDaysBefore: true } }),
    ]);
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
    const due = schedules.filter((s) => s.nextDueAt.getTime() - s.remindDaysBefore * 86_400_000 <= today).length;
    const all = [
      { kind: "stockOut", count: Number(stock[0]?.out ?? 0), severity: "high" as const },
      { kind: "loansOverdue", count: overdue, severity: "high" as const },
      { kind: "maintenanceUrgent", count: urgent, severity: "high" as const },
      { kind: "stockLow", count: Number(stock[0]?.low ?? 0), severity: "medium" as const },
      { kind: "maintenanceDue", count: due, severity: "medium" as const },
      { kind: "resourcesDamaged", count: (damaged._sum.quantityDamaged ?? 0) + damagedUnits, severity: "medium" as const },
    ];
    return all.filter((a) => a.count > 0);
  }

  async activity(schoolId: string, limit: number) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: { in: Object.keys(ACTIVITY_KEYS) },
        OR: [{ schoolId }, { schoolId: null, action: { in: SHARED_ACTIONS } }],
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 50),
      include: { user: { select: { fullNameAr: true } } },
    });
    return rows.map((r) => {
      const after = (r.after ?? {}) as { nameAr?: string; username?: string };
      return {
        id: r.id.toString(),
        at: r.createdAt.toISOString(),
        by: r.user?.fullNameAr ?? "",
        action: ACTIVITY_KEYS[r.action]!,
        entity: after.nameAr ?? after.username,
        schoolId: r.schoolId ?? undefined,
      };
    });
  }
}
