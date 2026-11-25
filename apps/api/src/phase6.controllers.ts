/** مسارات المرحلة 6: الصيانة، العهدة، الجرد، الطلبيات ومسارات الموافقة. كلها تحت /schools/:schoolId. */
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  approvalWorkflowSchema,
  custodySchema,
  deliverySchema,
  inventoryCountSchema,
  inventorySessionSchema,
  inventoryValidateSchema,
  invoiceSchema,
  maintenanceRecordSchema,
  maintenanceRequestSchema,
  maintenanceScheduleSchema,
  maintenanceTransitionSchema,
  poCancelSchema,
  poDecisionSchema,
  poOrderSchema,
  poSubmitSchema,
  postDeliverySchema,
  purchaseOrderSchema,
} from "@hassan/validation";
import { CurrentUser, Perm, Req, SchoolScoped, type AppRequest, type AuthUser } from "./common/context";
import { parse } from "./common/zod";
import { MaintenanceService } from "./maintenance/maintenance.service";
import { CustodyService } from "./custody/custody.service";
import { InventoryService } from "./inventory/inventory.service";
import { PurchasingService } from "./purchasing/purchasing.service";

type P = string;
const pg = (v?: string, d = 1) => Math.max(1, Math.min(Number(v) || d, 10_000));
const SID = () => Param("schoolId", ParseUUIDPipe);
const ID = () => Param("id", ParseUUIDPipe);

@ApiTags("maintenance")
@Controller("schools/:schoolId/maintenance")
export class MaintenanceController {
  constructor(private s: MaintenanceService) {}

  @Perm("maintenance.view")
  @Get("requests")
  list(
    @SID() sid: P,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("urgency") urgency?: string,
    @Query("open") open?: string,
    @Query("targetType") targetType?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.s.list(sid, { q: q?.slice(0, 100), status, urgency, open: open === "1", targetType, page: pg(page), pageSize: Math.min(pg(pageSize, 25), 100) });
  }
  @Perm("maintenance.view")
  @Get("assignees")
  assignees(@SID() sid: P) {
    return this.s.assignees(sid);
  }
  @Perm("maintenance.view")
  @Get("requests/:id")
  get(@SID() sid: P, @ID() id: P) {
    return this.s.get(sid, id);
  }
  // التبليغ عن عطب متاح لكل عضو له صلاحية إنشاء طلب صيانة
  @Perm("maintenance.create")
  @Post("requests")
  create(@SID() sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.create(sid, parse(maintenanceRequestSchema, b), u, req);
  }
  @Perm("maintenance.update")
  @Put("requests/:id")
  update(@SID() sid: P, @ID() id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.update(sid, id, parse(maintenanceRequestSchema.pick({ damageTypeId: true, description: true, urgency: true, assigneeId: true }), b), req);
  }
  @Perm("maintenance.update")
  @Post("requests/:id/transition")
  @HttpCode(200)
  transition(@SID() sid: P, @ID() id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.transition(sid, id, parse(maintenanceTransitionSchema, b), req);
  }
  @Perm("maintenance.update")
  @Post("requests/:id/records")
  addRecord(@SID() sid: P, @ID() id: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.addRecord(sid, id, parse(maintenanceRecordSchema, b), u, req);
  }

  @Perm("maintenance.view")
  @Get("schedules")
  schedules(@SID() sid: P) {
    return this.s.schedules(sid);
  }
  @Perm("maintenance.create")
  @Post("schedules")
  createSchedule(@SID() sid: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.saveSchedule(sid, null, parse(maintenanceScheduleSchema, b), req);
  }
  @Perm("maintenance.update")
  @Put("schedules/:id")
  updateSchedule(@SID() sid: P, @ID() id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.saveSchedule(sid, id, parse(maintenanceScheduleSchema, b), req);
  }
  @Perm("maintenance.create")
  @Post("schedules/:id/generate")
  generate(@SID() sid: P, @ID() id: P, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.generateFromSchedule(sid, id, u, req);
  }
}

@ApiTags("custody")
@Controller("schools/:schoolId/custody")
export class CustodyController {
  constructor(private s: CustodyService) {}

  @Perm("custody.view")
  @Get()
  list(
    @SID() sid: P,
    @Query("assetId") assetId?: string,
    @Query("staffId") staffId?: string,
    @Query("action") action?: string,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.s.list(sid, { assetId, staffId, action, q: q?.slice(0, 100), page: pg(page), pageSize: Math.min(pg(pageSize, 25), 100) });
  }
  @Perm("custody.view")
  @Get(":id")
  get(@SID() sid: P, @ID() id: P) {
    return this.s.get(sid, id);
  }
  @Perm("custody.create")
  @Post()
  create(@SID() sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.create(sid, parse(custodySchema, b), u, req);
  }
}

@ApiTags("inventory")
@Controller("schools/:schoolId/inventory-sessions")
export class InventoryController {
  constructor(private s: InventoryService) {}

  @Perm("inventory.view")
  @Get()
  list(@SID() sid: P) {
    return this.s.list(sid);
  }
  @Perm("inventory.create")
  @Get("assignable-users")
  assignable(@SID() sid: P) {
    return this.s.assignable(sid);
  }
  @Perm("inventory.view")
  @Get(":id")
  get(@SID() sid: P, @ID() id: P) {
    return this.s.get(sid, id);
  }
  @Perm("inventory.view")
  @Get(":id/lines")
  lines(@SID() sid: P, @ID() id: P, @Query("roomId") roomId?: string, @Query("filter") filter?: string, @Query("q") q?: string) {
    return this.s.lines(sid, id, { roomId, filter, q: q?.slice(0, 100) });
  }
  @Perm("inventory.view")
  @Get(":id/discrepancies")
  discrepancies(@SID() sid: P, @ID() id: P) {
    return this.s.discrepancies(sid, id);
  }
  @Perm("inventory.create")
  @Post()
  create(@SID() sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.create(sid, parse(inventorySessionSchema, b), u, req);
  }
  @Perm("inventory.update")
  @Put(":id")
  update(@SID() sid: P, @ID() id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.update(sid, id, parse(inventorySessionSchema, b), req);
  }
  @Perm("inventory.update")
  @Post(":id/open")
  @HttpCode(200)
  open(@SID() sid: P, @ID() id: P, @Req() req: AppRequest) {
    return this.s.open(sid, id, req);
  }
  // العدّ: الخدمة تتحقق من أن المستخدم مكلَّف بالجرد إن حُدد مكلَّفون
  @Perm("inventory.view")
  @Post(":id/counts")
  @HttpCode(200)
  count(@SID() sid: P, @ID() id: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.count(sid, id, parse(inventoryCountSchema, b), u, req);
  }
  @Perm("inventory.update")
  @Post(":id/complete")
  @HttpCode(200)
  complete(@SID() sid: P, @ID() id: P, @Req() req: AppRequest) {
    return this.s.complete(sid, id, req);
  }
  @Perm("inventory.update")
  @Post(":id/reopen")
  @HttpCode(200)
  reopen(@SID() sid: P, @ID() id: P, @Req() req: AppRequest) {
    return this.s.reopen(sid, id, req);
  }
  @Perm("inventory.validate")
  @Post(":id/validate")
  @HttpCode(200)
  validate(@SID() sid: P, @ID() id: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.validate(sid, id, parse(inventoryValidateSchema, b).reportNotes, u, req);
  }
  @Perm("inventory.validate")
  @Post(":id/close")
  @HttpCode(200)
  close(@SID() sid: P, @ID() id: P, @Req() req: AppRequest) {
    return this.s.close(sid, id, req);
  }
  @Perm("inventory.archive")
  @Post(":id/archive")
  @HttpCode(200)
  archive(@SID() sid: P, @ID() id: P, @Req() req: AppRequest) {
    return this.s.archive(sid, id, req);
  }
}

@ApiTags("purchasing")
@Controller("schools/:schoolId")
export class PurchasingController {
  constructor(private s: PurchasingService) {}

  @Perm("purchasing.view")
  @Get("approval-workflows")
  workflows(@SID() sid: P) {
    return this.s.workflows(sid);
  }
  @Perm("settings.manage")
  @Post("approval-workflows")
  createWorkflow(@SID() sid: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.saveWorkflow(sid, null, parse(approvalWorkflowSchema, b), req);
  }
  @Perm("settings.manage")
  @Put("approval-workflows/:id")
  updateWorkflow(@SID() sid: P, @ID() id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.saveWorkflow(sid, id, parse(approvalWorkflowSchema, b), req);
  }

  @Perm("purchasing.view")
  @Get("purchase-orders")
  list(@SID() sid: P, @Query("q") q?: string, @Query("status") status?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.s.list(sid, { q: q?.slice(0, 100), status, page: pg(page), pageSize: Math.min(pg(pageSize, 25), 100) });
  }
  @Perm("purchasing.view")
  @Get("purchase-orders/:id")
  get(@SID() sid: P, @ID() id: P) {
    return this.s.get(sid, id);
  }
  @Perm("purchasing.create")
  @Post("purchase-orders")
  create(@SID() sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.create(sid, parse(purchaseOrderSchema, b), u, req);
  }
  @Perm("purchasing.update")
  @Put("purchase-orders/:id")
  update(@SID() sid: P, @ID() id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.update(sid, id, parse(purchaseOrderSchema, b), req);
  }
  @Perm("purchasing.update")
  @Post("purchase-orders/:id/submit")
  @HttpCode(200)
  submit(@SID() sid: P, @ID() id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.submit(sid, id, parse(poSubmitSchema, b ?? {}).workflowId, req);
  }
  // صلاحية كل خطوة (الدور المطلوب) تُفحص في الخدمة
  @SchoolScoped()
  @Post("purchase-orders/:id/approvals/:stepId")
  @HttpCode(200)
  decide(@SID() sid: P, @ID() id: P, @Param("stepId", ParseUUIDPipe) stepId: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    const d = parse(poDecisionSchema, b);
    return this.s.decide(sid, id, stepId, d.decision, d.comment || undefined, u, req);
  }
  @Perm("purchasing.update")
  @Post("purchase-orders/:id/order")
  @HttpCode(200)
  order(@SID() sid: P, @ID() id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.order(sid, id, parse(poOrderSchema, b), req);
  }
  @Perm("purchasing.cancel")
  @Post("purchase-orders/:id/cancel")
  @HttpCode(200)
  cancel(@SID() sid: P, @ID() id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.cancel(sid, id, parse(poCancelSchema, b).reason, req);
  }
  @Perm("purchasing.update")
  @Post("purchase-orders/:id/deliveries")
  deliver(@SID() sid: P, @ID() id: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.deliver(sid, id, parse(deliverySchema, b), u, req);
  }
  @Perm("purchasing.update")
  @Post("deliveries/post")
  @HttpCode(200)
  post(@SID() sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.post(sid, parse(postDeliverySchema, b), u, req);
  }
  @Perm("purchasing.update")
  @Post("purchase-orders/:id/invoices")
  invoice(@SID() sid: P, @ID() id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.addInvoice(sid, id, parse(invoiceSchema, b), req);
  }
  @Perm("purchasing.update")
  @Post("purchase-orders/:id/close")
  @HttpCode(200)
  close(@SID() sid: P, @ID() id: P, @Req() req: AppRequest) {
    return this.s.close(sid, id, req);
  }
}
