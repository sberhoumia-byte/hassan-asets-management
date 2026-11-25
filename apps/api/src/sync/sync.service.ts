import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { inventoryCountSchema, stockInSchema, stockOutSchema, type SyncBatchInput } from "@hassan/validation";
import type { AppRequest, AuthUser } from "../common/context";
import { AppError } from "../common/errors";
import { UUID_RE } from "../common/util";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { StockService } from "../stock/stock.service";

type Op = SyncBatchInput["operations"][number];
export type SyncResult = { clientOpId: string; status: "APPLIED" | "CONFLICT" | "REJECTED" | "RECEIVED"; error?: string; details?: unknown; resultRef?: string; replayed?: boolean };

/** حالات تغيّرت على الخادم أثناء الانقطاع: العملية صحيحة الشكل لكنها لم تعد قابلة للتطبيق كما هي. */
const CONFLICT_CODES = new Set(["STOCK_INSUFFICIENT", "SESSION_NOT_OPEN", "ITEM_INACTIVE", "WAREHOUSE_INACTIVE", "COUNT_NEWER"]);
const PERM: Record<Op["operation"], string> = { "stock.in": "stock.create", "stock.out": "stock.create", "inventory.count": "inventory.view" };
const countPayload = z.intersection(z.object({ sessionId: z.string().uuid("errors.invalidChoice") }), inventoryCountSchema);

/**
 * استقبال عمليات سُجلت دون اتصال (طابور Outbox في المتصفح) وتطبيقها بالترتيب عبر نفس الخدمات المعتادة
 * (نفس التحقق والصلاحيات وسجل التدقيق). clientOpId يضمن أن إعادة الإرسال لا تطبق العملية مرتين.
 */
@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private stock: StockService,
    private inventory: InventoryService,
  ) {}

  async push(schoolId: string, body: SyncBatchInput, user: AuthUser, req: AppRequest): Promise<{ results: SyncResult[] }> {
    const results: SyncResult[] = [];
    for (const op of body.operations) results.push(await this.one(schoolId, body.deviceId, op, user, req));
    return { results };
  }

  private async one(schoolId: string, deviceId: string, op: Op, user: AuthUser, req: AppRequest): Promise<SyncResult> {
    let row = await this.prisma.offlineSyncOperation.findUnique({ where: { clientOpId: op.clientOpId } });
    if (row && (row.userId !== user.id || row.schoolId !== schoolId)) return { clientOpId: op.clientOpId, status: "REJECTED", error: "FOREIGN_OPERATION" };
    if (row && row.status !== "RECEIVED")
      return { clientOpId: op.clientOpId, status: row.status, error: row.error ?? undefined, resultRef: row.resultRef ?? undefined, replayed: true };
    if (!row) {
      try {
        row = await this.prisma.offlineSyncOperation.create({
          data: { schoolId, userId: user.id, deviceId, clientOpId: op.clientOpId, operation: op.operation, payload: op.payload as Prisma.InputJsonValue, clientCreatedAt: new Date(op.clientCreatedAt) },
        });
      } catch (e) {
        // إرسال متزامن لنفس الدفعة: النسخة الأخرى سجلتها للتو
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return this.one(schoolId, deviceId, op, user, req);
        throw e;
      }
    }

    let status: SyncResult["status"];
    let error: string | undefined;
    let details: unknown;
    let resultRef: string | undefined;
    try {
      if (!req.permissions?.has(PERM[op.operation])) throw new AppError("FORBIDDEN", 403, { permission: PERM[op.operation] });
      resultRef = await this.apply(schoolId, op, user, req);
      status = "APPLIED";
    } catch (e) {
      if (!(e instanceof AppError)) throw e; // خطأ غير متوقع: تبقى RECEIVED وتعاد المحاولة لاحقاً
      status = CONFLICT_CODES.has(e.code) ? "CONFLICT" : "REJECTED";
      error = e.code;
      details = e.details;
    }
    await this.prisma.offlineSyncOperation.update({
      where: { id: row.id },
      data: { status, error: error ? `${error}${details ? ` ${JSON.stringify(details).slice(0, 500)}` : ""}` : null, resultRef: resultRef ?? null, appliedAt: status === "APPLIED" ? new Date() : null },
    });
    return { clientOpId: op.clientOpId, status, error, details, resultRef };
  }

  private async apply(schoolId: string, op: Op, user: AuthUser, req: AppRequest): Promise<string | undefined> {
    const parse = <T>(schema: z.ZodType<T>, v: unknown): T => {
      const r = schema.safeParse(v);
      if (!r.success) throw new AppError("VALIDATION_ERROR", 400, { fields: Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message])) });
      return r.data;
    };
    const payload = { ...op.payload, clientOpId: op.clientOpId };
    if (op.operation === "stock.in") return refOf(await this.stock.stockIn(schoolId, parse(stockInSchema, payload), user, req));
    if (op.operation === "stock.out") return refOf(await this.stock.stockOut(schoolId, parse(stockOutSchema, payload), user, req));
    const { sessionId, ...count } = parse(countPayload, payload);
    // عدّ أحدث من مستخدم آخر بعد تسجيل هذه العملية دون اتصال: لا نكتب فوقه
    if (count.lineId && UUID_RE.test(count.lineId)) {
      const line = await this.prisma.inventorySessionItem.findFirst({ where: { id: count.lineId, sessionId }, select: { countedById: true, countedAt: true, clientOpId: true } });
      if (line?.countedAt && line.clientOpId !== op.clientOpId && line.countedById !== user.id && line.countedAt > new Date(op.clientCreatedAt))
        throw new AppError("COUNT_NEWER", 409, { countedAt: line.countedAt.toISOString() });
    }
    return (await this.inventory.count(schoolId, sessionId, count, user, req)).lineId;
  }

  /** عمليات هذا المستخدم الأخيرة في المؤسسة (لعرض حالة المزامنة). */
  async history(schoolId: string, user: AuthUser) {
    const rows = await this.prisma.offlineSyncOperation.findMany({ where: { schoolId, userId: user.id }, orderBy: { receivedAt: "desc" }, take: 100 });
    return rows.map((r) => ({
      clientOpId: r.clientOpId,
      operation: r.operation,
      status: r.status,
      error: r.error ?? undefined,
      deviceId: r.deviceId,
      clientCreatedAt: r.clientCreatedAt.toISOString(),
      receivedAt: r.receivedAt.toISOString(),
      appliedAt: r.appliedAt?.toISOString(),
    }));
  }
}

function refOf(r: unknown): string | undefined {
  const o = r as { movements?: string[] } | null;
  return o?.movements?.join(",");
}
