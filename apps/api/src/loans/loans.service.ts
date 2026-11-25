import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { dueEndOfDay, formatNumber, lateDays, matchesQuery } from "@hassan/shared";
import type { LoanInput, LoanReturnInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { StaffService } from "../staff/staff.service";
import { onLoanQuantity } from "../resources/resources.service";
import { nextSequence } from "../common/sequences";
import { E } from "../common/errors";
import { compact, UUID_RE } from "../common/util";
import type { AppRequest, AuthUser } from "../common/context";

const OPEN = ["ACTIVE", "PARTIALLY_RETURNED"] as const;
const include = {
  resource: { select: { id: true, code: true, name: true, trackingMode: true } },
  unit: { select: { id: true, inventoryNumber: true } },
  borrower: { select: { id: true, fullNameAr: true, fullNameFr: true, type: true } },
  returns: { orderBy: { returnedAt: "asc" } },
} as const satisfies Prisma.ResourceLoanInclude;
type Row = Prisma.ResourceLoanGetPayload<{ include: typeof include }>;

/**
 * الإعارة والإرجاع. القواعد:
 *  - الوحدة المعارة لا تُعار مرة ثانية (409 RESOURCE_ALREADY_ON_LOAN، ومؤكد بفهرس فريد جزئي في القاعدة)
 *  - الوحدة المعطوبة أو قيد الصيانة أو المستبعدة لا تُعار (422 RESOURCE_NOT_AVAILABLE)
 *  - الصنف الكمي: لا تتجاوز الإعارة المتاح = الإجمالي − المعطوب − المعار (قفل صف الصنف)
 *  - الإرجاع كلي أو جزئي ولا يتجاوز المتبقي؛ المعطوب عند الإرجاع يُسجَّل على الوحدة أو الكمية
 */
@Injectable()
export class LoansService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private staff: StaffService,
  ) {}

  private dto(l: Row, users?: Map<string, string>) {
    const returned = l.returns.reduce((s, r) => s + r.quantity, 0);
    const open = (OPEN as readonly string[]).includes(l.status);
    const lastReturn = l.returns.at(-1)?.returnedAt;
    const late = open ? lateDays(l.dueAt) : lastReturn ? lateDays(l.dueAt, lastReturn) : 0;
    return compact({
      id: l.id,
      number: l.number,
      resourceId: l.resourceId,
      resource: { code: l.resource.code, name: l.resource.name, trackingMode: l.resource.trackingMode },
      unitId: l.unitId,
      unit: l.unit?.inventoryNumber,
      quantity: l.quantity,
      returnedQuantity: returned,
      outstanding: l.quantity - returned,
      borrowerStaffId: l.borrowerStaffId,
      borrower: l.borrower.fullNameAr,
      borrowerFr: l.borrower.fullNameFr,
      loanedAt: l.loanedAt.toISOString(),
      dueAt: l.dueAt.toISOString(),
      conditionOut: l.conditionOut,
      status: l.status,
      notes: l.notes,
      overdue: open && late > 0,
      lateDays: late,
      handedOverBy: users?.get(l.handedOverById),
      returns: l.returns.map((r) =>
        compact({ id: r.id, quantity: r.quantity, returnedAt: r.returnedAt.toISOString(), conditionIn: r.conditionIn, damaged: r.damaged, notes: r.notes, receivedBy: users?.get(r.receivedById) }),
      ),
    });
  }

  private async userNames(rows: Row[]) {
    const ids = new Set<string>();
    for (const l of rows) {
      ids.add(l.handedOverById);
      for (const r of l.returns) ids.add(r.receivedById);
    }
    const us = await this.prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, fullNameAr: true } });
    return new Map(us.map((u) => [u.id, u.fullNameAr]));
  }

  async list(schoolId: string, f: { status?: string; overdue?: boolean; borrowerId?: string; resourceId?: string; q?: string; page: number; pageSize: number }) {
    const where: Prisma.ResourceLoanWhereInput = {
      schoolId,
      ...(f.status === "open" ? { status: { in: [...OPEN] } } : f.status === "returned" ? { status: "RETURNED" } : {}),
      ...(f.overdue ? { status: { in: [...OPEN] }, dueAt: { lt: new Date() } } : {}),
      ...(f.borrowerId && UUID_RE.test(f.borrowerId) ? { borrowerStaffId: f.borrowerId } : {}),
      ...(f.resourceId && UUID_RE.test(f.resourceId) ? { resourceId: f.resourceId } : {}),
    };
    let rows = await this.prisma.resourceLoan.findMany({ where, include, orderBy: [{ loanedAt: "desc" }] });
    if (f.q) rows = rows.filter((l) => matchesQuery(f.q!, l.number, l.resource.name, l.borrower.fullNameAr, l.unit?.inventoryNumber));
    const total = rows.length;
    const page = rows.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);
    const users = await this.userNames(page);
    return { items: page.map((l) => this.dto(l, users)), total, page: f.page, pageSize: f.pageSize };
  }

  async get(schoolId: string, id: string) {
    const l = await this.prisma.resourceLoan.findFirst({ where: { id, schoolId }, include });
    if (!l) throw E.notFound();
    return this.dto(l, await this.userNames([l]));
  }

  private async replay(schoolId: string, clientOpId?: string) {
    if (!clientOpId) return null;
    const l = await this.prisma.resourceLoan.findFirst({ where: { schoolId, clientOpId } });
    return l ? { id: l.id, number: l.number, replayed: true } : null;
  }

  async create(schoolId: string, i: LoanInput, user: AuthUser, req: AppRequest) {
    const again = await this.replay(schoolId, i.clientOpId);
    if (again) return again;
    const r = UUID_RE.test(i.resourceId) ? await this.prisma.educationalResource.findFirst({ where: { id: i.resourceId, schoolId } }) : null;
    if (!r) throw E.validation({ fields: { resourceId: "errors.invalidChoice" } });
    if (r.archivedAt || !r.isLendable) throw E.rule("RESOURCE_NOT_LENDABLE");
    const borrower = (await this.staff.assertStaff(schoolId, i.borrowerStaffId, "borrowerStaffId"))!;
    const today = new Date().toISOString().slice(0, 10);
    if (i.dueAt < today) throw E.validation({ fields: { dueAt: "errors.dueInPast" } });
    if (r.trackingMode === "INDIVIDUAL" && !i.unitId) throw E.validation({ fields: { unitId: "errors.required" } });
    if (r.trackingMode === "QUANTITY" && i.unitId) throw E.validation({ fields: { unitId: "errors.invalidChoice" } });
    const quantity = r.trackingMode === "INDIVIDUAL" ? 1 : i.quantity;

    try {
      return await this.prisma.$transaction(async (tx) => {
        let unitLabel: string | undefined;
        if (r.trackingMode === "INDIVIDUAL") {
          // قفل الوحدة: إعارتان متزامنتان لنفس الوحدة لا تنجحان معاً
          const [u] = await tx.$queryRaw<{ id: string; status: string; inventoryNumber: string; resourceId: string }[]>`
            SELECT id, status::text AS status, "inventoryNumber", "resourceId" FROM educational_resource_units WHERE id = ${i.unitId}::uuid FOR UPDATE`;
          if (!u || u.resourceId !== r.id) throw E.validation({ fields: { unitId: "errors.invalidChoice" } });
          if (u.status === "ON_LOAN") throw E.conflict("RESOURCE_ALREADY_ON_LOAN", { unit: u.inventoryNumber });
          if (u.status !== "AVAILABLE") throw E.rule("RESOURCE_NOT_AVAILABLE", { status: u.status, unit: u.inventoryNumber });
          await tx.educationalResourceUnit.update({ where: { id: u.id }, data: { status: "ON_LOAN" } });
          unitLabel = u.inventoryNumber;
        } else {
          await tx.$queryRaw`SELECT id FROM educational_resources WHERE id = ${r.id}::uuid FOR UPDATE`;
          const cur = await tx.educationalResource.findUniqueOrThrow({ where: { id: r.id } });
          const lent = (await onLoanQuantity(tx, [r.id])).get(r.id) ?? 0;
          const available = cur.quantityTotal - cur.quantityDamaged - lent;
          if (quantity > available) throw E.rule("QUANTITY_NOT_AVAILABLE", { available, requested: quantity });
        }
        const year = new Date().getFullYear();
        const number = formatNumber("LN-{YEAR}-{SEQ:5}", { year, seq: await nextSequence(tx, schoolId, "LOAN", year) });
        const l = await tx.resourceLoan.create({
          data: {
            schoolId,
            number,
            resourceId: r.id,
            unitId: r.trackingMode === "INDIVIDUAL" ? i.unitId! : null,
            quantity,
            borrowerStaffId: borrower.id,
            dueAt: dueEndOfDay(i.dueAt),
            conditionOut: i.conditionOut || null,
            notes: i.notes || null,
            handedOverById: user.id,
            clientOpId: i.clientOpId,
          },
        });
        await this.audit.log(
          { action: "LOAN_CREATE", entityType: "ResourceLoan", entityId: l.id, after: { number, nameAr: `${r.name}${unitLabel ? ` (${unitLabel})` : ""}`, borrower: borrower.fullNameAr, quantity, dueAt: i.dueAt } },
          req,
          tx,
        );
        return { id: l.id, number, replayed: false };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again2 = await this.replay(schoolId, i.clientOpId);
        if (again2) return again2;
        throw E.conflict("RESOURCE_ALREADY_ON_LOAN"); // الفهرس الجزئي في القاعدة حسم السباق
      }
      throw e;
    }
  }

  async returnLoan(schoolId: string, id: string, i: LoanReturnInput, user: AuthUser, req: AppRequest) {
    if (i.clientOpId) {
      const done = await this.prisma.resourceReturn.findUnique({ where: { clientOpId: i.clientOpId }, include: { loan: true } });
      if (done && done.loan.schoolId === schoolId) return { id: done.loanId, replayed: true };
    }
    const l0 = await this.prisma.resourceLoan.findFirst({ where: { id, schoolId } });
    if (!l0) throw E.notFound();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM resource_loans WHERE id = ${id}::uuid FOR UPDATE`;
      const l = await tx.resourceLoan.findUniqueOrThrow({ where: { id }, include: { returns: true, resource: true, unit: true, borrower: true } });
      if (!(OPEN as readonly string[]).includes(l.status)) throw E.rule("LOAN_CLOSED");
      const outstanding = l.quantity - l.returns.reduce((s, r) => s + r.quantity, 0);
      if (i.quantity > outstanding) throw E.rule("RETURN_EXCEEDS", { outstanding, requested: i.quantity });
      await tx.resourceReturn.create({
        data: { loanId: id, quantity: i.quantity, conditionIn: i.conditionIn || null, damaged: i.damaged, notes: i.notes || null, receivedById: user.id, clientOpId: i.clientOpId },
      });
      const complete = i.quantity === outstanding;
      await tx.resourceLoan.update({ where: { id }, data: { status: complete ? "RETURNED" : "PARTIALLY_RETURNED" } });
      if (l.unitId) await tx.educationalResourceUnit.update({ where: { id: l.unitId }, data: { status: i.damaged ? "DAMAGED" : "AVAILABLE" } });
      else if (i.damaged) await tx.educationalResource.update({ where: { id: l.resourceId }, data: { quantityDamaged: { increment: i.quantity } } });
      await this.audit.log(
        {
          action: "LOAN_RETURN",
          entityType: "ResourceLoan",
          entityId: id,
          after: { number: l.number, nameAr: `${l.resource.name}${l.unit ? ` (${l.unit.inventoryNumber})` : ""}`, borrower: l.borrower.fullNameAr, quantity: i.quantity, damaged: i.damaged, complete, lateDays: lateDays(l.dueAt) },
        },
        req,
        tx,
      );
      return { id, replayed: false };
    });
  }
}
