import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { FLOORPLAN_IMAGE_MAX_BYTES, type FloorPlanInput, type FloorPlanShapeInput } from "@hassan/validation";
import { AuditService } from "../common/audit.service";
import type { AppRequest, AuthUser } from "../common/context";
import { E } from "../common/errors";
import { UUID_RE } from "../common/util";
import { decodeDataUrl, StorageService } from "../files/storage.service";
import { PrismaService } from "../prisma/prisma.service";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const OPEN_MAINTENANCE = ["NEW", "UNDER_REVIEW", "IN_REPAIR"] as const;
export type ShapeLevel = "GOOD" | "WARN" | "BAD" | "NONE";

/** أبعاد الصورة من ترويستها (PNG/JPEG/WEBP) دون مكتبة خارجية. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  try {
    if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i++;
          continue;
        }
        const m = buf[i + 1]!;
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) {
          i += m === 0xff ? 1 : 2;
          continue;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
      return null;
    }
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * المخطط التفاعلي للمؤسسة: صورة خلفية (صورة جوية أو مخطط ممسوح) وأشكال بإحداثيات نسبية مرتبطة بفضاء أو مرفق.
 * لون كل شكل يُحسب من البيانات الحية: حالة الفضاء، طلبات الصيانة المفتوحة، والممتلكات المعطوبة فيه.
 */
@Injectable()
export class FloorPlanService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  private async plan(schoolId: string, id: string) {
    const p = UUID_RE.test(id) ? await this.prisma.floorPlan.findFirst({ where: { id, schoolId }, include: { shapes: true } }) : null;
    if (!p) throw E.notFound();
    return p;
  }

  private summary(p: { id: string; name: string; backgroundFileId: string | null; widthPx: number | null; heightPx: number | null; updatedAt: Date }, shapeCount: number) {
    return { id: p.id, name: p.name, hasBackground: !!p.backgroundFileId, widthPx: p.widthPx ?? 1600, heightPx: p.heightPx ?? 1000, shapeCount, updatedAt: p.updatedAt.toISOString() };
  }

  async list(schoolId: string) {
    const rows = await this.prisma.floorPlan.findMany({ where: { schoolId }, include: { _count: { select: { shapes: true } } }, orderBy: { name: "asc" } });
    return rows.map((p) => this.summary(p, p._count.shapes));
  }

  async get(schoolId: string, id: string) {
    const p = await this.plan(schoolId, id);
    const status = await this.status(schoolId, p.shapes);
    return {
      ...this.summary(p, p.shapes.length),
      shapes: p.shapes.map((s) => ({
        id: s.id,
        kind: s.kind,
        geometry: s.geometry,
        label: s.label ?? undefined,
        roomId: s.roomId ?? undefined,
        facilityId: s.facilityId ?? undefined,
        status: status.get(s.id)!,
      })),
    };
  }

  /** حالة كل شكل من البيانات الحية. */
  private async status(schoolId: string, shapes: { id: string; roomId: string | null; facilityId: string | null }[]) {
    const roomIds = [...new Set(shapes.map((s) => s.roomId).filter((x): x is string => !!x))];
    const facIds = [...new Set(shapes.map((s) => s.facilityId).filter((x): x is string => !!x))];
    const [rooms, facs, mr, mf, ar, af] = await Promise.all([
      this.prisma.room.findMany({ where: { schoolId, id: { in: roomIds } }, select: { id: true, code: true, name: true, status: true } }),
      this.prisma.facility.findMany({ where: { schoolId, id: { in: facIds } }, select: { id: true, code: true, name: true, status: true } }),
      this.prisma.maintenanceRequest.groupBy({ by: ["roomId"], where: { schoolId, roomId: { in: roomIds }, status: { in: [...OPEN_MAINTENANCE] } }, _count: true }),
      this.prisma.maintenanceRequest.groupBy({ by: ["facilityId"], where: { schoolId, facilityId: { in: facIds }, status: { in: [...OPEN_MAINTENANCE] } }, _count: true }),
      this.prisma.asset.groupBy({ by: ["roomId", "status"], where: { schoolId, archivedAt: null, roomId: { in: roomIds }, status: { not: "DISPOSED" } }, _count: true }),
      this.prisma.asset.groupBy({ by: ["facilityId", "status"], where: { schoolId, archivedAt: null, facilityId: { in: facIds }, status: { not: "DISPOSED" } }, _count: true }),
    ]);
    const target = new Map<string, { code: string; name: string; status: string }>([...rooms, ...facs].map((x) => [x.id, x]));
    const maint = new Map<string, number>();
    mr.forEach((g) => g.roomId && maint.set(g.roomId, g._count));
    mf.forEach((g) => g.facilityId && maint.set(g.facilityId, g._count));
    const assets = new Map<string, { total: number; damaged: number }>();
    const addA = (k: string | null, status: string, n: number) => {
      if (!k) return;
      const a = assets.get(k) ?? { total: 0, damaged: 0 };
      a.total += n;
      if (status === "DAMAGED" || status === "UNDER_REPAIR") a.damaged += n;
      assets.set(k, a);
    };
    ar.forEach((g) => addA(g.roomId, g.status, g._count));
    af.forEach((g) => addA(g.facilityId, g.status, g._count));
    const out = new Map<string, { level: ShapeLevel; targetCode?: string; targetName?: string; spaceStatus?: string; openMaintenance: number; assets: number; damagedAssets: number }>();
    for (const s of shapes) {
      const key = s.roomId ?? s.facilityId;
      const t = key ? target.get(key) : undefined;
      if (!key || !t) {
        out.set(s.id, { level: "NONE", openMaintenance: 0, assets: 0, damagedAssets: 0 });
        continue;
      }
      const m = maint.get(key) ?? 0;
      const a = assets.get(key) ?? { total: 0, damaged: 0 };
      const level: ShapeLevel = t.status === "OUT_OF_SERVICE" ? "BAD" : t.status === "NEEDS_MAINTENANCE" || m > 0 || a.damaged > 0 ? "WARN" : "GOOD";
      out.set(s.id, { level, targetCode: t.code, targetName: t.name, spaceStatus: t.status, openMaintenance: m, assets: a.total, damagedAssets: a.damaged });
    }
    return out;
  }

  private decodeBackground(dataUrl: string) {
    const img = decodeDataUrl(dataUrl, IMAGE_TYPES, FLOORPLAN_IMAGE_MAX_BYTES, "background");
    const dim = imageSize(img.buf);
    if (!dim || dim.width < 50 || dim.height < 50 || dim.width > 12000 || dim.height > 12000) throw E.validation({ fields: { background: "errors.fileType" } });
    return { ...img, ...dim };
  }

  async create(schoolId: string, body: FloorPlanInput, user: AuthUser, req: AppRequest) {
    const img = body.background ? this.decodeBackground(body.background) : null;
    const p = await this.prisma.$transaction(async (tx) => {
      const file = img ? await this.storage.save(tx, { schoolId, buf: img.buf, mime: img.mime, originalName: "floorplan", uploadedById: user.id }) : null;
      const p = await tx.floorPlan.create({ data: { schoolId, name: body.name, backgroundFileId: file?.id ?? null, widthPx: img?.width ?? null, heightPx: img?.height ?? null } });
      await this.audit.log({ action: "FLOORPLAN_CREATE", entityType: "FloorPlan", entityId: p.id, schoolId, after: { name: p.name, background: !!file } }, req, tx);
      return p;
    });
    return this.get(schoolId, p.id);
  }

  async update(schoolId: string, id: string, body: FloorPlanInput, user: AuthUser, req: AppRequest) {
    const before = await this.plan(schoolId, id);
    const img = body.background ? this.decodeBackground(body.background) : null;
    await this.prisma.$transaction(async (tx) => {
      const file = img ? await this.storage.save(tx, { schoolId, buf: img.buf, mime: img.mime, originalName: "floorplan", uploadedById: user.id }) : null;
      const bg: Prisma.FloorPlanUncheckedUpdateInput =
        body.background === undefined ? {} : file ? { backgroundFileId: file.id, widthPx: img!.width, heightPx: img!.height } : { backgroundFileId: null };
      await tx.floorPlan.update({ where: { id }, data: { name: body.name, ...bg } });
      await this.audit.log(
        { action: "FLOORPLAN_UPDATE", entityType: "FloorPlan", entityId: id, schoolId, before: { name: before.name, background: before.backgroundFileId }, after: { name: body.name, background: file?.id ?? (body.background === "" ? null : before.backgroundFileId) } },
        req,
        tx,
      );
    });
    return this.get(schoolId, id);
  }

  /** استبدال أشكال المخطط دفعة واحدة؛ كل ربط يجب أن يتبع نفس المؤسسة. */
  async saveShapes(schoolId: string, id: string, shapes: FloorPlanShapeInput[], req: AppRequest) {
    const before = await this.plan(schoolId, id);
    const roomIds = [...new Set(shapes.map((s) => s.roomId).filter((x): x is string => !!x))];
    const facIds = [...new Set(shapes.map((s) => s.facilityId).filter((x): x is string => !!x))];
    const [rooms, facs] = await Promise.all([
      this.prisma.room.findMany({ where: { schoolId, id: { in: roomIds } }, select: { id: true } }),
      this.prisma.facility.findMany({ where: { schoolId, id: { in: facIds } }, select: { id: true } }),
    ]);
    const ok = new Set([...rooms, ...facs].map((x) => x.id));
    shapes.forEach((s, i) => {
      if (s.roomId && !ok.has(s.roomId)) throw E.validation({ fields: { [`shapes.${i}.roomId`]: "errors.invalidChoice" } });
      if (s.facilityId && !ok.has(s.facilityId)) throw E.validation({ fields: { [`shapes.${i}.facilityId`]: "errors.invalidChoice" } });
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.floorPlanShape.deleteMany({ where: { floorPlanId: id } });
      await tx.floorPlanShape.createMany({
        data: shapes.map((s) => ({ floorPlanId: id, kind: s.kind, geometry: s.geometry as Prisma.InputJsonValue, label: s.label || null, roomId: s.roomId || null, facilityId: s.facilityId || null })),
      });
      await tx.floorPlan.update({ where: { id }, data: { updatedAt: new Date() } });
      await this.audit.log(
        { action: "FLOORPLAN_SHAPES", entityType: "FloorPlan", entityId: id, schoolId, before: { shapes: before.shapes.length }, after: { shapes: shapes.length, linked: shapes.filter((s) => s.roomId || s.facilityId).length } },
        req,
        tx,
      );
    });
    return this.get(schoolId, id);
  }

  /** الحذف يُبقي نسخة كاملة من الأشكال في سجل التدقيق. */
  async remove(schoolId: string, id: string, req: AppRequest) {
    const p = await this.plan(schoolId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.floorPlan.delete({ where: { id } });
      await this.audit.log(
        { action: "FLOORPLAN_DELETE", entityType: "FloorPlan", entityId: id, schoolId, before: { name: p.name, background: p.backgroundFileId, shapes: p.shapes.map((s) => ({ kind: s.kind, geometry: s.geometry, label: s.label, roomId: s.roomId, facilityId: s.facilityId })) } },
        req,
        tx,
      );
    });
    return { ok: true };
  }

  async background(schoolId: string, id: string) {
    const p = UUID_RE.test(id) ? await this.prisma.floorPlan.findFirst({ where: { id, schoolId }, include: { background: true } }) : null;
    if (!p?.background) throw E.notFound();
    return { buf: await this.storage.read(p.background.storageKey), mime: p.background.mimeType };
  }
}
