import { Injectable } from "@nestjs/common";
import { Prisma, type StockMovementType } from "@prisma/client";
import { formatNumber, matchesQuery } from "@hassan/shared";
import type {
  StockAdjustInput,
  StockInInput,
  StockItemInput,
  StockOutInput,
  StockReturnInput,
  StockTransferInput,
  WarehouseInput,
} from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { CatalogService } from "../catalog/catalog.service";
import { nextSequence } from "../common/sequences";
import { E } from "../common/errors";
import { compact, nullify, UUID_RE } from "../common/util";
import type { AppRequest, AuthUser } from "../common/context";

type Tx = Prisma.TransactionClient;
const D = (n: number | string | Prisma.Decimal) => new Prisma.Decimal(n);
const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? 0 : Number(d));
const dateOnly = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
const EXPIRY_WARNING_DAYS = 30;

interface MovementSpec {
  type: StockMovementType;
  direction: 1 | -1;
  itemId: string;
  warehouseId: string;
  quantity: Prisma.Decimal;
  unitCost?: number | null;
  expiryDate?: Date | null;
  supplierId?: string | null;
  transferGroupId?: string | null;
  reversesId?: string | null;
  reason?: string | null;
  occurredAt?: Date | null;
  clientOpId?: string | null;
}

/**
 * المخزون: الرصيد لا يُعدَّل مباشرة أبداً. كل تغيير = حركة (append-only) + تحديث الرصيد في نفس المعاملة،
 * مع قفل صف الرصيد (FOR UPDATE) قبل التحقق، فلا يمر صرفان متزامنان على نفس الكمية.
 */
@Injectable()
export class StockService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private catalog: CatalogService,
  ) {}

  // ---------------- المخازن ----------------
  async warehouses(schoolId: string) {
    const rows = await this.prisma.warehouse.findMany({ where: { schoolId }, orderBy: { code: "asc" } });
    return rows.map((w) => ({ id: w.id, code: w.code, name: w.name, isActive: w.isActive }));
  }

  async createWarehouse(schoolId: string, input: WarehouseInput, req: AppRequest) {
    if (await this.prisma.warehouse.count({ where: { schoolId, code: input.code } })) throw E.conflict("DUPLICATE_CODE");
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.warehouse.create({ data: { schoolId, code: input.code, name: input.name.trim(), isActive: input.isActive ?? true } });
      await this.audit.log({ action: "WAREHOUSE_CREATE", entityType: "Warehouse", entityId: w.id, after: { ...w, nameAr: w.name } }, req, tx);
      return { id: w.id, code: w.code, name: w.name, isActive: w.isActive };
    });
  }

  async updateWarehouse(schoolId: string, id: string, input: WarehouseInput, req: AppRequest) {
    const before = await this.prisma.warehouse.findFirst({ where: { id, schoolId } });
    if (!before) throw E.notFound();
    if (input.code !== before.code && (await this.prisma.warehouse.count({ where: { schoolId, code: input.code } }))) throw E.conflict("DUPLICATE_CODE");
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.warehouse.update({ where: { id }, data: { code: input.code, name: input.name.trim(), isActive: input.isActive ?? before.isActive } });
      await this.audit.log({ action: "WAREHOUSE_UPDATE", entityType: "Warehouse", entityId: id, before, after: w }, req, tx);
      return { id: w.id, code: w.code, name: w.name, isActive: w.isActive };
    });
  }

  // ---------------- المواد ----------------
  private async itemRefs(schoolId: string, input: StockItemInput) {
    await this.catalog.assertCategory(schoolId, input.categoryId || null);
    await this.catalog.assertLookup(schoolId, "UNIT_OF_MEASURE", input.unitId, "unitId");
    await this.catalog.assertSupplier(schoolId, input.defaultSupplierId || null, "defaultSupplierId");
  }

  private itemData(input: StockItemInput) {
    const t = nullify({ notes: input.notes, categoryId: input.categoryId ?? "", defaultSupplierId: input.defaultSupplierId ?? "" });
    return { code: input.code, name: input.name.trim(), unitId: input.unitId, minQuantity: D(input.minQuantity), tracksExpiry: input.tracksExpiry, ...t };
  }

  async items(schoolId: string, f: { q?: string; alert?: string; includeInactive?: boolean }) {
    const rows = await this.prisma.inventoryItem.findMany({
      where: { schoolId, ...(f.includeInactive ? {} : { isActive: true }) },
      include: { balances: true, _count: { select: { movements: true } } },
      orderBy: { code: "asc" },
    });
    const units = new Map((await this.catalog.lookups(schoolId, "UNIT_OF_MEASURE", true)).map((u) => [u.id, u]));
    return rows
      .filter((i) => matchesQuery(f.q ?? "", i.name, i.code))
      .map((i) => {
        const total = i.balances.reduce((s, b) => s + num(b.quantity), 0);
        const min = num(i.minQuantity);
        const level = levelOf(total, min, i._count.movements > 0);
        const u = units.get(i.unitId);
        return compact({
          id: i.id,
          code: i.code,
          name: i.name,
          categoryId: i.categoryId,
          unitId: i.unitId,
          unitAr: u?.labelAr,
          unitFr: u?.labelFr,
          minQuantity: min,
          tracksExpiry: i.tracksExpiry,
          defaultSupplierId: i.defaultSupplierId,
          notes: i.notes,
          isActive: i.isActive,
          total: round3(total),
          balances: i.balances.map((b) => ({ warehouseId: b.warehouseId, quantity: num(b.quantity) })),
          level,
        });
      })
      .filter((i) => !f.alert || i.level === f.alert);
  }

  async createItem(schoolId: string, input: StockItemInput, req: AppRequest) {
    await this.itemRefs(schoolId, input);
    if (await this.prisma.inventoryItem.count({ where: { schoolId, code: input.code } })) throw E.conflict("DUPLICATE_CODE");
    return this.prisma.$transaction(async (tx) => {
      const i = await tx.inventoryItem.create({ data: { schoolId, ...this.itemData(input), isActive: input.isActive ?? true } });
      await this.audit.log({ action: "STOCK_ITEM_CREATE", entityType: "InventoryItem", entityId: i.id, after: { ...i, nameAr: i.name } }, req, tx);
      return { id: i.id };
    });
  }

  async updateItem(schoolId: string, id: string, input: StockItemInput, req: AppRequest) {
    const before = await this.prisma.inventoryItem.findFirst({ where: { id, schoolId } });
    if (!before) throw E.notFound();
    await this.itemRefs(schoolId, input);
    if (input.code !== before.code && (await this.prisma.inventoryItem.count({ where: { schoolId, code: input.code } }))) throw E.conflict("DUPLICATE_CODE");
    // الوحدة لا تتغير بعد وجود حركات (وإلا تتغير دلالة كل الكميات المسجلة)
    if (input.unitId !== before.unitId && (await this.prisma.stockMovement.count({ where: { itemId: id } }))) throw E.rule("UNIT_LOCKED");
    return this.prisma.$transaction(async (tx) => {
      const i = await tx.inventoryItem.update({ where: { id }, data: { ...this.itemData(input), isActive: input.isActive ?? before.isActive } });
      await this.audit.log({ action: "STOCK_ITEM_UPDATE", entityType: "InventoryItem", entityId: id, before, after: i }, req, tx);
      return { id };
    });
  }

  // ---------------- الحركات ----------------
  private async lockBalances(tx: Tx, itemId: string, warehouseIds: string[]) {
    const ids = [...new Set(warehouseIds)].sort(); // ترتيب ثابت يمنع الجمود (deadlock) بين تحويلين متعاكسين
    for (const w of ids)
      await tx.$executeRaw`INSERT INTO stock_balances ("itemId", "warehouseId", quantity, "updatedAt") VALUES (${itemId}::uuid, ${w}::uuid, 0, now()) ON CONFLICT DO NOTHING`;
    const rows = await tx.$queryRaw<{ warehouseId: string; quantity: Prisma.Decimal }[]>`
      SELECT "warehouseId", quantity FROM stock_balances
      WHERE "itemId" = ${itemId}::uuid AND "warehouseId" = ANY(${ids}::uuid[])
      ORDER BY "warehouseId" FOR UPDATE`;
    return new Map(rows.map((r) => [r.warehouseId, D(r.quantity)]));
  }

  private async write(tx: Tx, schoolId: string, user: AuthUser, m: MovementSpec, current: Prisma.Decimal) {
    const delta = m.quantity.mul(m.direction);
    const next = current.add(delta);
    if (next.lt(0)) throw E.rule("STOCK_INSUFFICIENT", { available: Number(current), requested: Number(m.quantity) });
    const year = new Date().getFullYear();
    const number = formatNumber("MV-{YEAR}-{SEQ:5}", { year, seq: await nextSequence(tx, schoolId, "STOCK", year) });
    const mv = await tx.stockMovement.create({
      data: {
        schoolId,
        number,
        type: m.type,
        direction: m.direction,
        itemId: m.itemId,
        warehouseId: m.warehouseId,
        quantity: m.quantity,
        unitCost: m.unitCost ?? null,
        expiryDate: m.expiryDate ?? null,
        supplierId: m.supplierId ?? null,
        transferGroupId: m.transferGroupId ?? null,
        reversesId: m.reversesId ?? null,
        reason: m.reason || null,
        occurredAt: m.occurredAt ?? new Date(),
        clientOpId: m.clientOpId ?? null,
        createdById: user.id,
      },
    });
    await tx.$executeRaw`UPDATE stock_balances SET quantity = quantity + ${delta.toString()}::numeric, "updatedAt" = now()
      WHERE "itemId" = ${m.itemId}::uuid AND "warehouseId" = ${m.warehouseId}::uuid`;
    return { mv, after: next };
  }

  private async assertItem(schoolId: string, itemId: string, requireActive = true) {
    const i = UUID_RE.test(itemId) ? await this.prisma.inventoryItem.findFirst({ where: { id: itemId, schoolId } }) : null;
    if (!i) throw E.validation({ fields: { itemId: "errors.invalidChoice" } });
    if (requireActive && !i.isActive) throw E.rule("ITEM_INACTIVE");
    return i;
  }

  private async assertWarehouse(schoolId: string, id: string, field = "warehouseId") {
    const w = UUID_RE.test(id) ? await this.prisma.warehouse.findFirst({ where: { id, schoolId } }) : null;
    if (!w) throw E.validation({ fields: { [field]: "errors.invalidChoice" } });
    if (!w.isActive) throw E.rule("WAREHOUSE_INACTIVE");
    return w;
  }

  /** إعادة إرسال نفس العملية (clientOpId) من الواجهة أو المزامنة لا تُنشئ حركة ثانية. */
  private async replay(schoolId: string, clientOpId?: string) {
    if (!clientOpId) return null;
    const m = await this.prisma.stockMovement.findFirst({ where: { clientOpId, schoolId } });
    return m ? { replayed: true, movements: [m.number] } : null;
  }

  private async run(
    schoolId: string,
    clientOpId: string | undefined,
    fn: (tx: Tx) => Promise<{ numbers: string[]; audit: { action: string; entityId: string; after: Record<string, unknown> } }>,
    req: AppRequest,
  ) {
    const prev = await this.replay(schoolId, clientOpId);
    if (prev) return prev;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const r = await fn(tx);
        await this.audit.log({ action: r.audit.action, entityType: "StockMovement", entityId: r.audit.entityId, after: r.audit.after }, req, tx);
        return { replayed: false, movements: r.numbers };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await this.replay(schoolId, clientOpId);
        if (again) return again;
      }
      throw e;
    }
  }

  async stockIn(schoolId: string, input: StockInInput, user: AuthUser, req: AppRequest) {
    const item = await this.assertItem(schoolId, input.itemId);
    await this.assertWarehouse(schoolId, input.warehouseId);
    await this.catalog.assertSupplier(schoolId, input.supplierId || null);
    if (input.expiryDate && !item.tracksExpiry) throw E.validation({ fields: { expiryDate: "errors.noExpiry" } });
    return this.run(schoolId, input.clientOpId, async (tx) => {
      const bal = await this.lockBalances(tx, input.itemId, [input.warehouseId]);
      const { mv, after } = await this.write(tx, schoolId, user, {
        type: "IN", direction: 1, itemId: input.itemId, warehouseId: input.warehouseId, quantity: D(input.quantity),
        unitCost: input.unitCost, supplierId: input.supplierId || null, expiryDate: dateOnly(input.expiryDate), reason: input.reason,
        occurredAt: dateOnly(input.occurredAt), clientOpId: input.clientOpId,
      }, bal.get(input.warehouseId)!);
      return { numbers: [mv.number], audit: { action: "STOCK_IN", entityId: mv.id, after: { number: mv.number, item: item.name, nameAr: item.name, quantity: input.quantity, balance: Number(after) } } };
    }, req);
  }

  async stockOut(schoolId: string, input: StockOutInput, user: AuthUser, req: AppRequest, type: "OUT" = "OUT") {
    const item = await this.assertItem(schoolId, input.itemId);
    await this.assertWarehouse(schoolId, input.warehouseId);
    return this.run(schoolId, input.clientOpId, async (tx) => {
      const bal = await this.lockBalances(tx, input.itemId, [input.warehouseId]);
      const { mv, after } = await this.write(tx, schoolId, user, {
        type, direction: -1, itemId: input.itemId, warehouseId: input.warehouseId, quantity: D(input.quantity),
        reason: input.reason, occurredAt: dateOnly(input.occurredAt), clientOpId: input.clientOpId,
      }, bal.get(input.warehouseId)!);
      return { numbers: [mv.number], audit: { action: "STOCK_OUT", entityId: mv.id, after: { number: mv.number, nameAr: item.name, quantity: input.quantity, reason: input.reason, balance: Number(after) } } };
    }, req);
  }

  /** إرجاع مادة مصروفة إلى المخزن (يزيد الرصيد) مع سبب إلزامي. */
  async stockReturn(schoolId: string, input: StockReturnInput, user: AuthUser, req: AppRequest) {
    const item = await this.assertItem(schoolId, input.itemId, false);
    await this.assertWarehouse(schoolId, input.warehouseId);
    return this.run(schoolId, input.clientOpId, async (tx) => {
      const bal = await this.lockBalances(tx, input.itemId, [input.warehouseId]);
      const { mv, after } = await this.write(tx, schoolId, user, {
        type: "RETURN", direction: 1, itemId: input.itemId, warehouseId: input.warehouseId, quantity: D(input.quantity),
        reason: input.reason, occurredAt: dateOnly(input.occurredAt), clientOpId: input.clientOpId,
      }, bal.get(input.warehouseId)!);
      return { numbers: [mv.number], audit: { action: "STOCK_RETURN", entityId: mv.id, after: { number: mv.number, nameAr: item.name, quantity: input.quantity, reason: input.reason, balance: Number(after) } } };
    }, req);
  }

  /** التحويل: حركتان مرتبطتان (خروج + دخول) في معاملة واحدة. */
  async transfer(schoolId: string, input: StockTransferInput, user: AuthUser, req: AppRequest) {
    const item = await this.assertItem(schoolId, input.itemId);
    await this.assertWarehouse(schoolId, input.fromWarehouseId, "fromWarehouseId");
    await this.assertWarehouse(schoolId, input.toWarehouseId, "toWarehouseId");
    return this.run(schoolId, input.clientOpId, async (tx) => {
      const bal = await this.lockBalances(tx, input.itemId, [input.fromWarehouseId, input.toWarehouseId]);
      const group = crypto.randomUUID();
      const q = D(input.quantity);
      const base = { itemId: input.itemId, quantity: q, transferGroupId: group, reason: input.reason, occurredAt: dateOnly(input.occurredAt) };
      const out = await this.write(tx, schoolId, user, { ...base, type: "TRANSFER_OUT", direction: -1, warehouseId: input.fromWarehouseId, clientOpId: input.clientOpId }, bal.get(input.fromWarehouseId)!);
      const inn = await this.write(tx, schoolId, user, { ...base, type: "TRANSFER_IN", direction: 1, warehouseId: input.toWarehouseId }, bal.get(input.toWarehouseId)!);
      return { numbers: [out.mv.number, inn.mv.number], audit: { action: "STOCK_TRANSFER", entityId: out.mv.id, after: { numbers: [out.mv.number, inn.mv.number], nameAr: item.name, quantity: input.quantity } } };
    }, req);
  }

  /** التسوية: إدخال الكمية المعدودة فعلياً؛ الفرق يصبح حركة ADJUSTMENT بسبب إلزامي (صلاحية stock.adjust). */
  async adjust(schoolId: string, input: StockAdjustInput, user: AuthUser, req: AppRequest) {
    const item = await this.assertItem(schoolId, input.itemId, false);
    await this.assertWarehouse(schoolId, input.warehouseId);
    return this.run(schoolId, input.clientOpId, async (tx) => {
      const bal = await this.lockBalances(tx, input.itemId, [input.warehouseId]);
      const current = bal.get(input.warehouseId)!;
      const diff = D(input.countedQuantity).sub(current);
      if (diff.isZero()) throw E.rule("NO_DIFFERENCE");
      const { mv } = await this.write(tx, schoolId, user, {
        type: "ADJUSTMENT", direction: diff.gt(0) ? 1 : -1, itemId: input.itemId, warehouseId: input.warehouseId, quantity: diff.abs(),
        reason: input.reason, clientOpId: input.clientOpId,
      }, current);
      return { numbers: [mv.number], audit: { action: "STOCK_ADJUST", entityId: mv.id, after: { number: mv.number, nameAr: item.name, before: Number(current), counted: input.countedQuantity, reason: input.reason } } };
    }, req);
  }

  /** عكس حركة معتمدة بدل حذفها (صلاحية stock.reverse). عكس أحد طرفي التحويل يعكس الطرفين معاً. */
  async reverse(schoolId: string, id: string, reason: string, user: AuthUser, req: AppRequest) {
    const orig = await this.prisma.stockMovement.findFirst({ where: { id, schoolId }, include: { reversedBy: true, item: true } });
    if (!orig) throw E.notFound();
    if (orig.type === "REVERSAL") throw E.rule("CANNOT_REVERSE_REVERSAL");
    if (orig.reversedBy) throw E.rule("ALREADY_REVERSED");
    const legs = orig.transferGroupId
      ? await this.prisma.stockMovement.findMany({ where: { schoolId, transferGroupId: orig.transferGroupId }, include: { reversedBy: true }, orderBy: { direction: "desc" } })
      : [orig];
    if (legs.some((l) => l.reversedBy)) throw E.rule("ALREADY_REVERSED");
    try {
      return await this.run(schoolId, undefined, async (tx) => {
        const bal = await this.lockBalances(tx, orig.itemId, legs.map((l) => l.warehouseId));
        const numbers: string[] = [];
        // نعكس أولاً الطرف الذي كان إدخالاً (يُنقص الرصيد) ليُكشف نقص الرصيد قبل أي كتابة أخرى
        for (const l of legs) {
          const cur = bal.get(l.warehouseId)!;
          const { mv, after } = await this.write(tx, schoolId, user, {
            type: "REVERSAL", direction: (l.direction === 1 ? -1 : 1) as 1 | -1, itemId: l.itemId, warehouseId: l.warehouseId, quantity: D(l.quantity),
            reversesId: l.id, transferGroupId: l.transferGroupId, reason,
          }, cur);
          bal.set(l.warehouseId, after);
          numbers.push(mv.number);
        }
        return { numbers, audit: { action: "STOCK_REVERSE", entityId: orig.id, after: { reverses: legs.map((l) => l.number), numbers, nameAr: orig.item.name, reason } } };
      }, req);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw E.rule("ALREADY_REVERSED");
      throw e;
    }
  }

  async movements(schoolId: string, f: { itemId?: string; warehouseId?: string; type?: string; from?: string; to?: string; page: number; pageSize: number }) {
    const where: Prisma.StockMovementWhereInput = {
      schoolId,
      ...(f.itemId && UUID_RE.test(f.itemId) ? { itemId: f.itemId } : {}),
      ...(f.warehouseId && UUID_RE.test(f.warehouseId) ? { warehouseId: f.warehouseId } : {}),
      ...(f.type ? { type: f.type as StockMovementType } : {}),
      ...(f.from || f.to
        ? { occurredAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86400_000) } : {}) } }
        : {}),
    };
    if (f.type && !["OPENING", "IN", "OUT", "TRANSFER_OUT", "TRANSFER_IN", "RETURN", "ADJUSTMENT", "REVERSAL"].includes(f.type)) return { items: [], total: 0, page: 1, pageSize: f.pageSize };
    const [total, rows] = await Promise.all([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
        include: { item: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, supplier: { select: { name: true } }, reversedBy: { select: { number: true } }, reverses: { select: { number: true } } },
      }),
    ]);
    const users = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, fullNameAr: true } })).map((u) => [u.id, u.fullNameAr]),
    );
    return {
      total,
      page: f.page,
      pageSize: f.pageSize,
      items: rows.map((r) =>
        compact({
          id: r.id,
          number: r.number,
          type: r.type,
          direction: r.direction,
          itemId: r.itemId,
          item: r.item,
          warehouseId: r.warehouseId,
          warehouse: r.warehouse,
          quantity: num(r.quantity),
          unitCost: r.unitCost === null ? undefined : num(r.unitCost),
          expiryDate: r.expiryDate?.toISOString().slice(0, 10),
          supplier: r.supplier?.name,
          reason: r.reason,
          occurredAt: r.occurredAt.toISOString(),
          by: users.get(r.createdById),
          reversedBy: r.reversedBy?.number,
          reverses: r.reverses?.number,
          transferGroupId: r.transferGroupId,
        }),
      ),
    };
  }

  /** التنبيهات: نافد، تحت الحد الأدنى، وكميات واردة تقترب صلاحيتها من الانتهاء (30 يوماً). */
  async alerts(schoolId: string) {
    const items = await this.items(schoolId, {});
    const soon = new Date(Date.now() + EXPIRY_WARNING_DAYS * 86400_000);
    const expiring = await this.prisma.stockMovement.findMany({
      where: { schoolId, type: "IN", expiryDate: { not: null, lte: soon }, reversedBy: null, item: { tracksExpiry: true, isActive: true } },
      include: { item: { select: { id: true, code: true, name: true } }, warehouse: { select: { name: true } } },
      orderBy: { expiryDate: "asc" },
      take: 100,
    });
    const withStock = new Set(items.filter((i) => i.total > 0).map((i) => i.id));
    return {
      out: items.filter((i) => i.level === "out").map((i) => ({ id: i.id, code: i.code, name: i.name, total: i.total, minQuantity: i.minQuantity })),
      low: items.filter((i) => i.level === "low").map((i) => ({ id: i.id, code: i.code, name: i.name, total: i.total, minQuantity: i.minQuantity })),
      expiring: expiring
        .filter((m) => withStock.has(m.itemId))
        .map((m) => ({ movement: m.number, itemId: m.item.id, code: m.item.code, name: m.item.name, warehouse: m.warehouse.name, expiryDate: m.expiryDate!.toISOString().slice(0, 10), quantity: num(m.quantity), expired: m.expiryDate! < new Date() })),
    };
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** نافد: رصيد صفر لمادة لها حد أدنى أو سبق تخزينها. منخفض: موجود لكن ≤ الحد الأدنى. */
export function levelOf(total: number, min: number, hasMovements: boolean): "ok" | "low" | "out" {
  if (total <= 0) return min > 0 || hasMovements ? "out" : "ok";
  if (min > 0 && total <= min) return "low";
  return "ok";
}
