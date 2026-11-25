import { Injectable } from "@nestjs/common";
import { Prisma, type MaintenanceStatus } from "@prisma/client";
import { formatNumber, MAINTENANCE_CLOSE_NEEDS_NOTE, MAINTENANCE_TRANSITIONS, matchesQuery } from "@hassan/shared";
import {
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  type MaintenanceRecordInput,
  type MaintenanceRequestInput,
  type MaintenanceScheduleInput,
  type MaintenanceTransitionInput,
} from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { CatalogService } from "../catalog/catalog.service";
import { decodeDataUrl, StorageService } from "../files/storage.service";
import { nextSequence } from "../common/sequences";
import { E } from "../common/errors";
import { compact, UUID_RE } from "../common/util";
import type { AppRequest, AuthUser } from "../common/context";

type Tx = Prisma.TransactionClient;
type TargetType = "asset" | "room" | "facility" | "resourceUnit";
const dateOnly = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
const FIELD: Record<TargetType, "assetId" | "roomId" | "facilityId" | "resourceUnitId"> = { asset: "assetId", room: "roomId", facility: "facilityId", resourceUnit: "resourceUnitId" };
const OPEN: MaintenanceStatus[] = ["NEW", "UNDER_REVIEW", "IN_REPAIR"];

const include = {
  asset: { select: { id: true, inventoryNumber: true, name: true, status: true } },
  room: { select: { id: true, code: true, name: true } },
  facility: { select: { id: true, code: true, name: true } },
  resourceUnit: { select: { id: true, inventoryNumber: true, status: true, resource: { select: { name: true } } } },
  records: { orderBy: { createdAt: "asc" as const }, include: { invoice: { include: { supplier: { select: { name: true } } } } } },
  schedule: { select: { id: true, title: true } },
} satisfies Prisma.MaintenanceRequestInclude;
type Row = Prisma.MaintenanceRequestGetPayload<{ include: typeof include }>;

/**
 * الصيانة: طلب يستهدف كياناً واحداً، بانتقالات حالات محددة، وأثر تلقائي على حالة الهدف:
 * التبليغ عن عطب ← معطل/يحتاج صيانة؛ قيد الإصلاح ← قيد الإصلاح؛ تم الإصلاح ← صالح؛ غير قابل للإصلاح ← معطل/خارج الخدمة.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private catalog: CatalogService,
    private storage: StorageService,
  ) {}

  private targetOf(r: Row) {
    if (r.asset) return { type: "asset" as const, id: r.asset.id, label: `${r.asset.inventoryNumber} — ${r.asset.name}` };
    if (r.room) return { type: "room" as const, id: r.room.id, label: `${r.room.code} — ${r.room.name}` };
    if (r.facility) return { type: "facility" as const, id: r.facility.id, label: `${r.facility.code} — ${r.facility.name}` };
    const u = r.resourceUnit!;
    return { type: "resourceUnit" as const, id: u.id, label: `${u.inventoryNumber} — ${u.resource.name}` };
  }

  private async users(ids: string[]) {
    const rows = ids.length ? await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, fullNameAr: true } }) : [];
    return new Map(rows.map((u) => [u.id, u.fullNameAr]));
  }

  private dto(r: Row, names: Map<string, string>) {
    return compact({
      id: r.id,
      number: r.number,
      target: this.targetOf(r),
      type: r.type,
      damageTypeId: r.damageTypeId,
      description: r.description,
      reportedAt: r.reportedAt.toISOString(),
      reportedBy: names.get(r.reportedById),
      urgency: r.urgency,
      assigneeId: r.assigneeId,
      assignee: r.assigneeId ? names.get(r.assigneeId) : undefined,
      status: r.status,
      hasPhoto: !!r.photoFileId,
      schedule: r.schedule ? { id: r.schedule.id, title: r.schedule.title } : undefined,
      closedAt: r.closedAt?.toISOString(),
      totalCost: r.records.reduce((s, x) => s + Number(x.cost ?? 0), 0),
      records: r.records.map((x) =>
        compact({
          id: x.id,
          contractor: x.contractor,
          cost: x.cost === null ? null : Number(x.cost),
          interventionReport: x.interventionReport,
          startedAt: x.startedAt?.toISOString().slice(0, 10),
          repairedAt: x.repairedAt?.toISOString().slice(0, 10),
          outcome: x.outcome,
          invoice: x.invoice ? { number: x.invoice.invoiceNumber, date: x.invoice.invoiceDate.toISOString().slice(0, 10), amount: Number(x.invoice.amount), supplier: x.invoice.supplier.name } : undefined,
          by: names.get(x.createdById),
          at: x.createdAt.toISOString(),
        }),
      ),
    });
  }

  async list(schoolId: string, f: { q?: string; status?: string; urgency?: string; open?: boolean; targetType?: string; page: number; pageSize: number }) {
    const where: Prisma.MaintenanceRequestWhereInput = {
      schoolId,
      ...(f.open ? { status: { in: OPEN } } : f.status && (MAINTENANCE_TRANSITIONS[f.status] !== undefined) ? { status: f.status as MaintenanceStatus } : {}),
      ...(f.urgency && ["LOW", "NORMAL", "HIGH", "CRITICAL"].includes(f.urgency) ? { urgency: f.urgency as never } : {}),
      ...(f.targetType && f.targetType in FIELD ? { [FIELD[f.targetType as TargetType]]: { not: null } } : {}),
    };
    const rows = await this.prisma.maintenanceRequest.findMany({ where, include, orderBy: [{ reportedAt: "desc" }] });
    const names = await this.users(rows.flatMap((r) => [r.reportedById, r.assigneeId ?? "", ...r.records.map((x) => x.createdById)]).filter(Boolean));
    const all = rows.map((r) => this.dto(r, names)).filter((d) => matchesQuery(f.q ?? "", d.number, d.target.label, d.description));
    return { items: all.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), total: all.length, page: f.page, pageSize: f.pageSize };
  }

  async get(schoolId: string, id: string) {
    const r = await this.prisma.maintenanceRequest.findFirst({ where: { id, schoolId }, include: { ...include, photoFile: true } });
    if (!r) throw E.notFound();
    const names = await this.users([r.reportedById, r.assigneeId ?? "", ...r.records.map((x) => x.createdById)].filter(Boolean));
    return { ...this.dto(r, names), photoDataUrl: (await this.storage.dataUrl(r.photoFile)) ?? undefined };
  }

  /** المسؤولون الممكنون: مستخدمو المؤسسة النشطون. */
  async assignees(schoolId: string) {
    const rows = await this.prisma.user.findMany({
      where: { status: "ACTIVE", roles: { some: { schoolId } } },
      select: { id: true, fullNameAr: true },
      orderBy: { fullNameAr: "asc" },
    });
    return rows;
  }

  private async assertAssignee(schoolId: string, id: string | null | undefined) {
    if (!id) return null;
    const ok = UUID_RE.test(id) && (await this.prisma.user.count({ where: { id, status: "ACTIVE", roles: { some: { schoolId } } } }));
    if (!ok) throw E.validation({ fields: { assigneeId: "errors.invalidChoice" } });
    return id;
  }

  /** يتحقق من أن الهدف من نفس المؤسسة وقابل للصيانة. */
  async assertTarget(schoolId: string, type: TargetType, id: string, field = "targetId") {
    const bad = () => E.validation({ fields: { [field]: "errors.invalidChoice" } });
    if (!UUID_RE.test(id)) throw bad();
    if (type === "asset") {
      const a = await this.prisma.asset.findFirst({ where: { id, schoolId } });
      if (!a) throw bad();
      if (a.archivedAt) throw E.rule("ASSET_ARCHIVED");
    } else if (type === "room") {
      if (!(await this.prisma.room.count({ where: { id, schoolId, archivedAt: null } }))) throw bad();
    } else if (type === "facility") {
      if (!(await this.prisma.facility.count({ where: { id, schoolId, archivedAt: null } }))) throw bad();
    } else {
      const u = await this.prisma.educationalResourceUnit.findFirst({ where: { id, resource: { schoolId } } });
      if (!u || u.status === "DISPOSED") throw bad();
    }
  }

  /** أثر حالة الطلب على حالة الهدف (مع تدقيق على الممتلك ليظهر في سجله). */
  private async applyEffect(tx: Tx, r: { id: string; number: string; type: string; assetId: string | null; roomId: string | null; facilityId: string | null; resourceUnitId: string | null }, phase: "REPORTED" | MaintenanceStatus, req: AppRequest) {
    if (r.assetId) {
      const map: Partial<Record<string, string>> = { REPORTED: "DAMAGED", IN_REPAIR: "UNDER_REPAIR", REPAIRED: "AVAILABLE", UNREPAIRABLE: "DAMAGED" };
      const to = map[phase];
      if (!to) return;
      const a = await tx.asset.findUniqueOrThrow({ where: { id: r.assetId } });
      if (a.archivedAt || a.status === to || (phase === "REPORTED" && a.status !== "AVAILABLE")) return;
      await tx.asset.update({ where: { id: a.id }, data: { status: to as never } });
      await this.audit.log(
        { action: "ASSET_MAINTENANCE_STATUS", entityType: "Asset", entityId: a.id, before: { status: a.status }, after: { status: to, reason: r.number, nameAr: a.name } },
        req,
        tx,
      );
    } else if (r.resourceUnitId) {
      const map: Partial<Record<string, string>> = { REPORTED: "DAMAGED", IN_REPAIR: "UNDER_MAINTENANCE", REPAIRED: "AVAILABLE", UNREPAIRABLE: "DAMAGED" };
      const to = map[phase];
      if (!to) return;
      const u = await tx.educationalResourceUnit.findUniqueOrThrow({ where: { id: r.resourceUnitId } });
      if (u.status === "ON_LOAN") {
        if (phase === "REPORTED") return; // يُصلح بعد إرجاعه
        throw E.rule("UNIT_ON_LOAN");
      }
      if (u.status === "DISPOSED" || u.status === to || (phase === "REPORTED" && u.status !== "AVAILABLE")) return;
      await tx.educationalResourceUnit.update({ where: { id: u.id }, data: { status: to as never } });
    } else {
      const map: Partial<Record<string, string>> = { REPORTED: "NEEDS_MAINTENANCE", IN_REPAIR: "NEEDS_MAINTENANCE", REPAIRED: "GOOD", UNREPAIRABLE: "OUT_OF_SERVICE" };
      const to = map[phase];
      if (!to) return;
      if (r.roomId) {
        const x = await tx.room.findUniqueOrThrow({ where: { id: r.roomId } });
        if (phase === "REPORTED" && x.status !== "GOOD") return;
        if (x.status !== to) await tx.room.update({ where: { id: x.id }, data: { status: to as never } });
      } else if (r.facilityId) {
        const x = await tx.facility.findUniqueOrThrow({ where: { id: r.facilityId } });
        if (phase === "REPORTED" && x.status !== "GOOD") return;
        if (x.status !== to) await tx.facility.update({ where: { id: x.id }, data: { status: to as never } });
      }
    }
  }

  private async number(tx: Tx, schoolId: string) {
    const year = new Date().getFullYear();
    return formatNumber("MR-{YEAR}-{SEQ:5}", { year, seq: await nextSequence(tx, schoolId, "MAINT", year) });
  }

  async create(schoolId: string, i: MaintenanceRequestInput, user: AuthUser, req: AppRequest, scheduleId?: string) {
    if (i.clientOpId) {
      const prev = await this.prisma.auditLog.findFirst({ where: { schoolId, action: "MAINTENANCE_CREATE", after: { path: ["clientOpId"], equals: i.clientOpId } } });
      if (prev?.entityId) return { id: prev.entityId, replayed: true };
    }
    await this.assertTarget(schoolId, i.targetType, i.targetId);
    await this.catalog.assertLookup(schoolId, "DAMAGE_TYPE", i.damageTypeId || null, "damageTypeId");
    const assigneeId = await this.assertAssignee(schoolId, i.assigneeId);
    const photo = i.photoDataUrl ? decodeDataUrl(i.photoDataUrl, LOGO_TYPES, LOGO_MAX_BYTES, "photo") : null;
    return this.prisma.$transaction(async (tx) => {
      const photoFileId = photo ? (await this.storage.save(tx, { schoolId, buf: photo.buf, mime: photo.mime, originalName: "maintenance-photo", uploadedById: user.id })).id : null;
      const r = await tx.maintenanceRequest.create({
        data: {
          schoolId,
          number: await this.number(tx, schoolId),
          [FIELD[i.targetType]]: i.targetId,
          type: i.type,
          damageTypeId: i.damageTypeId || null,
          description: i.description.trim(),
          urgency: i.urgency,
          assigneeId,
          reportedById: user.id,
          photoFileId,
          scheduleId: scheduleId ?? null,
        },
      });
      if (r.type !== "PREVENTIVE") await this.applyEffect(tx, r, "REPORTED", req);
      await this.audit.log(
        { action: "MAINTENANCE_CREATE", entityType: "MaintenanceRequest", entityId: r.id, after: { number: r.number, nameAr: r.number, targetType: i.targetType, urgency: r.urgency, clientOpId: i.clientOpId } },
        req,
        tx,
      );
      return { id: r.id, number: r.number, replayed: false };
    });
  }

  async update(schoolId: string, id: string, i: Pick<MaintenanceRequestInput, "damageTypeId" | "description" | "urgency" | "assigneeId">, req: AppRequest) {
    const before = await this.prisma.maintenanceRequest.findFirst({ where: { id, schoolId } });
    if (!before) throw E.notFound();
    if (before.status === "CLOSED") throw E.rule("MAINTENANCE_CLOSED");
    await this.catalog.assertLookup(schoolId, "DAMAGE_TYPE", i.damageTypeId || null, "damageTypeId");
    const assigneeId = await this.assertAssignee(schoolId, i.assigneeId);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.maintenanceRequest.update({ where: { id }, data: { damageTypeId: i.damageTypeId || null, description: i.description.trim(), urgency: i.urgency, assigneeId } });
      await this.audit.log({ action: "MAINTENANCE_UPDATE", entityType: "MaintenanceRequest", entityId: id, before: { urgency: before.urgency, assigneeId: before.assigneeId }, after: { urgency: r.urgency, assigneeId, nameAr: r.number } }, req, tx);
      return { id };
    });
  }

  /** الانتقال إلى حالة جديدة داخل معاملة مع قفل الطلب: انتقال غير مسموح ← 422 INVALID_TRANSITION. */
  async transition(schoolId: string, id: string, i: MaintenanceTransitionInput, req: AppRequest, tx0?: Tx) {
    const run = async (tx: Tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM maintenance_requests WHERE id = ${id}::uuid AND "schoolId" = ${schoolId}::uuid FOR UPDATE`;
      if (!row) throw E.notFound();
      const r = await tx.maintenanceRequest.findUniqueOrThrow({ where: { id } });
      if (!(MAINTENANCE_TRANSITIONS[r.status] ?? []).includes(i.to)) throw E.rule("INVALID_TRANSITION", { from: r.status, to: i.to });
      if (i.to === "CLOSED" && MAINTENANCE_CLOSE_NEEDS_NOTE.includes(r.status) && !i.note?.trim()) throw E.validation({ fields: { note: "errors.closeNeedsNote" } });
      await this.applyEffect(tx, r, i.to, req);
      await tx.maintenanceRequest.update({ where: { id }, data: { status: i.to, closedAt: i.to === "CLOSED" ? new Date() : null } });
      await this.audit.log(
        { action: "MAINTENANCE_STATUS", entityType: "MaintenanceRequest", entityId: id, before: { status: r.status }, after: { status: i.to, note: i.note || undefined, nameAr: r.number } },
        req,
        tx,
      );
      return { id, status: i.to };
    };
    return tx0 ? run(tx0) : this.prisma.$transaction(run);
  }

  /** تدخل: يسجل الجهة والتكلفة والمحضر (وفاتورة عند الاقتضاء)، ويطبق النتيجة كانتقال. */
  async addRecord(schoolId: string, id: string, i: MaintenanceRecordInput, user: AuthUser, req: AppRequest) {
    const r0 = await this.prisma.maintenanceRequest.findFirst({ where: { id, schoolId } });
    if (!r0) throw E.notFound();
    if (!["UNDER_REVIEW", "IN_REPAIR"].includes(r0.status)) throw E.rule("RECORD_NOT_ALLOWED", { status: r0.status });
    if (i.invoice) {
      await this.catalog.assertSupplier(schoolId, i.invoice.supplierId);
      if (await this.prisma.invoice.count({ where: { supplierId: i.invoice.supplierId, invoiceNumber: i.invoice.invoiceNumber.trim() } })) throw E.conflict("DUPLICATE_INVOICE");
    }
    return this.prisma.$transaction(async (tx) => {
      if (r0.status === "UNDER_REVIEW" && i.outcome !== "UNREPAIRABLE") await this.transition(schoolId, id, { to: "IN_REPAIR" }, req, tx);
      const invoice = i.invoice
        ? await tx.invoice.create({ data: { schoolId, supplierId: i.invoice.supplierId, invoiceNumber: i.invoice.invoiceNumber.trim(), invoiceDate: dateOnly(i.invoice.invoiceDate)!, amount: i.invoice.amount } })
        : null;
      const rec = await tx.maintenanceRecord.create({
        data: {
          requestId: id,
          contractor: i.contractor || null,
          cost: i.cost ?? null,
          interventionReport: i.interventionReport || null,
          startedAt: dateOnly(i.startedAt),
          repairedAt: dateOnly(i.repairedAt),
          outcome: i.outcome,
          supplierInvoiceId: invoice?.id ?? null,
          createdById: user.id,
        },
      });
      if (i.outcome !== "IN_REPAIR") await this.transition(schoolId, id, { to: i.outcome }, req, tx);
      await this.audit.log({ action: "MAINTENANCE_RECORD", entityType: "MaintenanceRequest", entityId: id, after: { nameAr: r0.number, outcome: i.outcome, cost: i.cost ?? null } }, req, tx);
      return { id: rec.id };
    });
  }

  // ---------------- الصيانة الوقائية ----------------
  private async targetLabel(type: string, id: string) {
    if (type === "ASSET") return (await this.prisma.asset.findUnique({ where: { id }, select: { inventoryNumber: true, name: true } }).then((a) => a && `${a.inventoryNumber} — ${a.name}`)) ?? "";
    if (type === "ROOM") return (await this.prisma.room.findUnique({ where: { id } }).then((x) => x && `${x.code} — ${x.name}`)) ?? "";
    if (type === "FACILITY") return (await this.prisma.facility.findUnique({ where: { id } }).then((x) => x && `${x.code} — ${x.name}`)) ?? "";
    return (await this.prisma.educationalResourceUnit.findUnique({ where: { id }, include: { resource: true } }).then((x) => x && `${x.inventoryNumber} — ${x.resource.name}`)) ?? "";
  }

  async schedules(schoolId: string) {
    const rows = await this.prisma.maintenanceSchedule.findMany({ where: { schoolId }, orderBy: { nextDueAt: "asc" } });
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
    return Promise.all(
      rows.map(async (s) => ({
        id: s.id,
        title: s.title,
        targetType: s.targetType.toLowerCase().replace("resource_unit", "resourceUnit"),
        targetId: s.targetId,
        target: await this.targetLabel(s.targetType, s.targetId),
        intervalDays: s.intervalDays,
        nextDueAt: s.nextDueAt.toISOString().slice(0, 10),
        remindDaysBefore: s.remindDaysBefore,
        isActive: s.isActive,
        dueSoon: s.isActive && s.nextDueAt.getTime() - s.remindDaysBefore * 86_400_000 <= today,
        overdue: s.isActive && s.nextDueAt.getTime() < today,
      })),
    );
  }

  private schedType = (t: TargetType) => ({ asset: "ASSET", room: "ROOM", facility: "FACILITY", resourceUnit: "RESOURCE_UNIT" })[t];

  async saveSchedule(schoolId: string, id: string | null, i: MaintenanceScheduleInput, req: AppRequest) {
    await this.assertTarget(schoolId, i.targetType, i.targetId);
    const data = {
      title: i.title.trim(),
      targetType: this.schedType(i.targetType),
      targetId: i.targetId,
      intervalDays: i.intervalDays,
      nextDueAt: dateOnly(i.nextDueAt)!,
      remindDaysBefore: i.remindDaysBefore,
      isActive: i.isActive ?? true,
    };
    if (id && !(await this.prisma.maintenanceSchedule.count({ where: { id, schoolId } }))) throw E.notFound();
    return this.prisma.$transaction(async (tx) => {
      const s = id ? await tx.maintenanceSchedule.update({ where: { id }, data }) : await tx.maintenanceSchedule.create({ data: { schoolId, ...data } });
      await this.audit.log({ action: id ? "MAINTENANCE_SCHEDULE_UPDATE" : "MAINTENANCE_SCHEDULE_CREATE", entityType: "MaintenanceSchedule", entityId: s.id, after: { ...data, nameAr: s.title } }, req, tx);
      return { id: s.id };
    });
  }

  /** ينشئ طلب صيانة وقائية من الجدولة ويؤجل الموعد التالي بالمدة المحددة. */
  async generateFromSchedule(schoolId: string, id: string, user: AuthUser, req: AppRequest) {
    const s = await this.prisma.maintenanceSchedule.findFirst({ where: { id, schoolId } });
    if (!s) throw E.notFound();
    if (!s.isActive) throw E.rule("SCHEDULE_INACTIVE");
    const targetType = ({ ASSET: "asset", ROOM: "room", FACILITY: "facility", RESOURCE_UNIT: "resourceUnit" } as const)[s.targetType as "ASSET"];
    const r = await this.create(schoolId, { targetType, targetId: s.targetId, type: "PREVENTIVE", description: s.title, urgency: "NORMAL", damageTypeId: null, assigneeId: null }, user, req, s.id);
    await this.prisma.maintenanceSchedule.update({ where: { id }, data: { nextDueAt: new Date(s.nextDueAt.getTime() + s.intervalDays * 86_400_000) } });
    return r;
  }
}
