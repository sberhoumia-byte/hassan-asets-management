import { Injectable } from "@nestjs/common";
import { Prisma, type InventorySessionStatus } from "@prisma/client";
import { formatNumber } from "@hassan/shared";
import type { InventoryCountInput, InventorySessionInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { SpacesService } from "../spaces/spaces.service";
import { onLoanQuantity } from "../resources/resources.service";
import { nextSequence } from "../common/sequences";
import { E } from "../common/errors";
import { compact, UUID_RE } from "../common/util";
import type { AppRequest, AuthUser } from "../common/context";

type Tx = Prisma.TransactionClient;
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));

const lineInclude = {
  asset: { select: { inventoryNumber: true, name: true } },
  resource: { select: { code: true, name: true } },
  resourceUnit: { select: { inventoryNumber: true, resource: { select: { name: true } } } },
  stockItem: { select: { code: true, name: true } },
} satisfies Prisma.InventorySessionItemInclude;
type Line = Prisma.InventorySessionItemGetPayload<{ include: typeof lineInclude }>;

/**
 * الجرد المادي: عند الفتح تُؤخذ لقطة «نظرية» ثابتة من السجلات (لا تتغير بعدها مهما تغيّرت البيانات)،
 * ثم يُسجَّل الموجود فعلياً سطراً سطراً (أو بمسح QR)، وتُستخرج الفروقات، ثم المحضر والمصادقة والإغلاق.
 * الجرد لا يعدّل الأرصدة ولا البطاقات تلقائياً: كل تسوية تمر عبر وحدتها (حركة تسوية في المخزون مثلاً).
 */
@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private spaces: SpacesService,
  ) {}

  private label(l: Line) {
    if (l.asset) return { ref: l.asset.inventoryNumber, name: l.asset.name };
    if (l.resourceUnit) return { ref: l.resourceUnit.inventoryNumber, name: l.resourceUnit.resource.name };
    if (l.resource) return { ref: l.resource.code, name: l.resource.name };
    return { ref: l.stockItem?.code ?? "", name: l.stockItem?.name ?? "" };
  }

  /** نوع الفرق في سطر (null = مطابق أو لم يُعدّ بعد خلال العد). */
  private issues(l: { expectedQty: Prisma.Decimal; countedQty: Prisma.Decimal | null; expectedRoomId: string | null; foundRoomId: string | null; isUnexpected: boolean }, countingOver: boolean) {
    const out: string[] = [];
    const exp = Number(l.expectedQty);
    const cnt = num(l.countedQty);
    if (l.isUnexpected) out.push("UNEXPECTED");
    if (cnt === null) {
      if (countingOver && exp > 0) out.push("NOT_COUNTED");
    } else if (cnt < exp) out.push("MISSING");
    else if (cnt > exp && !l.isUnexpected) out.push("SURPLUS");
    if (cnt !== null && cnt > 0 && l.foundRoomId && l.expectedRoomId && l.foundRoomId !== l.expectedRoomId) out.push("MISPLACED");
    return out;
  }

  private async rooms(ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = list.length ? await this.prisma.room.findMany({ where: { id: { in: list } }, select: { id: true, code: true, name: true } }) : [];
    return new Map(rows.map((r) => [r.id, `${r.code} — ${r.name}`]));
  }

  private lineDto(l: Line, rooms: Map<string, string>, over: boolean) {
    const lb = this.label(l);
    return compact({
      id: l.id,
      kind: l.kind,
      ref: lb.ref,
      name: lb.name,
      expectedRoomId: l.expectedRoomId,
      expectedRoom: l.expectedRoomId ? rooms.get(l.expectedRoomId) : undefined,
      foundRoomId: l.foundRoomId,
      foundRoom: l.foundRoomId ? rooms.get(l.foundRoomId) : undefined,
      expectedQty: Number(l.expectedQty),
      countedQty: num(l.countedQty),
      conditionFound: l.conditionFound,
      isUnexpected: l.isUnexpected,
      notes: l.notes,
      countedAt: l.countedAt?.toISOString(),
      issues: this.issues(l, over),
    });
  }

  private sessionInclude = {
    scopes: { include: { room: { select: { id: true, code: true, name: true } } } },
    assignees: true,
    items: { select: { expectedQty: true, countedQty: true, expectedRoomId: true, foundRoomId: true, isUnexpected: true } },
  } satisfies Prisma.InventorySessionInclude;

  private async sessionDto(s: Prisma.InventorySessionGetPayload<{ include: InventoryService["sessionInclude"] }>) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...s.assignees.map((a) => a.userId), s.validatedById ?? s.createdById, s.createdById] } }, select: { id: true, fullNameAr: true } });
    const names = new Map(users.map((u) => [u.id, u.fullNameAr]));
    const over = !["DRAFT", "OPEN"].includes(s.status);
    const withIssue = s.items.filter((l) => this.issues(l, over).length > 0).length;
    return compact({
      id: s.id,
      number: s.number,
      type: s.type,
      status: s.status,
      startDate: s.startDate.toISOString().slice(0, 10),
      endDate: s.endDate.toISOString().slice(0, 10),
      includesStock: s.includesStock,
      rooms: s.scopes.map((x) => ({ id: x.room.id, label: `${x.room.code} — ${x.room.name}` })),
      assignees: s.assignees.map((a) => ({ id: a.userId, name: names.get(a.userId) ?? "" })),
      reportNotes: s.reportNotes,
      validatedBy: s.validatedById ? names.get(s.validatedById) : undefined,
      validatedAt: s.validatedAt?.toISOString(),
      closedAt: s.closedAt?.toISOString(),
      createdBy: names.get(s.createdById),
      createdAt: s.createdAt.toISOString(),
      stats: { lines: s.items.length, counted: s.items.filter((l) => l.countedQty !== null).length, withIssue },
    });
  }

  async list(schoolId: string) {
    const rows = await this.prisma.inventorySession.findMany({ where: { schoolId }, include: this.sessionInclude, orderBy: { createdAt: "desc" } });
    return Promise.all(rows.map((s) => this.sessionDto(s)));
  }

  async get(schoolId: string, id: string) {
    const s = await this.prisma.inventorySession.findFirst({ where: { id, schoolId }, include: this.sessionInclude });
    if (!s) throw E.notFound();
    return this.sessionDto(s);
  }

  async lines(schoolId: string, id: string, f: { roomId?: string; filter?: string; q?: string }) {
    const s = await this.prisma.inventorySession.findFirst({ where: { id, schoolId } });
    if (!s) throw E.notFound();
    const where: Prisma.InventorySessionItemWhereInput = {
      sessionId: id,
      ...(f.roomId && UUID_RE.test(f.roomId) ? { OR: [{ expectedRoomId: f.roomId }, { foundRoomId: f.roomId }] } : {}),
      ...(f.filter === "pending" ? { countedQty: null } : f.filter === "counted" ? { countedQty: { not: null } } : {}),
    };
    const rows = await this.prisma.inventorySessionItem.findMany({ where, include: lineInclude, orderBy: [{ kind: "asc" }, { id: "asc" }] });
    const rooms = await this.rooms(rows.flatMap((l) => [l.expectedRoomId, l.foundRoomId]));
    const over = !["DRAFT", "OPEN"].includes(s.status);
    let out = rows.map((l) => this.lineDto(l, rooms, over));
    if (f.filter === "issues") out = out.filter((l) => l.issues.length > 0);
    const q = (f.q ?? "").trim().toLowerCase();
    if (q) out = out.filter((l) => l.ref.toLowerCase().includes(q) || l.name.toLowerCase().includes(q));
    return out.sort((a, b) => a.ref.localeCompare(b.ref));
  }

  /** ملخص الفروقات حسب النوع (للمحضر). */
  async discrepancies(schoolId: string, id: string) {
    const lines = await this.lines(schoolId, id, {});
    const by = (k: string) => lines.filter((l) => l.issues.includes(k));
    return {
      missing: by("MISSING"),
      notCounted: by("NOT_COUNTED"),
      surplus: by("SURPLUS"),
      unexpected: by("UNEXPECTED"),
      misplaced: by("MISPLACED"),
      condition: lines.filter((l) => !!l.conditionFound),
      totals: { lines: lines.length, counted: lines.filter((l) => l.countedQty !== undefined).length },
    };
  }

  private async assertUsers(schoolId: string, ids: string[]) {
    if (!ids.length) return;
    const n = await this.prisma.user.count({ where: { id: { in: ids }, status: "ACTIVE", roles: { some: { schoolId } } } });
    if (n !== new Set(ids).size) throw E.validation({ fields: { assigneeIds: "errors.invalidChoice" } });
  }

  private async assertRooms(schoolId: string, ids: string[]) {
    if (!ids.length) return;
    const n = await this.prisma.room.count({ where: { id: { in: ids }, schoolId } });
    if (n !== new Set(ids).size) throw E.validation({ fields: { roomIds: "errors.invalidChoice" } });
  }

  async create(schoolId: string, i: InventorySessionInput, user: AuthUser, req: AppRequest) {
    await this.assertRooms(schoolId, i.roomIds);
    await this.assertUsers(schoolId, i.assigneeIds);
    return this.prisma.$transaction(async (tx) => {
      const year = Number(i.startDate.slice(0, 4));
      const number = formatNumber("INV-{YEAR}-{SEQ:3}", { year, seq: await nextSequence(tx, schoolId, "INV_SESSION", year) });
      const s = await tx.inventorySession.create({
        data: {
          schoolId,
          number,
          type: i.type,
          startDate: day(i.startDate),
          endDate: day(i.endDate),
          includesStock: i.includesStock,
          createdById: user.id,
          scopes: { create: [...new Set(i.roomIds)].map((roomId) => ({ roomId })) },
          assignees: { create: [...new Set(i.assigneeIds)].map((userId) => ({ userId })) },
        },
      });
      await this.audit.log({ action: "INVENTORY_CREATE", entityType: "InventorySession", entityId: s.id, after: { number, nameAr: number, type: i.type } }, req, tx);
      return { id: s.id, number };
    });
  }

  async update(schoolId: string, id: string, i: InventorySessionInput, req: AppRequest) {
    const s = await this.prisma.inventorySession.findFirst({ where: { id, schoolId } });
    if (!s) throw E.notFound();
    if (s.status !== "DRAFT") throw E.rule("SESSION_NOT_DRAFT");
    await this.assertRooms(schoolId, i.roomIds);
    await this.assertUsers(schoolId, i.assigneeIds);
    return this.prisma.$transaction(async (tx) => {
      await tx.inventorySessionScope.deleteMany({ where: { sessionId: id } });
      await tx.inventorySessionAssignee.deleteMany({ where: { sessionId: id } });
      await tx.inventorySession.update({
        where: { id },
        data: {
          type: i.type,
          startDate: day(i.startDate),
          endDate: day(i.endDate),
          includesStock: i.includesStock,
          scopes: { create: [...new Set(i.roomIds)].map((roomId) => ({ roomId })) },
          assignees: { create: [...new Set(i.assigneeIds)].map((userId) => ({ userId })) },
        },
      });
      await this.audit.log({ action: "INVENTORY_UPDATE", entityType: "InventorySession", entityId: id, after: { nameAr: s.number, rooms: i.roomIds.length } }, req, tx);
      return { id };
    });
  }

  /** انتقال حالة مع قفل الدورة؛ الحالة الحالية يجب أن تكون from. */
  private async move(schoolId: string, id: string, from: InventorySessionStatus[], to: InventorySessionStatus, req: AppRequest, extra: (tx: Tx, s: { id: string; number: string; includesStock: boolean }) => Promise<Prisma.InventorySessionUpdateInput | void> = async () => {}) {
    return this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ status: InventorySessionStatus }[]>`SELECT status FROM inventory_sessions WHERE id = ${id}::uuid AND "schoolId" = ${schoolId}::uuid FOR UPDATE`;
        if (!row) throw E.notFound();
        if (!from.includes(row.status)) throw E.rule("INVALID_TRANSITION", { from: row.status, to });
        const s = await tx.inventorySession.findUniqueOrThrow({ where: { id } });
        const data = (await extra(tx, s)) ?? {};
        await tx.inventorySession.update({ where: { id }, data: { status: to, ...data } });
        await this.audit.log({ action: `INVENTORY_${to}`, entityType: "InventorySession", entityId: id, before: { status: row.status }, after: { status: to, nameAr: s.number } }, req, tx);
        return { id, status: to };
      },
      { timeout: 60_000 },
    );
  }

  /** الفتح: لقطة نظرية ثابتة لما يجب أن يوجد في الفضاءات المحددة (أو المؤسسة كلها). */
  async open(schoolId: string, id: string, req: AppRequest) {
    return this.move(schoolId, id, ["DRAFT"], "OPEN", req, async (tx, s) => {
      const scope = (await tx.inventorySessionScope.findMany({ where: { sessionId: id } })).map((x) => x.roomId);
      const inScope = scope.length ? { roomId: { in: scope } } : {};
      const assets = await tx.asset.findMany({ where: { schoolId, archivedAt: null, status: { not: "DISPOSED" }, ...inScope }, select: { id: true, roomId: true, quantity: true } });
      const units = await tx.educationalResourceUnit.findMany({
        where: { status: { not: "DISPOSED" }, resource: { schoolId, archivedAt: null }, ...inScope },
        select: { id: true, roomId: true, status: true },
      });
      const qres = await tx.educationalResource.findMany({ where: { schoolId, archivedAt: null, trackingMode: "QUANTITY", ...inScope }, select: { id: true, roomId: true, quantityTotal: true } });
      const lent = await onLoanQuantity(tx, qres.map((r) => r.id));
      const lines: Prisma.InventorySessionItemCreateManyInput[] = [
        ...assets.map((a) => ({ sessionId: id, kind: "ASSET" as const, assetId: a.id, expectedRoomId: a.roomId, expectedQty: a.quantity })),
        // الوحدة المعارة غير موجودة فعلياً في مكانها: متوقعها صفر مع ملاحظة
        ...units.map((u) => ({ sessionId: id, kind: "RESOURCE_UNIT" as const, resourceUnitId: u.id, expectedRoomId: u.roomId, expectedQty: u.status === "ON_LOAN" ? 0 : 1, notes: u.status === "ON_LOAN" ? "ON_LOAN" : null })),
        ...qres.map((r) => ({ sessionId: id, kind: "RESOURCE_QUANTITY" as const, resourceId: r.id, expectedRoomId: r.roomId, expectedQty: Math.max(0, r.quantityTotal - (lent.get(r.id) ?? 0)) })),
      ];
      if (s.includesStock) {
        const items = await tx.inventoryItem.findMany({ where: { schoolId, isActive: true }, select: { id: true, balances: { select: { quantity: true } } } });
        lines.push(...items.map((it) => ({ sessionId: id, kind: "STOCK_ITEM" as const, stockItemId: it.id, expectedQty: it.balances.reduce((n, b) => n.add(b.quantity), new Prisma.Decimal(0)) })));
      }
      if (lines.length) await tx.inventorySessionItem.createMany({ data: lines });
    });
  }

  private async assertCounter(schoolId: string, sessionId: string, req: AppRequest, user: AuthUser) {
    const assignees = await this.prisma.inventorySessionAssignee.findMany({ where: { sessionId } });
    if (assignees.length && !assignees.some((a) => a.userId === user.id) && !req.permissions?.has("inventory.validate")) throw E.forbidden("inventory.assignee");
    void schoolId;
  }

  /** تسجيل الموجود فعلياً لسطر (أو بمسح QR؛ ممتلك/وحدة خارج اللقطة يُضاف «غير متوقع»). */
  async count(schoolId: string, id: string, i: InventoryCountInput, user: AuthUser, req: AppRequest) {
    const s = await this.prisma.inventorySession.findFirst({ where: { id, schoolId } });
    if (!s) throw E.notFound();
    if (s.status !== "OPEN") throw E.rule("SESSION_NOT_OPEN");
    await this.assertCounter(schoolId, id, req, user);
    if (i.clientOpId) {
      const prev = await this.prisma.inventorySessionItem.findUnique({ where: { clientOpId: i.clientOpId } });
      if (prev) return { lineId: prev.id, replayed: true };
    }
    if (i.foundRoomId) await this.spaces.assertRoom(schoolId, i.foundRoomId, "foundRoomId");

    let lineId = i.lineId || null;
    let unexpected: Prisma.InventorySessionItemCreateManyInput | null = null;
    if (!lineId && i.qrToken) {
      if (!UUID_RE.test(i.qrToken)) throw E.rule("QR_UNKNOWN");
      const a = await this.prisma.asset.findFirst({ where: { qrToken: i.qrToken, schoolId } });
      const u = a ? null : await this.prisma.educationalResourceUnit.findFirst({ where: { qrToken: i.qrToken, resource: { schoolId } } });
      if (!a && !u) throw E.rule("QR_UNKNOWN");
      const found = await this.prisma.inventorySessionItem.findFirst({ where: { sessionId: id, ...(a ? { assetId: a.id } : { resourceUnitId: u!.id }) } });
      if (found) lineId = found.id;
      else
        unexpected = a
          ? { sessionId: id, kind: "ASSET", assetId: a.id, expectedRoomId: a.roomId, expectedQty: 0, isUnexpected: true }
          : { sessionId: id, kind: "RESOURCE_UNIT", resourceUnitId: u!.id, expectedRoomId: u!.roomId, expectedQty: 0, isUnexpected: true };
    }
    return this.prisma.$transaction(async (tx) => {
      const data = {
        countedQty: i.countedQty,
        foundRoomId: i.foundRoomId || null,
        conditionFound: i.conditionFound || null,
        notes: i.notes || null,
        countedById: user.id,
        countedAt: new Date(),
        clientOpId: i.clientOpId ?? null,
      };
      let line;
      if (unexpected) line = await tx.inventorySessionItem.create({ data: { ...(unexpected as Prisma.InventorySessionItemUncheckedCreateInput), ...data } });
      else {
        if (!lineId || !UUID_RE.test(lineId)) throw E.validation({ fields: { lineId: "errors.invalidChoice" } });
        const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM inventory_session_items WHERE id = ${lineId}::uuid AND "sessionId" = ${id}::uuid FOR UPDATE`;
        if (!locked) throw E.validation({ fields: { lineId: "errors.invalidChoice" } });
        line = await tx.inventorySessionItem.update({ where: { id: lineId }, data });
      }
      return { lineId: line.id, replayed: false, unexpected: !!unexpected };
    });
  }

  complete(schoolId: string, id: string, req: AppRequest) {
    return this.move(schoolId, id, ["OPEN"], "COUNTING_DONE", req);
  }
  reopen(schoolId: string, id: string, req: AppRequest) {
    return this.move(schoolId, id, ["COUNTING_DONE"], "OPEN", req);
  }
  validate(schoolId: string, id: string, reportNotes: string, user: AuthUser, req: AppRequest) {
    return this.move(schoolId, id, ["COUNTING_DONE"], "VALIDATED", req, async () => ({ reportNotes: reportNotes.trim(), validatedById: user.id, validatedAt: new Date() }));
  }
  close(schoolId: string, id: string, req: AppRequest) {
    return this.move(schoolId, id, ["VALIDATED"], "CLOSED", req, async () => ({ closedAt: new Date() }));
  }
  archive(schoolId: string, id: string, req: AppRequest) {
    return this.move(schoolId, id, ["CLOSED"], "ARCHIVED", req);
  }
}
