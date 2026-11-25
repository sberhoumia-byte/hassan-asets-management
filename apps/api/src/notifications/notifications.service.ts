import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { NotificationType, Prisma } from "@prisma/client";
import type { AppRequest, AuthUser } from "../common/context";
import { E } from "../common/errors";
import { UUID_RE } from "../common/util";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "../rbac/access.service";
import { StockService } from "../stock/stock.service";

/** أنواع التنبيهات التي يولدها الفحص الدوري (DELIVERY_RECEIVED وSYSTEM غير مولدة بعد). */
export const SCHEDULED_TYPES: NotificationType[] = [
  "STOCK_OUT",
  "STOCK_LOW",
  "STOCK_EXPIRY",
  "LOAN_OVERDUE",
  "MAINTENANCE_URGENT",
  "MAINTENANCE_DUE",
  "APPROVAL_REQUEST",
  "INVENTORY_SESSION",
  "DOCUMENT_EXPIRY",
];
const DOC_EXPIRY_DAYS = 30;

/** شرط قائم يستحق تنبيهاً. المفتاح يحدد «نوبة» الشرط: لا يتكرر التنبيه ما دام الشرط قائماً. */
interface Candidate {
  type: NotificationType;
  key: string;
  vars: Record<string, string | number>;
  entityType: string;
  entityId: string;
  /** من يتلقاه: صلاحية في المؤسسة، أو مستخدمون محددون. */
  perm?: string;
  users?: string[];
  role?: string;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * التنبيهات المجدولة: فحص دوري لكل مؤسسة يحوّل الشروط القائمة (نفاد المخزون، إعارة متأخرة، صيانة مستعجلة أو حلّ موعدها،
 * مصادقة منتظرة، دورة جرد مفتوحة للمكلَّف، وثيقة تقترب صلاحيتها) إلى إشعارات داخل التطبيق.
 * عدم التكرار: (userId, dedupeKey) فريد؛ عند زوال الشرط يُفرَّغ المفتاح فيُعاد التنبيه إن عاد الشرط لاحقاً.
 * المستلمون حسب صلاحياتهم الفعلية وتفضيلاتهم. الإشعار نفسه لا يُحذف (يُعلَّم مقروءاً).
 */
@Injectable()
export class NotificationsService implements OnApplicationShutdown {
  private log = new Logger("Notifications");
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private stock: StockService,
  ) {}

  /** يُستدعى من main.ts فقط (لا يعمل داخل الاختبارات). */
  startScheduler() {
    const min = config().NOTIFY_INTERVAL_MINUTES;
    if (!min) return;
    const tick = () => void this.runAll().catch((e) => this.log.error(e instanceof Error ? e.stack : String(e)));
    setTimeout(tick, 5_000).unref();
    this.timer = setInterval(tick, min * 60_000);
    this.timer.unref();
    this.log.log(`scheduled every ${min} min`);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async runAll() {
    if (this.running) return;
    this.running = true;
    try {
      const schools = await this.prisma.school.findMany({ select: { id: true } });
      for (const s of schools) await this.run(s.id);
    } finally {
      this.running = false;
    }
  }

  // ------------------------------------------------------------------ الشروط
  private async candidates(schoolId: string): Promise<Candidate[]> {
    const p = this.prisma;
    const now = new Date();
    const today = new Date(`${day(now)}T00:00:00Z`);
    const out: Candidate[] = [];

    const st = await this.stock.alerts(schoolId);
    for (const i of st.out) out.push({ type: "STOCK_OUT", key: `STOCK_OUT:${i.id}`, vars: { name: i.name, code: i.code }, entityType: "InventoryItem", entityId: i.id, perm: "stock.view" });
    for (const i of st.low)
      out.push({ type: "STOCK_LOW", key: `STOCK_LOW:${i.id}`, vars: { name: i.name, code: i.code, total: i.total, min: i.minQuantity }, entityType: "InventoryItem", entityId: i.id, perm: "stock.view" });
    for (const m of st.expiring)
      out.push({ type: "STOCK_EXPIRY", key: `STOCK_EXPIRY:${m.movement}`, vars: { name: m.name, date: m.expiryDate, warehouse: m.warehouse }, entityType: "InventoryItem", entityId: m.itemId, perm: "stock.view" });

    const loans = await p.resourceLoan.findMany({
      where: { schoolId, status: { in: ["ACTIVE", "PARTIALLY_RETURNED"] }, dueAt: { lt: now } },
      include: { resource: { select: { name: true } }, borrower: { select: { fullNameAr: true } } },
    });
    for (const l of loans)
      out.push({ type: "LOAN_OVERDUE", key: `LOAN_OVERDUE:${l.id}`, vars: { number: l.number, name: l.resource.name, borrower: l.borrower.fullNameAr, due: day(l.dueAt) }, entityType: "ResourceLoan", entityId: l.id, perm: "loans.view" });

    const urgent = await p.maintenanceRequest.findMany({ where: { schoolId, urgency: { in: ["HIGH", "CRITICAL"] }, status: { notIn: ["REPAIRED", "UNREPAIRABLE", "CLOSED"] } } });
    for (const m of urgent)
      out.push({ type: "MAINTENANCE_URGENT", key: `MAINTENANCE_URGENT:${m.id}`, vars: { number: m.number, text: m.description.slice(0, 80) }, entityType: "MaintenanceRequest", entityId: m.id, perm: "maintenance.view" });

    const schedules = await p.maintenanceSchedule.findMany({ where: { schoolId, isActive: true } });
    for (const s of schedules) {
      if (s.nextDueAt.getTime() - s.remindDaysBefore * 86_400_000 > today.getTime()) continue;
      // المفتاح يتضمن الموعد: بعد توليد الطلب يتأجل الموعد فيصير تنبيهاً جديداً عند حلوله
      out.push({ type: "MAINTENANCE_DUE", key: `MAINTENANCE_DUE:${s.id}:${day(s.nextDueAt)}`, vars: { title: s.title, date: day(s.nextDueAt) }, entityType: "MaintenanceSchedule", entityId: s.id, perm: "maintenance.view" });
    }

    const pending = await p.purchaseOrder.findMany({
      where: { schoolId, status: "PENDING_APPROVAL" },
      include: { approvals: { include: { step: true }, orderBy: { step: { stepOrder: "asc" } } } },
    });
    for (const po of pending) {
      const next = po.approvals.find((a) => a.decision === "PENDING");
      if (!next) continue;
      out.push({
        type: "APPROVAL_REQUEST",
        key: `APPROVAL_REQUEST:${po.id}:${next.stepId}`,
        vars: { number: po.number, title: po.title, step: next.step.name },
        entityType: "PurchaseOrder",
        entityId: po.id,
        ...(next.step.requiredRoleCode ? { role: next.step.requiredRoleCode } : { perm: "purchasing.approve" }),
      });
    }

    const sessions = await p.inventorySession.findMany({ where: { schoolId, status: "OPEN" }, include: { assignees: true } });
    for (const s of sessions)
      out.push({ type: "INVENTORY_SESSION", key: `INVENTORY_SESSION:${s.id}:OPEN`, vars: { number: s.number, end: day(s.endDate) }, entityType: "InventorySession", entityId: s.id, users: s.assignees.map((a) => a.userId) });

    const docs = await p.document.findMany({ where: { schoolId, archivedAt: null, expiresAt: { not: null, lte: new Date(today.getTime() + DOC_EXPIRY_DAYS * 86_400_000) } } });
    for (const d of docs)
      out.push({
        type: "DOCUMENT_EXPIRY",
        key: `DOCUMENT_EXPIRY:${d.id}:${day(d.expiresAt!)}`,
        vars: { title: d.title, date: day(d.expiresAt!) },
        entityType: "Document",
        entityId: d.id,
        // الوثيقة المقيدة لا يُنبَّه بها إلا من يراها
        perm: d.accessLevel === "RESTRICTED" ? "documents.update" : "documents.view",
      });
    return out;
  }

  /** مستخدمو المؤسسة (بأدوار فيها) ومديرو النظام، مع صلاحياتهم الفعلية وأدوارهم في المؤسسة. */
  private async audience(schoolId: string) {
    const rows = await this.prisma.userRole.findMany({
      where: { OR: [{ schoolId }, { role: { code: "ADMIN" } }], user: { status: "ACTIVE" } },
      select: { userId: true, schoolId: true, role: { select: { code: true } } },
    });
    const users = new Map<string, { perms: Set<string>; roles: Set<string>; admin: boolean }>();
    for (const r of rows) {
      const u = users.get(r.userId) ?? { perms: new Set<string>(), roles: new Set<string>(), admin: false };
      if (r.role.code === "ADMIN") u.admin = true;
      if (r.schoolId === schoolId) u.roles.add(r.role.code);
      users.set(r.userId, u);
    }
    for (const [id, u] of users) u.perms = await this.access.permissions(id, schoolId);
    return users;
  }

  /** فحص مؤسسة واحدة. قفل استشاري يمنع تشغيلين متزامنين لنفس المؤسسة. يعيد عدد الإشعارات الجديدة. */
  async run(schoolId: string): Promise<{ created: number; active: number }> {
    const cands = await this.candidates(schoolId);
    const audience = await this.audience(schoolId);
    const prefs = await this.prisma.notificationPreference.findMany({ where: { channel: "IN_APP", enabled: false, userId: { in: [...audience.keys()] } } });
    const off = new Set(prefs.map((p) => `${p.userId}:${p.type}`));

    const rows: Prisma.NotificationCreateManyInput[] = [];
    for (const c of cands) {
      const to = [...audience.entries()]
        .filter(([id, u]) => {
          if (c.users) return c.users.includes(id);
          if (c.role) return u.roles.has(c.role) || u.admin;
          return u.perms.has(c.perm!);
        })
        .map(([id]) => id);
      for (const userId of to) {
        if (off.has(`${userId}:${c.type}`)) continue;
        rows.push({ schoolId, userId, type: c.type, title: `notif.${c.type}`, body: JSON.stringify(c.vars), entityType: c.entityType, entityId: c.entityId, dedupeKey: c.key });
      }
    }
    const keys = cands.map((c) => c.key);
    return this.prisma.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${"notify:" + schoolId})) AS locked`;
      if (!lock[0]?.locked) return { created: 0, active: cands.length };
      // الشروط الزائلة: يُفرَّغ مفتاحها (يبقى الإشعار في السجل) ليُنبَّه من جديد إن عاد الشرط
      await tx.notification.updateMany({ where: { schoolId, type: { in: SCHEDULED_TYPES }, dedupeKey: { not: null, notIn: keys.length ? keys : ["-"] } }, data: { dedupeKey: null } });
      const r = rows.length ? await tx.notification.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
      if (loansNotified(cands).length) await tx.resourceLoan.updateMany({ where: { id: { in: loansNotified(cands) }, overdueNotifiedAt: null }, data: { overdueNotifiedAt: new Date() } });
      return { created: r.count, active: cands.length };
    });
  }

  // ------------------------------------------------------------------ واجهة المستخدم
  private async schoolsOf(user: AuthUser) {
    const v = await this.access.visibleSchoolIds(user.id);
    return v === "ALL" ? undefined : v;
  }

  async list(user: AuthUser, f: { unread?: boolean; limit?: number }) {
    const schools = await this.schoolsOf(user);
    const where: Prisma.NotificationWhereInput = { userId: user.id, ...(schools ? { schoolId: { in: schools } } : {}), ...(f.unread ? { readAt: null } : {}) };
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(f.limit ?? 50, 1), 200) }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      unread,
      items: rows.map((n) => ({
        id: n.id,
        at: n.createdAt.toISOString(),
        type: n.type,
        titleKey: n.title,
        vars: safeVars(n.body),
        schoolId: n.schoolId,
        entityType: n.entityType ?? undefined,
        entityId: n.entityId ?? undefined,
        readAt: n.readAt?.toISOString(),
      })),
    };
  }

  async markRead(user: AuthUser, id: string) {
    if (!UUID_RE.test(id)) throw E.notFound();
    const r = await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    if (!r.count && !(await this.prisma.notification.count({ where: { id, userId: user.id } }))) throw E.notFound();
    return { ok: true };
  }

  async markAllRead(user: AuthUser) {
    const r = await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { updated: r.count };
  }

  async preferences(user: AuthUser) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId: user.id, channel: "IN_APP" } });
    const off = new Set(rows.filter((r) => !r.enabled).map((r) => r.type));
    return SCHEDULED_TYPES.map((type) => ({ type, enabled: !off.has(type) }));
  }

  async setPreferences(user: AuthUser, items: { type: string; enabled: boolean }[], req: AppRequest) {
    for (const i of items) if (!SCHEDULED_TYPES.includes(i.type as NotificationType)) throw E.validation({ fields: { type: "errors.invalidChoice" } });
    await this.prisma.$transaction(
      items.map((i) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_type_channel: { userId: user.id, type: i.type as NotificationType, channel: "IN_APP" } },
          create: { userId: user.id, type: i.type as NotificationType, channel: "IN_APP", enabled: i.enabled },
          update: { enabled: i.enabled },
        }),
      ),
    );
    void req;
    return this.preferences(user);
  }
}

const loansNotified = (c: Candidate[]) => c.filter((x) => x.type === "LOAN_OVERDUE").map((x) => x.entityId);

function safeVars(body: string | null): Record<string, string | number> {
  if (!body) return {};
  try {
    const v = JSON.parse(body) as unknown;
    return v && typeof v === "object" ? (v as Record<string, string | number>) : {};
  } catch {
    return {};
  }
}
