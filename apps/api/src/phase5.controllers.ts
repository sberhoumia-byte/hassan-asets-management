/** مسارات المرحلة 5: الفضاءات والملاعب، الموظفون، الوسائل التعليمية، الإعارة. كلها تحت /schools/:schoolId. */
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  buildingSchema,
  facilitySchema,
  loanReturnSchema,
  loanSchema,
  resourceDamageSchema,
  resourceSchema,
  resourceUnitSchema,
  roomSchema,
  staffSchema,
} from "@hassan/validation";
import { CurrentUser, Perm, Req, SchoolScoped, type AppRequest, type AuthUser } from "./common/context";
import { parse } from "./common/zod";
import { SpacesService } from "./spaces/spaces.service";
import { StaffService } from "./staff/staff.service";
import { ResourcesService } from "./resources/resources.service";
import { LoansService } from "./loans/loans.service";

type P = string;
const pg = (v?: string, d = 1) => Math.max(1, Math.min(Number(v) || d, 10_000));

@ApiTags("spaces")
@Controller("schools/:schoolId")
export class SpacesController {
  constructor(private s: SpacesService) {}

  // القوائم المرجعية للفضاءات متاحة لكل عضو في المؤسسة (لاختيار موقع ممتلك أو وسيلة)
  @SchoolScoped()
  @Get("buildings")
  buildings(@Param("schoolId", ParseUUIDPipe) sid: P, @Query("archived") archived?: string) {
    return this.s.buildings(sid, archived === "1");
  }
  @Perm("spaces.create")
  @Post("buildings")
  createBuilding(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.createBuilding(sid, parse(buildingSchema, b), req);
  }
  @Perm("spaces.update")
  @Put("buildings/:id")
  updateBuilding(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.updateBuilding(sid, id, parse(buildingSchema, b), req);
  }
  @Perm("spaces.archive")
  @Post("buildings/:id/archive")
  @HttpCode(200)
  archiveBuilding(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Req() req: AppRequest) {
    return this.s.archiveBuilding(sid, id, true, req);
  }
  @Perm("spaces.archive")
  @Post("buildings/:id/restore")
  @HttpCode(200)
  restoreBuilding(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Req() req: AppRequest) {
    return this.s.archiveBuilding(sid, id, false, req);
  }

  @SchoolScoped()
  @Get("rooms")
  rooms(
    @Param("schoolId", ParseUUIDPipe) sid: P,
    @Query("q") q?: string,
    @Query("buildingId") buildingId?: string,
    @Query("spaceTypeId") spaceTypeId?: string,
    @Query("status") status?: string,
    @Query("archived") archived?: string,
  ) {
    return this.s.rooms(sid, { q: q?.slice(0, 100), buildingId, spaceTypeId, status, archived: archived === "1" });
  }
  @Perm("spaces.view")
  @Get("rooms/:id/contents")
  contents(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P) {
    return this.s.roomContents(sid, id);
  }
  @Perm("spaces.create")
  @Post("rooms")
  createRoom(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.createRoom(sid, parse(roomSchema, b), req);
  }
  @Perm("spaces.update")
  @Put("rooms/:id")
  updateRoom(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.updateRoom(sid, id, parse(roomSchema, b), req);
  }
  @Perm("spaces.archive")
  @Post("rooms/:id/archive")
  @HttpCode(200)
  archiveRoom(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Req() req: AppRequest) {
    return this.s.archiveRoom(sid, id, true, req);
  }
  @Perm("spaces.archive")
  @Post("rooms/:id/restore")
  @HttpCode(200)
  restoreRoom(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Req() req: AppRequest) {
    return this.s.archiveRoom(sid, id, false, req);
  }

  @SchoolScoped()
  @Get("facilities")
  facilities(@Param("schoolId", ParseUUIDPipe) sid: P, @Query("archived") archived?: string) {
    return this.s.facilities(sid, archived === "1");
  }
  @Perm("facilities.view")
  @Get("facilities/:id/equipment")
  equipment(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P) {
    return this.s.facilityEquipment(sid, id);
  }
  @Perm("facilities.create")
  @Post("facilities")
  createFacility(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.createFacility(sid, parse(facilitySchema, b), req);
  }
  @Perm("facilities.update")
  @Put("facilities/:id")
  updateFacility(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.updateFacility(sid, id, parse(facilitySchema, b), req);
  }
  @Perm("facilities.archive")
  @Post("facilities/:id/archive")
  @HttpCode(200)
  archiveFacility(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Req() req: AppRequest) {
    return this.s.archiveFacility(sid, id, true, req);
  }
  @Perm("facilities.archive")
  @Post("facilities/:id/restore")
  @HttpCode(200)
  restoreFacility(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Req() req: AppRequest) {
    return this.s.archiveFacility(sid, id, false, req);
  }
}

@ApiTags("staff")
@Controller("schools/:schoolId/staff")
export class StaffController {
  constructor(private s: StaffService) {}
  @SchoolScoped()
  @Get()
  list(@Param("schoolId", ParseUUIDPipe) sid: P, @Query("q") q?: string, @Query("all") all?: string) {
    return this.s.list(sid, { q: q?.slice(0, 100), all: all === "1" });
  }
  /** الإدارة لمن يملك إحدى صلاحيات STAFF_MANAGERS (يُتحقق منها في الخدمة). */
  @SchoolScoped()
  @Post()
  create(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @Req() req: AppRequest) {
    this.s.canManage(req);
    return this.s.create(sid, parse(staffSchema, b), req);
  }
  @SchoolScoped()
  @Put(":id")
  update(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Body() b: unknown, @Req() req: AppRequest) {
    this.s.canManage(req);
    return this.s.update(sid, id, parse(staffSchema, b), req);
  }
}

@ApiTags("resources")
@Controller("schools/:schoolId/resources")
export class ResourcesController {
  constructor(private s: ResourcesService) {}
  @Perm("resources.view")
  @Get()
  list(
    @Param("schoolId", ParseUUIDPipe) sid: P,
    @Query("q") q?: string,
    @Query("resourceTypeId") resourceTypeId?: string,
    @Query("archived") archived?: string,
    @Query("lendable") lendable?: string,
  ) {
    return this.s.list(sid, { q: q?.slice(0, 100), resourceTypeId, archived: archived === "1", lendable: lendable === "1" });
  }
  @Perm("resources.view")
  @Get(":id")
  get(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P) {
    return this.s.get(sid, id);
  }
  @Perm("resources.create")
  @Post()
  create(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.create(sid, parse(resourceSchema, b), u, req);
  }
  @Perm("resources.update")
  @Put(":id")
  update(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.update(sid, id, parse(resourceSchema, b), u, req);
  }
  @Perm("resources.update")
  @Post(":id/damaged")
  @HttpCode(200)
  damaged(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Body() b: unknown, @Req() req: AppRequest) {
    const v = parse(resourceDamageSchema, b);
    return this.s.setDamaged(sid, id, v.quantityDamaged, v.reason, req);
  }
  @Perm("resources.archive")
  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Req() req: AppRequest) {
    return this.s.archive(sid, id, true, req);
  }
  @Perm("resources.archive")
  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Req() req: AppRequest) {
    return this.s.archive(sid, id, false, req);
  }
  @Perm("resources.create")
  @Post(":id/units")
  addUnit(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.addUnit(sid, id, parse(resourceUnitSchema, b), req);
  }
  @Perm("resources.update")
  @Put(":id/units/:unitId")
  updateUnit(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Param("unitId", ParseUUIDPipe) unitId: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.updateUnit(sid, id, unitId, parse(resourceUnitSchema, b), req);
  }
}

@ApiTags("loans")
@Controller("schools/:schoolId/loans")
export class LoansController {
  constructor(private s: LoansService) {}
  @Perm("loans.view")
  @Get()
  list(
    @Param("schoolId", ParseUUIDPipe) sid: P,
    @Query("status") status?: string,
    @Query("overdue") overdue?: string,
    @Query("borrowerId") borrowerId?: string,
    @Query("resourceId") resourceId?: string,
    @Query("q") q?: string,
    @Query("page") p?: string,
    @Query("pageSize") ps?: string,
  ) {
    return this.s.list(sid, { status, overdue: overdue === "1", borrowerId, resourceId, q: q?.slice(0, 100), page: pg(p), pageSize: Math.min(pg(ps, 50), 200) });
  }
  @Perm("loans.view")
  @Get(":id")
  get(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P) {
    return this.s.get(sid, id);
  }
  @Perm("loans.create")
  @Post()
  create(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.create(sid, parse(loanSchema, b), u, req);
  }
  @Perm("loans.update")
  @Post(":id/returns")
  ret(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.returnLoan(sid, id, parse(loanReturnSchema, b), u, req);
  }
}
