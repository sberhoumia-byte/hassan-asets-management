import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
};
/** عمليات المراجع المشتركة (بلا مؤسسة) التي تظهر في نشاط كل مؤسسة. */
const SHARED_ACTIONS = ["ACADEMY_CREATE", "DIRECTORATE_CREATE"];

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

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
    const [overdue, urgent, damaged, damagedUnits] = await Promise.all([
      p.resourceLoan.count({ where: { schoolId, status: { in: ["ACTIVE", "PARTIALLY_RETURNED"] }, dueAt: { lt: new Date() } } }),
      p.maintenanceRequest.count({
        where: { schoolId, urgency: { in: ["HIGH", "CRITICAL"] }, status: { notIn: ["REPAIRED", "UNREPAIRABLE", "CLOSED"] } },
      }),
      p.educationalResource.aggregate({ where: { schoolId, archivedAt: null }, _sum: { quantityDamaged: true } }),
      // الوحدات الفردية المعطوبة (الأصناف الكمية تُحسب من quantityDamaged أعلاه)
      p.educationalResourceUnit.count({ where: { status: "DAMAGED", resource: { schoolId, archivedAt: null } } }),
    ]);
    const all = [
      { kind: "stockOut", count: Number(stock[0]?.out ?? 0), severity: "high" as const },
      { kind: "loansOverdue", count: overdue, severity: "high" as const },
      { kind: "maintenanceUrgent", count: urgent, severity: "high" as const },
      { kind: "stockLow", count: Number(stock[0]?.low ?? 0), severity: "medium" as const },
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

  async notifications(userId: string) {
    const rows = await this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map((n) => ({ id: n.id, at: n.createdAt.toISOString(), titleKey: n.title, readAt: n.readAt?.toISOString() }));
  }
}
