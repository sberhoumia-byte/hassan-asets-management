import { Injectable } from "@nestjs/common";
import { Prisma, type CustodyAction } from "@prisma/client";
import { formatNumber, matchesQuery } from "@hassan/shared";
import type { CustodyInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { SpacesService } from "../spaces/spaces.service";
import { StaffService } from "../staff/staff.service";
import { nextSequence } from "../common/sequences";
import { E } from "../common/errors";
import { compact, UUID_RE } from "../common/util";
import type { AppRequest, AuthUser } from "../common/context";

const include = {
  asset: { select: { id: true, inventoryNumber: true, name: true, quantity: true } },
  fromStaff: { select: { fullNameAr: true, fullNameFr: true, staffNumber: true } },
  toStaff: { select: { fullNameAr: true, fullNameFr: true, staffNumber: true } },
  fromRoom: { select: { code: true, name: true } },
  toRoom: { select: { code: true, name: true } },
} satisfies Prisma.CustodyRecordInclude;
type Row = Prisma.CustodyRecordGetPayload<{ include: typeof include }>;
const dateOnly = (s: string | null | undefined) => (s ? new Date(`${s}T12:00:00Z`) : null);

/**
 * العهدة: كل عملية (تسليم، إسناد، نقل، تحويل، إرجاع) سطر دائم برقم، وتحدّث المسؤول/الفضاء في بطاقة الممتلك
 * ذرياً في نفس المعاملة مع قفل الممتلك، وتظهر في سجله. المحضر يُطبع من الواجهة.
 */
@Injectable()
export class CustodyService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private spaces: SpacesService,
    private staff: StaffService,
  ) {}

  private async userName(id: string) {
    return (await this.prisma.user.findUnique({ where: { id }, select: { fullNameAr: true } }))?.fullNameAr;
  }

  private dto(r: Row, by?: string) {
    const room = (x: { code: string; name: string } | null) => (x ? `${x.code} — ${x.name}` : undefined);
    return compact({
      id: r.id,
      number: r.number,
      action: r.action,
      asset: { id: r.asset.id, inventoryNumber: r.asset.inventoryNumber, name: r.asset.name, quantity: r.asset.quantity },
      fromStaffId: r.fromStaffId,
      fromStaff: r.fromStaff?.fullNameAr,
      toStaffId: r.toStaffId,
      toStaff: r.toStaff?.fullNameAr,
      toStaffNumber: r.toStaff?.staffNumber,
      fromRoom: room(r.fromRoom),
      toRoom: room(r.toRoom),
      occurredAt: r.occurredAt.toISOString(),
      notes: r.notes,
      by,
    });
  }

  async list(schoolId: string, f: { assetId?: string; staffId?: string; action?: string; q?: string; page: number; pageSize: number }) {
    const where: Prisma.CustodyRecordWhereInput = {
      schoolId,
      ...(f.assetId && UUID_RE.test(f.assetId) ? { assetId: f.assetId } : {}),
      ...(f.staffId && UUID_RE.test(f.staffId) ? { OR: [{ fromStaffId: f.staffId }, { toStaffId: f.staffId }] } : {}),
      ...(f.action && ["HANDOVER", "ASSIGNMENT", "RELOCATION", "TRANSFER", "RETURN"].includes(f.action) ? { action: f.action as CustodyAction } : {}),
    };
    const rows = await this.prisma.custodyRecord.findMany({ where, include, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] });
    const all = rows.map((r) => this.dto(r)).filter((d) => matchesQuery(f.q ?? "", d.number, d.asset.inventoryNumber, d.asset.name, d.toStaff, d.fromStaff));
    return { items: all.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), total: all.length, page: f.page, pageSize: f.pageSize };
  }

  async get(schoolId: string, id: string) {
    const r = await this.prisma.custodyRecord.findFirst({ where: { id, schoolId }, include });
    if (!r) throw E.notFound();
    return this.dto(r, await this.userName(r.createdById));
  }

  async create(schoolId: string, i: CustodyInput, user: AuthUser, req: AppRequest) {
    if (i.clientOpId) {
      const prev = await this.prisma.auditLog.findFirst({ where: { schoolId, action: { startsWith: "CUSTODY_" }, after: { path: ["clientOpId"], equals: i.clientOpId } } });
      if (prev) {
        const rec = await this.prisma.custodyRecord.findFirst({ where: { schoolId, assetId: prev.entityId ?? undefined, number: (prev.after as { number?: string }).number } });
        if (rec) return { id: rec.id, number: rec.number, replayed: true };
      }
    }
    if (!UUID_RE.test(i.assetId)) throw E.validation({ fields: { assetId: "errors.invalidChoice" } });
    if (i.toStaffId) await this.staff.assertStaff(schoolId, i.toStaffId, "toStaffId");
    if (i.toRoomId) await this.spaces.assertRoom(schoolId, i.toRoomId, "toRoomId");

    return this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM assets WHERE id = ${i.assetId}::uuid AND "schoolId" = ${schoolId}::uuid FOR UPDATE`;
      if (!locked) throw E.validation({ fields: { assetId: "errors.invalidChoice" } });
      const a = await tx.asset.findUniqueOrThrow({ where: { id: i.assetId } });
      if (a.archivedAt) throw E.rule("ASSET_ARCHIVED");

      const fromStaffId = a.responsibleStaffId;
      const fromRoomId = a.roomId;
      let toStaffId: string | null = a.responsibleStaffId;
      let toRoomId: string | null = a.roomId;
      switch (i.action) {
        case "HANDOVER":
        case "ASSIGNMENT":
          if (i.toStaffId === a.responsibleStaffId) throw E.rule("SAME_CUSTODIAN");
          toStaffId = i.toStaffId!;
          if (i.toRoomId) toRoomId = i.toRoomId;
          break;
        case "TRANSFER":
          // التحويل بين عهدتين: يتطلب مسؤولاً حالياً
          if (!a.responsibleStaffId) throw E.rule("NO_CURRENT_CUSTODIAN");
          if (i.toStaffId === a.responsibleStaffId) throw E.rule("SAME_CUSTODIAN");
          toStaffId = i.toStaffId!;
          if (i.toRoomId) toRoomId = i.toRoomId;
          break;
        case "RELOCATION":
          if (i.toRoomId === a.roomId) throw E.rule("SAME_ROOM");
          toRoomId = i.toRoomId!;
          break;
        case "RETURN":
          if (!a.responsibleStaffId) throw E.rule("NO_CURRENT_CUSTODIAN");
          toStaffId = null;
          if (i.toRoomId) toRoomId = i.toRoomId;
          break;
      }

      const year = new Date().getFullYear();
      const number = formatNumber("CU-{YEAR}-{SEQ:5}", { year, seq: await nextSequence(tx, schoolId, "CUSTODY", year) });
      const rec = await tx.custodyRecord.create({
        data: {
          schoolId,
          number,
          action: i.action,
          assetId: a.id,
          fromStaffId,
          toStaffId: i.action === "RELOCATION" ? null : toStaffId,
          fromRoomId,
          toRoomId: toRoomId !== fromRoomId ? toRoomId : null,
          occurredAt: dateOnly(i.occurredAt) ?? new Date(),
          notes: i.notes || null,
          createdById: user.id,
        },
      });
      await tx.asset.update({ where: { id: a.id }, data: { responsibleStaffId: toStaffId, roomId: toRoomId } });
      if (toRoomId !== fromRoomId) {
        await tx.assetLocation.updateMany({ where: { assetId: a.id, toDate: null }, data: { toDate: new Date() } });
        if (toRoomId) await tx.assetLocation.create({ data: { assetId: a.id, roomId: toRoomId } });
      }
      // على الممتلك نفسه حتى تظهر في سجله
      await this.audit.log(
        {
          action: `CUSTODY_${i.action}`,
          entityType: "Asset",
          entityId: a.id,
          before: { responsibleStaffId: fromStaffId, roomId: fromRoomId },
          after: { responsibleStaffId: toStaffId, roomId: toRoomId, number, nameAr: a.name, reason: number, clientOpId: i.clientOpId },
        },
        req,
        tx,
      );
      return { id: rec.id, number, replayed: false };
    });
  }
}
