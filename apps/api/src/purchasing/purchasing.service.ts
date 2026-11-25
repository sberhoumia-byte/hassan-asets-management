import { Injectable } from "@nestjs/common";
import { Prisma, type PurchaseOrderStatus } from "@prisma/client";
import { formatNumber, matchesQuery, PO_CANCELLABLE, PO_EDITABLE, PO_RECEIVABLE } from "@hassan/shared";
import type { ApprovalWorkflowInput, DeliveryInput, InvoiceInput, PostDeliveryInput, PurchaseOrderInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { CatalogService } from "../catalog/catalog.service";
import { SpacesService } from "../spaces/spaces.service";
import { StockService } from "../stock/stock.service";
import { AssetsService } from "../assets/assets.service";
import { nextSequence } from "../common/sequences";
import { E } from "../common/errors";
import { compact, UUID_RE } from "../common/util";
import type { AppRequest, AuthUser } from "../common/context";

type Tx = Prisma.TransactionClient;
const D = (n: number | string | Prisma.Decimal) => new Prisma.Decimal(n);
const day = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);

const poInclude = {
  supplier: { select: { id: true, name: true } },
  workflow: { select: { id: true, name: true } },
  items: { orderBy: { lineNo: "asc" as const }, include: { deliveryItems: { select: { quantityAccepted: true } } } },
  approvals: { include: { step: true }, orderBy: { step: { stepOrder: "asc" as const } } },
  deliveries: { orderBy: [{ receivedAt: "asc" as const }, { number: "asc" as const }], include: { items: { orderBy: { purchaseOrderItem: { lineNo: "asc" as const } } } } },
  invoices: { orderBy: { invoiceDate: "asc" as const } },
} satisfies Prisma.PurchaseOrderInclude;
type PoRow = Prisma.PurchaseOrderGetPayload<{ include: typeof poInclude }>;

/**
 * الطلبيات والاقتناء: حاجة ← تقدير ← مصادقة حسب مسار مرن (حسب مصدر التمويل، أو مسار يختاره المستعمل، وقد يكون بلا خطوات)
 * ← طلب لدى مورد ← تسلم ومراقبة مطابقة (جزئي أو كلي) ← فاتورة ← إدخال المقبول إلى المخزون أو الممتلكات مرة واحدة ← إغلاق.
 */
@Injectable()
export class PurchasingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private catalog: CatalogService,
    private spaces: SpacesService,
    private stock: StockService,
    private assets: AssetsService,
  ) {}

  // ---------------- مسارات المصادقة ----------------
  async workflows(schoolId: string) {
    const rows = await this.prisma.approvalWorkflow.findMany({ where: { schoolId }, include: { steps: { orderBy: { stepOrder: "asc" } } }, orderBy: { name: "asc" } });
    return rows.map((w) =>
      compact({
        id: w.id,
        name: w.name,
        fundingSourceId: w.fundingSourceId,
        managingBody: w.managingBody,
        isActive: w.isActive,
        steps: w.steps.map((s) => compact({ id: s.id, order: s.stepOrder, name: s.name, requiredRoleCode: s.requiredRoleCode })),
      }),
    );
  }

  async saveWorkflow(schoolId: string, id: string | null, i: ApprovalWorkflowInput, req: AppRequest) {
    await this.catalog.assertLookup(schoolId, "FUNDING_SOURCE", i.fundingSourceId || null, "fundingSourceId");
    const roles = new Set((await this.prisma.role.findMany({ select: { code: true } })).map((r) => r.code));
    i.steps.forEach((s, k) => {
      if (s.requiredRoleCode && !roles.has(s.requiredRoleCode)) throw E.validation({ fields: { [`steps.${k}.requiredRoleCode`]: "errors.invalidChoice" } });
    });
    if (id) {
      const w = await this.prisma.approvalWorkflow.findFirst({ where: { id, schoolId } });
      if (!w) throw E.notFound();
      // مسار مستعمل في طلبية قيد المصادقة لا تتغير خطواته (يبقى أثر القرار مطابقاً لما عُرض)
      if (await this.prisma.purchaseOrder.count({ where: { workflowId: id, status: "PENDING_APPROVAL" } })) throw E.rule("WORKFLOW_IN_USE");
    }
    return this.prisma.$transaction(async (tx) => {
      const data = { name: i.name.trim(), fundingSourceId: i.fundingSourceId || null, managingBody: i.managingBody || null, isActive: i.isActive ?? true };
      const w = id ? await tx.approvalWorkflow.update({ where: { id }, data }) : await tx.approvalWorkflow.create({ data: { schoolId, ...data } });
      if (id) {
        // الخطوات التي سبق استعمالها في قرارات تبقى (لا حذف لأثر المصادقة): نعيد ترقيمها فقط إن لم تُستعمل
        const used = await tx.purchaseOrderApproval.count({ where: { step: { workflowId: id } } });
        if (used) throw E.rule("WORKFLOW_IN_USE");
        await tx.approvalWorkflowStep.deleteMany({ where: { workflowId: id } });
      }
      if (i.steps.length) await tx.approvalWorkflowStep.createMany({ data: i.steps.map((s, k) => ({ workflowId: w.id, stepOrder: k + 1, name: s.name.trim(), requiredRoleCode: s.requiredRoleCode || null })) });
      await this.audit.log({ action: id ? "WORKFLOW_UPDATE" : "WORKFLOW_CREATE", entityType: "ApprovalWorkflow", entityId: w.id, after: { ...data, steps: i.steps.length, nameAr: w.name } }, req, tx);
      return { id: w.id };
    });
  }

  // ---------------- الطلبيات ----------------
  private dto(p: PoRow) {
    const accepted = (it: PoRow["items"][number]) => it.deliveryItems.reduce((n, d) => n + Number(d.quantityAccepted), 0);
    return compact({
      id: p.id,
      number: p.number,
      title: p.title,
      needDescription: p.needDescription,
      status: p.status,
      fundingSourceId: p.fundingSourceId,
      budgetLine: p.budgetLine,
      estimatedTotal: p.estimatedTotal === null ? undefined : Number(p.estimatedTotal),
      supplierId: p.supplierId,
      supplier: p.supplier?.name,
      workflow: p.workflow ? { id: p.workflow.id, name: p.workflow.name } : undefined,
      orderDocRef: p.orderDocRef,
      orderedAt: p.orderedAt?.toISOString().slice(0, 10),
      createdAt: p.createdAt.toISOString(),
      items: p.items.map((it) =>
        compact({
          id: it.id,
          description: it.description,
          quantity: Number(it.quantity),
          unitId: it.unitId,
          estimatedUnitCost: it.estimatedUnitCost === null ? undefined : Number(it.estimatedUnitCost),
          targetKind: it.targetKind,
          inventoryItemId: it.inventoryItemId,
          accepted: accepted(it),
        }),
      ),
      approvals: p.approvals.map((a) =>
        compact({ stepId: a.stepId, order: a.step.stepOrder, name: a.step.name, requiredRoleCode: a.step.requiredRoleCode, decision: a.decision, decidedById: a.decidedById, decidedAt: a.decidedAt?.toISOString(), comment: a.comment }),
      ),
      deliveries: p.deliveries.map((d) =>
        compact({
          id: d.id,
          number: d.number,
          receivedAt: d.receivedAt.toISOString().slice(0, 10),
          conformity: d.conformity,
          conformityNotes: d.conformityNotes,
          items: d.items.map((x) => compact({ id: x.id, purchaseOrderItemId: x.purchaseOrderItemId, description: x.description, quantityReceived: Number(x.quantityReceived), quantityAccepted: Number(x.quantityAccepted), postedAt: x.postedAt?.toISOString(), postedAs: x.postedAs })),
        }),
      ),
      invoices: p.invoices.map((v) => ({ id: v.id, invoiceNumber: v.invoiceNumber, invoiceDate: v.invoiceDate.toISOString().slice(0, 10), amount: Number(v.amount) })),
    });
  }

  private async names(p: ReturnType<PurchasingService["dto"]>) {
    const ids = p.approvals.map((a) => a.decidedById).filter((x): x is string => !!x);
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullNameAr: true } }) : [];
    const m = new Map(users.map((u) => [u.id, u.fullNameAr]));
    return { ...p, approvals: p.approvals.map((a) => ({ ...a, decidedBy: a.decidedById ? m.get(a.decidedById) : undefined })) };
  }

  async list(schoolId: string, f: { q?: string; status?: string; page: number; pageSize: number }) {
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { schoolId, ...(f.status === "open" ? { status: { notIn: ["CLOSED", "REJECTED", "CANCELLED"] } } : f.status ? { status: f.status as PurchaseOrderStatus } : {}) },
      include: poInclude,
      orderBy: { createdAt: "desc" },
    });
    const all = rows.map((p) => this.dto(p)).filter((p) => matchesQuery(f.q ?? "", p.number, p.title, p.supplier));
    return { items: all.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), total: all.length, page: f.page, pageSize: f.pageSize };
  }

  async get(schoolId: string, id: string) {
    const p = await this.prisma.purchaseOrder.findFirst({ where: { id, schoolId }, include: poInclude });
    if (!p) throw E.notFound();
    return this.names(this.dto(p));
  }

  private async refs(schoolId: string, i: PurchaseOrderInput) {
    await this.catalog.assertLookup(schoolId, "FUNDING_SOURCE", i.fundingSourceId || null, "fundingSourceId");
    await this.catalog.assertSupplier(schoolId, i.supplierId || null);
    for (const [k, it] of i.items.entries()) {
      await this.catalog.assertLookup(schoolId, "UNIT_OF_MEASURE", it.unitId || null, `items.${k}.unitId`);
      if (it.inventoryItemId && !(UUID_RE.test(it.inventoryItemId) && (await this.prisma.inventoryItem.count({ where: { id: it.inventoryItemId, schoolId } }))))
        throw E.validation({ fields: { [`items.${k}.inventoryItemId`]: "errors.invalidChoice" } });
    }
  }

  private totals(i: PurchaseOrderInput) {
    const known = i.items.every((it) => it.estimatedUnitCost !== null && it.estimatedUnitCost !== undefined);
    const total = i.items.reduce((n, it) => n.add(D(it.quantity).mul(D(it.estimatedUnitCost ?? 0))), D(0));
    return { estimatedTotal: known ? total : null, status: (known ? "ESTIMATED" : "NEED_RECORDED") as PurchaseOrderStatus };
  }

  private itemsData(i: PurchaseOrderInput) {
    return i.items.map((it, k) => ({
      lineNo: k + 1,
      description: it.description.trim(),
      quantity: it.quantity,
      unitId: it.unitId || null,
      estimatedUnitCost: it.estimatedUnitCost ?? null,
      targetKind: it.targetKind,
      inventoryItemId: it.targetKind === "STOCK" ? it.inventoryItemId || null : null,
    }));
  }

  async create(schoolId: string, i: PurchaseOrderInput, user: AuthUser, req: AppRequest) {
    await this.refs(schoolId, i);
    return this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const number = formatNumber("PO-{YEAR}-{SEQ:4}", { year, seq: await nextSequence(tx, schoolId, "PO", year) });
      const p = await tx.purchaseOrder.create({
        data: {
          schoolId,
          number,
          title: i.title.trim(),
          needDescription: i.needDescription || null,
          fundingSourceId: i.fundingSourceId || null,
          budgetLine: i.budgetLine || null,
          supplierId: i.supplierId || null,
          createdById: user.id,
          ...this.totals(i),
          items: { create: this.itemsData(i) },
        },
      });
      await this.audit.log({ action: "PO_CREATE", entityType: "PurchaseOrder", entityId: p.id, after: { number, nameAr: p.title, items: i.items.length } }, req, tx);
      return { id: p.id, number };
    });
  }

  async update(schoolId: string, id: string, i: PurchaseOrderInput, req: AppRequest) {
    const p = await this.prisma.purchaseOrder.findFirst({ where: { id, schoolId } });
    if (!p) throw E.notFound();
    if (!PO_EDITABLE.includes(p.status)) throw E.rule("PO_LOCKED", { status: p.status });
    await this.refs(schoolId, i);
    return this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } }); // قبل المصادقة: لا تسلم ولا ممتلكات مرتبطة
      await tx.purchaseOrder.update({
        where: { id },
        data: { title: i.title.trim(), needDescription: i.needDescription || null, fundingSourceId: i.fundingSourceId || null, budgetLine: i.budgetLine || null, supplierId: i.supplierId || null, ...this.totals(i), items: { create: this.itemsData(i) } },
      });
      await this.audit.log({ action: "PO_UPDATE", entityType: "PurchaseOrder", entityId: id, after: { nameAr: i.title, items: i.items.length } }, req, tx);
      return { id };
    });
  }

  /** قفل الطلبية والتحقق من حالتها الحالية داخل المعاملة. */
  private async lock(tx: Tx, schoolId: string, id: string, allowed: string[], to: string) {
    const [row] = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM purchase_orders WHERE id = ${id}::uuid AND "schoolId" = ${schoolId}::uuid FOR UPDATE`;
    if (!row) throw E.notFound();
    if (!allowed.includes(row.status)) throw E.rule("INVALID_TRANSITION", { from: row.status, to });
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
  }

  private async setStatus(tx: Tx, p: { id: string; number: string; title: string; status: string }, to: PurchaseOrderStatus, req: AppRequest, extra: Record<string, unknown> = {}) {
    await tx.purchaseOrder.update({ where: { id: p.id }, data: { status: to } });
    await this.audit.log({ action: `PO_${to}`, entityType: "PurchaseOrder", entityId: p.id, before: { status: p.status }, after: { status: to, nameAr: p.title, ...extra } }, req, tx);
  }

  /** الإرسال للمصادقة: مسار يختاره المستعمل، أو مطابق لمصدر التمويل، أو الافتراضي. مسار بلا خطوات = مصادقة مباشرة. */
  async submit(schoolId: string, id: string, workflowId: string | null | undefined, req: AppRequest) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.lock(tx, schoolId, id, ["NEED_RECORDED", "ESTIMATED"], "PENDING_APPROVAL");
      let wf;
      if (workflowId) {
        wf = UUID_RE.test(workflowId) ? await tx.approvalWorkflow.findFirst({ where: { id: workflowId, schoolId, isActive: true }, include: { steps: { orderBy: { stepOrder: "asc" } } } }) : null;
        if (!wf) throw E.validation({ fields: { workflowId: "errors.invalidChoice" } });
      } else {
        const active = await tx.approvalWorkflow.findMany({ where: { schoolId, isActive: true }, include: { steps: { orderBy: { stepOrder: "asc" } } } });
        const exact = active.filter((w) => p.fundingSourceId && w.fundingSourceId === p.fundingSourceId);
        const fallback = active.filter((w) => !w.fundingSourceId);
        const pool = exact.length ? exact : fallback;
        if (!pool.length) throw E.rule("NO_WORKFLOW");
        if (pool.length > 1) throw E.rule("WORKFLOW_AMBIGUOUS", { count: pool.length });
        wf = pool[0]!;
      }
      await tx.purchaseOrder.update({ where: { id }, data: { workflowId: wf.id } });
      if (!wf.steps.length) {
        await this.setStatus(tx, p, "APPROVED", req, { workflow: wf.name, direct: true });
        return { id, status: "APPROVED" };
      }
      await tx.purchaseOrderApproval.createMany({ data: wf.steps.map((s) => ({ purchaseOrderId: id, stepId: s.id })) });
      await this.setStatus(tx, p, "PENDING_APPROVAL", req, { workflow: wf.name });
      return { id, status: "PENDING_APPROVAL" };
    });
  }

  /** قرار خطوة: بالترتيب فقط، ومن طرف من يحمل الدور المطلوب (أو صلاحية المصادقة إن لم يُحدَّد دور). */
  async decide(schoolId: string, id: string, stepId: string, decision: "APPROVED" | "REJECTED", comment: string | undefined, user: AuthUser, req: AppRequest) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.lock(tx, schoolId, id, ["PENDING_APPROVAL"], decision);
      const approvals = await tx.purchaseOrderApproval.findMany({ where: { purchaseOrderId: id }, include: { step: true }, orderBy: { step: { stepOrder: "asc" } } });
      const next = approvals.find((a) => a.decision === "PENDING");
      if (!next || next.stepId !== stepId) throw E.rule("STEP_OUT_OF_ORDER");
      if (next.step.requiredRoleCode) {
        const has = user.isSystemAdmin || (await tx.userRole.count({ where: { userId: user.id, schoolId, role: { code: next.step.requiredRoleCode } } })) > 0;
        if (!has) throw E.forbidden(`role:${next.step.requiredRoleCode}`);
      } else if (!req.permissions?.has("purchasing.approve")) throw E.forbidden("purchasing.approve");
      if (decision === "REJECTED" && !comment?.trim()) throw E.validation({ fields: { comment: "errors.rejectNeedsComment" } });
      await tx.purchaseOrderApproval.update({ where: { id: next.id }, data: { decision, decidedById: user.id, decidedAt: new Date(), comment: comment?.trim() || null } });
      await this.audit.log({ action: "PO_DECISION", entityType: "PurchaseOrder", entityId: id, after: { step: next.step.name, decision, comment, nameAr: p.title } }, req, tx);
      if (decision === "REJECTED") await this.setStatus(tx, p, "REJECTED", req);
      else if (approvals.filter((a) => a.decision === "PENDING").length === 1) await this.setStatus(tx, p, "APPROVED", req);
      const after = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
      return { id, status: after.status };
    });
  }

  async order(schoolId: string, id: string, i: { supplierId: string; orderDocRef?: string; orderedAt?: string | null }, req: AppRequest) {
    await this.catalog.assertSupplier(schoolId, i.supplierId);
    return this.prisma.$transaction(async (tx) => {
      const p = await this.lock(tx, schoolId, id, ["APPROVED"], "ORDERED");
      await tx.purchaseOrder.update({ where: { id }, data: { supplierId: i.supplierId, orderDocRef: i.orderDocRef || null, orderedAt: day(i.orderedAt) ?? new Date() } });
      await this.setStatus(tx, p, "ORDERED", req, { orderDocRef: i.orderDocRef });
      return { id, status: "ORDERED" };
    });
  }

  async cancel(schoolId: string, id: string, reason: string, req: AppRequest) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.lock(tx, schoolId, id, PO_CANCELLABLE, "CANCELLED");
      await this.setStatus(tx, p, "CANCELLED", req, { reason });
      return { id, status: "CANCELLED" };
    });
  }

  /** التسلم ومراقبة المطابقة: المقبول لا يتجاوز المتبقي من كل سطر؛ يحدد «مسلَّمة جزئياً» أو «مسلَّمة». */
  async deliver(schoolId: string, id: string, i: DeliveryInput, user: AuthUser, req: AppRequest) {
    if (i.clientOpId) {
      const prev = await this.prisma.auditLog.findFirst({ where: { schoolId, action: "PO_DELIVERY", entityId: id, after: { path: ["clientOpId"], equals: i.clientOpId } } });
      if (prev) return { id, replayed: true, number: (prev.after as { number?: string }).number };
    }
    return this.prisma.$transaction(async (tx) => {
      const p = await this.lock(tx, schoolId, id, PO_RECEIVABLE, "DELIVERED");
      const accepted = new Map<string, Prisma.Decimal>();
      for (const d of await tx.deliveryItem.findMany({ where: { purchaseOrderItem: { purchaseOrderId: id } } }))
        accepted.set(d.purchaseOrderItemId!, (accepted.get(d.purchaseOrderItemId!) ?? D(0)).add(d.quantityAccepted));
      const lines = i.items.filter((x) => x.quantityReceived > 0 || x.quantityAccepted > 0);
      if (!lines.length) throw E.validation({ fields: { items: "errors.atLeastOneItem" } });
      for (const [k, x] of lines.entries()) {
        const it = p.items.find((y) => y.id === x.purchaseOrderItemId);
        if (!it) throw E.validation({ fields: { [`items.${k}.purchaseOrderItemId`]: "errors.invalidChoice" } });
        const remaining = it.quantity.sub(accepted.get(it.id) ?? D(0));
        if (D(x.quantityAccepted).gt(remaining)) throw E.rule("DELIVERY_EXCEEDS", { item: it.description, remaining: Number(remaining), requested: x.quantityAccepted });
        accepted.set(it.id, (accepted.get(it.id) ?? D(0)).add(x.quantityAccepted));
      }
      const year = new Date().getFullYear();
      const number = formatNumber("DL-{YEAR}-{SEQ:4}", { year, seq: await nextSequence(tx, schoolId, "DELIVERY", year) });
      const dl = await tx.delivery.create({
        data: {
          schoolId,
          purchaseOrderId: id,
          number,
          receivedAt: day(i.receivedAt)!,
          receivedById: user.id,
          conformity: i.conformity,
          conformityNotes: i.conformityNotes || null,
          items: {
            create: lines.map((x) => ({
              purchaseOrderItemId: x.purchaseOrderItemId,
              description: p.items.find((y) => y.id === x.purchaseOrderItemId)!.description,
              quantityReceived: x.quantityReceived,
              quantityAccepted: x.quantityAccepted,
            })),
          },
        },
      });
      const complete = p.items.every((it) => (accepted.get(it.id) ?? D(0)).gte(it.quantity));
      await this.audit.log({ action: "PO_DELIVERY", entityType: "PurchaseOrder", entityId: id, after: { number, nameAr: p.title, conformity: i.conformity, clientOpId: i.clientOpId } }, req, tx);
      await this.setStatus(tx, p, complete ? "DELIVERED" : "PARTIALLY_DELIVERED", req);
      return { id: dl.id, number, status: complete ? "DELIVERED" : "PARTIALLY_DELIVERED", replayed: false };
    });
  }

  /**
   * إدخال سطر متسلَّم مقبول مرة واحدة فقط: مادة مخزون ← حركة إدخال في المخزن المختار؛
   * تجهيز ← ممتلكات (فردية: بطاقة لكل قطعة برقم جرد؛ كمية: بطاقة واحدة).
   */
  async post(schoolId: string, i: PostDeliveryInput, user: AuthUser, req: AppRequest) {
    if (!UUID_RE.test(i.deliveryItemId)) throw E.validation({ fields: { deliveryItemId: "errors.invalidChoice" } });
    if (i.roomId) await this.spaces.assertRoom(schoolId, i.roomId);
    return this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ id: string }[]>`
          SELECT di.id FROM delivery_items di JOIN deliveries d ON d.id = di."deliveryId"
          WHERE di.id = ${i.deliveryItemId}::uuid AND d."schoolId" = ${schoolId}::uuid FOR UPDATE OF di`;
        if (!row) throw E.validation({ fields: { deliveryItemId: "errors.invalidChoice" } });
        const di = await tx.deliveryItem.findUniqueOrThrow({ where: { id: i.deliveryItemId }, include: { delivery: true, purchaseOrderItem: { include: { purchaseOrder: true } } } });
        if (di.postedAt) throw E.rule("ALREADY_POSTED");
        const qty = Number(di.quantityAccepted);
        if (qty <= 0) throw E.rule("NOTHING_ACCEPTED");
        const poi = di.purchaseOrderItem;
        const po = poi?.purchaseOrder;
        const unitCost = i.unitCost ?? (poi?.estimatedUnitCost === null || poi?.estimatedUnitCost === undefined ? null : Number(poi.estimatedUnitCost));
        let postedAs: "STOCK" | "ASSETS";
        const created: string[] = [];
        if (poi?.targetKind === "STOCK") {
          if (!i.warehouseId) throw E.validation({ fields: { warehouseId: "errors.required" } });
          const mv = await this.stock.inFromDelivery(tx, schoolId, user, {
            itemId: poi.inventoryItemId!,
            warehouseId: i.warehouseId,
            quantity: qty,
            unitCost,
            supplierId: po?.supplierId ?? null,
            reason: `${po?.number ?? ""} / ${di.delivery.number}`,
            deliveryItemId: di.id,
          });
          created.push(mv.number);
          postedAs = "STOCK";
        } else {
          await this.catalog.assertCategory(schoolId, i.categoryId || null);
          if (!i.categoryId) throw E.validation({ fields: { categoryId: "errors.required" } });
          const mode = i.trackingMode ?? "INDIVIDUAL";
          if (mode === "INDIVIDUAL" && !Number.isInteger(qty)) throw E.rule("INDIVIDUAL_NEEDS_INTEGER");
          const n = mode === "INDIVIDUAL" ? qty : 1;
          for (let k = 0; k < n; k++) {
            const a = await tx.asset.create({
              data: {
                schoolId,
                inventoryNumber: await this.assets.generateNumber(tx, schoolId),
                name: di.description,
                categoryId: i.categoryId,
                trackingMode: mode,
                quantity: mode === "INDIVIDUAL" ? 1 : Math.round(qty),
                acquisitionDate: di.delivery.receivedAt,
                acquisitionValue: unitCost,
                fundingSourceId: po?.fundingSourceId ?? null,
                supplierId: po?.supplierId ?? null,
                roomId: i.roomId || null,
                purchaseOrderItemId: poi?.id ?? null,
                createdById: user.id,
              },
            });
            if (a.roomId) await tx.assetLocation.create({ data: { assetId: a.id, roomId: a.roomId } });
            await this.audit.log({ action: "ASSET_CREATE", entityType: "Asset", entityId: a.id, after: { inventoryNumber: a.inventoryNumber, nameAr: a.name, reason: po?.number } }, req, tx);
            created.push(a.inventoryNumber);
          }
          postedAs = "ASSETS";
        }
        await tx.deliveryItem.update({ where: { id: di.id }, data: { postedAt: new Date(), postedAs } });
        if (po) await this.audit.log({ action: "PO_POSTED", entityType: "PurchaseOrder", entityId: po.id, after: { nameAr: po.title, postedAs, created } }, req, tx);
        return { postedAs, created };
      },
      { timeout: 60_000 },
    );
  }

  async addInvoice(schoolId: string, id: string, i: InvoiceInput, req: AppRequest) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.lock(tx, schoolId, id, ["PARTIALLY_DELIVERED", "DELIVERED", "INVOICED"], "INVOICED");
      if (!p.supplierId) throw E.rule("NO_SUPPLIER");
      if (await tx.invoice.count({ where: { supplierId: p.supplierId, invoiceNumber: i.invoiceNumber.trim() } })) throw E.conflict("DUPLICATE_INVOICE");
      const v = await tx.invoice.create({ data: { schoolId, supplierId: p.supplierId, purchaseOrderId: id, invoiceNumber: i.invoiceNumber.trim(), invoiceDate: day(i.invoiceDate)!, amount: i.amount } });
      await this.audit.log({ action: "PO_INVOICE", entityType: "PurchaseOrder", entityId: id, after: { invoice: v.invoiceNumber, amount: i.amount, nameAr: p.title } }, req, tx);
      if (p.status === "DELIVERED") await this.setStatus(tx, p, "INVOICED", req);
      return { id: v.id };
    });
  }

  /** الإغلاق: بعد التسلم الكامل، ولا يبقى سطر مقبول غير مُدخل. */
  async close(schoolId: string, id: string, req: AppRequest) {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.lock(tx, schoolId, id, ["DELIVERED", "INVOICED"], "CLOSED");
      const pending = await tx.deliveryItem.count({ where: { delivery: { purchaseOrderId: id }, postedAt: null, quantityAccepted: { gt: 0 } } });
      if (pending) throw E.rule("UNPOSTED_ITEMS", { count: pending });
      await this.setStatus(tx, p, "CLOSED", req);
      return { id, status: "CLOSED" };
    });
  }
}
