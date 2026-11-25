import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { matchesQuery } from "@hassan/shared";
import type { BuildingInput, FacilityInput, RoomInput } from "@hassan/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { CatalogService } from "../catalog/catalog.service";
import { E } from "../common/errors";
import { compact, nullify, UUID_RE } from "../common/util";
import type { AppRequest } from "../common/context";

const num = (d: Prisma.Decimal | null) => (d === null ? undefined : Number(d));

/** البنايات والفضاءات (الحجرات، المكاتب، الساحات...) والملاعب. لا حذف: أرشفة فقط. */
@Injectable()
export class SpacesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private catalog: CatalogService,
  ) {}

  // ---------------- البنايات ----------------
  async buildings(schoolId: string, archived = false) {
    const rows = await this.prisma.building.findMany({
      where: { schoolId, archivedAt: archived ? { not: null } : null },
      include: { _count: { select: { rooms: { where: { archivedAt: null } } } } },
      orderBy: { code: "asc" },
    });
    return rows.map((b) =>
      compact({ id: b.id, code: b.code, name: b.name, floors: b.floors, builtYear: b.builtYear, status: b.status, notes: b.notes, archivedAt: b.archivedAt?.toISOString(), rooms: b._count.rooms }),
    );
  }

  private buildingData(i: BuildingInput) {
    return { code: i.code, name: i.name.trim(), floors: i.floors ?? null, builtYear: i.builtYear ?? null, status: i.status, ...nullify({ notes: i.notes }) };
  }

  async createBuilding(schoolId: string, i: BuildingInput, req: AppRequest) {
    if (await this.prisma.building.count({ where: { schoolId, code: i.code } })) throw E.conflict("DUPLICATE_CODE");
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.building.create({ data: { schoolId, ...this.buildingData(i) } });
      await this.audit.log({ action: "BUILDING_CREATE", entityType: "Building", entityId: b.id, after: { ...b, nameAr: b.name } }, req, tx);
      return { id: b.id };
    });
  }

  async updateBuilding(schoolId: string, id: string, i: BuildingInput, req: AppRequest) {
    const before = await this.prisma.building.findFirst({ where: { id, schoolId } });
    if (!before) throw E.notFound();
    if (before.archivedAt) throw E.rule("ARCHIVED");
    if (i.code !== before.code && (await this.prisma.building.count({ where: { schoolId, code: i.code } }))) throw E.conflict("DUPLICATE_CODE");
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.building.update({ where: { id }, data: this.buildingData(i) });
      await this.audit.log({ action: "BUILDING_UPDATE", entityType: "Building", entityId: id, before, after: { ...b, nameAr: b.name } }, req, tx);
      return { id };
    });
  }

  /** بناية بها فضاءات نشطة لا تُؤرشف قبل أرشفة فضاءاتها أو نقلها. */
  async archiveBuilding(schoolId: string, id: string, archived: boolean, req: AppRequest) {
    const b = await this.prisma.building.findFirst({ where: { id, schoolId } });
    if (!b) throw E.notFound();
    if (archived && (await this.prisma.room.count({ where: { buildingId: id, archivedAt: null } }))) throw E.rule("BUILDING_HAS_ROOMS");
    return this.prisma.$transaction(async (tx) => {
      await tx.building.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await this.audit.log({ action: archived ? "BUILDING_ARCHIVE" : "BUILDING_RESTORE", entityType: "Building", entityId: id, after: { nameAr: b.name } }, req, tx);
      return { id };
    });
  }

  // ---------------- الفضاءات ----------------
  async rooms(schoolId: string, f: { q?: string; buildingId?: string; spaceTypeId?: string; status?: string; archived?: boolean }) {
    const rows = await this.prisma.room.findMany({
      where: {
        schoolId,
        archivedAt: f.archived ? { not: null } : null,
        ...(f.buildingId && UUID_RE.test(f.buildingId) ? { buildingId: f.buildingId } : {}),
        ...(f.spaceTypeId && UUID_RE.test(f.spaceTypeId) ? { spaceTypeId: f.spaceTypeId } : {}),
        ...(f.status && ["GOOD", "NEEDS_MAINTENANCE", "OUT_OF_SERVICE"].includes(f.status) ? { status: f.status as never } : {}),
      },
      include: {
        building: { select: { code: true, name: true } },
        _count: { select: { assets: { where: { archivedAt: null } }, resourceUnits: true, facilities: true } },
      },
      orderBy: { code: "asc" },
    });
    return rows
      .filter((r) => matchesQuery(f.q ?? "", r.name, r.code))
      .map((r) =>
        compact({
          id: r.id,
          code: r.code,
          name: r.name,
          buildingId: r.buildingId,
          building: r.building?.name,
          spaceTypeId: r.spaceTypeId,
          floor: r.floor,
          locationNote: r.locationNote,
          areaM2: num(r.areaM2),
          capacity: r.capacity,
          status: r.status,
          archivedAt: r.archivedAt?.toISOString(),
          counts: { assets: r._count.assets, resourceUnits: r._count.resourceUnits, facilities: r._count.facilities },
        }),
      );
  }

  private async roomRefs(schoolId: string, i: RoomInput) {
    await this.catalog.assertLookup(schoolId, "SPACE_TYPE", i.spaceTypeId, "spaceTypeId");
    if (i.buildingId) {
      const b = UUID_RE.test(i.buildingId) ? await this.prisma.building.findFirst({ where: { id: i.buildingId, schoolId } }) : null;
      if (!b) throw E.validation({ fields: { buildingId: "errors.invalidChoice" } });
      if (b.archivedAt) throw E.rule("ARCHIVED");
    }
  }

  private roomData(i: RoomInput) {
    return {
      code: i.code,
      name: i.name.trim(),
      spaceTypeId: i.spaceTypeId,
      areaM2: i.areaM2 ?? null,
      capacity: i.capacity ?? null,
      status: i.status,
      ...nullify({ buildingId: i.buildingId ?? "", floor: i.floor, locationNote: i.locationNote }),
    };
  }

  async createRoom(schoolId: string, i: RoomInput, req: AppRequest) {
    await this.roomRefs(schoolId, i);
    if (await this.prisma.room.count({ where: { schoolId, code: i.code } })) throw E.conflict("DUPLICATE_CODE");
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.room.create({ data: { schoolId, ...this.roomData(i) } });
      await this.audit.log({ action: "ROOM_CREATE", entityType: "Room", entityId: r.id, after: { ...r, nameAr: r.name } }, req, tx);
      return { id: r.id };
    });
  }

  async updateRoom(schoolId: string, id: string, i: RoomInput, req: AppRequest) {
    const before = await this.prisma.room.findFirst({ where: { id, schoolId } });
    if (!before) throw E.notFound();
    if (before.archivedAt) throw E.rule("ARCHIVED");
    await this.roomRefs(schoolId, i);
    if (i.code !== before.code && (await this.prisma.room.count({ where: { schoolId, code: i.code } }))) throw E.conflict("DUPLICATE_CODE");
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.room.update({ where: { id }, data: this.roomData(i) });
      await this.audit.log({ action: "ROOM_UPDATE", entityType: "Room", entityId: id, before, after: { ...r, nameAr: r.name } }, req, tx);
      return { id };
    });
  }

  /** فضاء يحتوي ممتلكات أو وسائل لا يُؤرشف قبل نقلها. */
  async archiveRoom(schoolId: string, id: string, archived: boolean, req: AppRequest) {
    const r = await this.prisma.room.findFirst({ where: { id, schoolId }, include: { building: true } });
    if (!r) throw E.notFound();
    if (archived) {
      const [a, u] = await Promise.all([
        this.prisma.asset.count({ where: { roomId: id, archivedAt: null } }),
        this.prisma.educationalResourceUnit.count({ where: { roomId: id, status: { not: "DISPOSED" } } }),
      ]);
      if (a + u > 0) throw E.rule("ROOM_NOT_EMPTY", { assets: a, units: u });
    } else if (r.building?.archivedAt) throw E.rule("ARCHIVED");
    return this.prisma.$transaction(async (tx) => {
      await tx.room.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await this.audit.log({ action: archived ? "ROOM_ARCHIVE" : "ROOM_RESTORE", entityType: "Room", entityId: id, after: { nameAr: r.name } }, req, tx);
      return { id };
    });
  }

  /** محتويات الفضاء: الممتلكات، وحدات الوسائل التعليمية، الأصناف الكمية المخزنة فيه، والملاعب المرتبطة. */
  async roomContents(schoolId: string, id: string) {
    const r = await this.prisma.room.findFirst({ where: { id, schoolId } });
    if (!r) throw E.notFound();
    const [assets, units, resources, facilities] = await Promise.all([
      this.prisma.asset.findMany({ where: { roomId: id, archivedAt: null }, select: { id: true, inventoryNumber: true, name: true, status: true, quantity: true }, orderBy: { inventoryNumber: "asc" } }),
      this.prisma.educationalResourceUnit.findMany({
        where: { roomId: id, status: { not: "DISPOSED" } },
        select: { id: true, inventoryNumber: true, status: true, resource: { select: { id: true, name: true } } },
        orderBy: { inventoryNumber: "asc" },
      }),
      this.prisma.educationalResource.findMany({ where: { roomId: id, archivedAt: null, trackingMode: "QUANTITY" }, select: { id: true, code: true, name: true, quantityTotal: true } }),
      this.prisma.facility.findMany({ where: { roomId: id, archivedAt: null }, select: { id: true, code: true, name: true, status: true } }),
    ]);
    return {
      assets,
      resourceUnits: units.map((u) => ({ id: u.id, inventoryNumber: u.inventoryNumber, status: u.status, resourceId: u.resource.id, resource: u.resource.name })),
      resources,
      facilities,
    };
  }

  // ---------------- الملاعب والمرافق ----------------
  async facilities(schoolId: string, archived = false) {
    const rows = await this.prisma.facility.findMany({
      where: { schoolId, archivedAt: archived ? { not: null } : null },
      include: { room: { select: { name: true } }, _count: { select: { assets: { where: { archivedAt: null } } } } },
      orderBy: { code: "asc" },
    });
    return rows.map((x) =>
      compact({
        id: x.id,
        code: x.code,
        name: x.name,
        facilityTypeId: x.facilityTypeId,
        roomId: x.roomId,
        room: x.room?.name,
        surfaceCondition: x.surfaceCondition,
        netsGoalsCondition: x.netsGoalsCondition,
        status: x.status,
        notes: x.notes,
        archivedAt: x.archivedAt?.toISOString(),
        equipment: x._count.assets,
      }),
    );
  }

  /** تجهيزات الملعب = الممتلكات المربوطة به. */
  async facilityEquipment(schoolId: string, id: string) {
    if (!(await this.prisma.facility.count({ where: { id, schoolId } }))) throw E.notFound();
    return this.prisma.asset.findMany({ where: { facilityId: id, archivedAt: null }, select: { id: true, inventoryNumber: true, name: true, status: true, quantity: true }, orderBy: { inventoryNumber: "asc" } });
  }

  private async facilityRefs(schoolId: string, i: FacilityInput) {
    await this.catalog.assertLookup(schoolId, "FACILITY_TYPE", i.facilityTypeId, "facilityTypeId");
    await this.assertRoom(schoolId, i.roomId);
  }

  async assertRoom(schoolId: string, id: string | null | undefined, field = "roomId") {
    if (!id) return null;
    const r = UUID_RE.test(id) ? await this.prisma.room.findFirst({ where: { id, schoolId } }) : null;
    if (!r) throw E.validation({ fields: { [field]: "errors.invalidChoice" } });
    if (r.archivedAt) throw E.validation({ fields: { [field]: "errors.archivedChoice" } });
    return id;
  }

  async assertFacility(schoolId: string, id: string | null | undefined, field = "facilityId") {
    if (!id) return null;
    const r = UUID_RE.test(id) ? await this.prisma.facility.findFirst({ where: { id, schoolId } }) : null;
    if (!r) throw E.validation({ fields: { [field]: "errors.invalidChoice" } });
    if (r.archivedAt) throw E.validation({ fields: { [field]: "errors.archivedChoice" } });
    return id;
  }

  private facilityData(i: FacilityInput) {
    return {
      code: i.code,
      name: i.name.trim(),
      facilityTypeId: i.facilityTypeId,
      status: i.status,
      ...nullify({ roomId: i.roomId ?? "", surfaceCondition: i.surfaceCondition, netsGoalsCondition: i.netsGoalsCondition, notes: i.notes }),
    };
  }

  async createFacility(schoolId: string, i: FacilityInput, req: AppRequest) {
    await this.facilityRefs(schoolId, i);
    if (await this.prisma.facility.count({ where: { schoolId, code: i.code } })) throw E.conflict("DUPLICATE_CODE");
    return this.prisma.$transaction(async (tx) => {
      const x = await tx.facility.create({ data: { schoolId, ...this.facilityData(i) } });
      await this.audit.log({ action: "FACILITY_CREATE", entityType: "Facility", entityId: x.id, after: { ...x, nameAr: x.name } }, req, tx);
      return { id: x.id };
    });
  }

  async updateFacility(schoolId: string, id: string, i: FacilityInput, req: AppRequest) {
    const before = await this.prisma.facility.findFirst({ where: { id, schoolId } });
    if (!before) throw E.notFound();
    if (before.archivedAt) throw E.rule("ARCHIVED");
    await this.facilityRefs(schoolId, i);
    if (i.code !== before.code && (await this.prisma.facility.count({ where: { schoolId, code: i.code } }))) throw E.conflict("DUPLICATE_CODE");
    return this.prisma.$transaction(async (tx) => {
      const x = await tx.facility.update({ where: { id }, data: this.facilityData(i) });
      await this.audit.log({ action: "FACILITY_UPDATE", entityType: "Facility", entityId: id, before, after: { ...x, nameAr: x.name } }, req, tx);
      return { id };
    });
  }

  async archiveFacility(schoolId: string, id: string, archived: boolean, req: AppRequest) {
    const x = await this.prisma.facility.findFirst({ where: { id, schoolId } });
    if (!x) throw E.notFound();
    if (archived && (await this.prisma.asset.count({ where: { facilityId: id, archivedAt: null } }))) throw E.rule("FACILITY_HAS_EQUIPMENT");
    return this.prisma.$transaction(async (tx) => {
      await tx.facility.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await this.audit.log({ action: archived ? "FACILITY_ARCHIVE" : "FACILITY_RESTORE", entityType: "Facility", entityId: id, after: { nameAr: x.name } }, req, tx);
      return { id };
    });
  }
}
