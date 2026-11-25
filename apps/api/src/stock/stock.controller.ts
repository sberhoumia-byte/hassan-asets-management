import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  stockAdjustSchema,
  stockInSchema,
  stockItemSchema,
  stockOutSchema,
  stockReturnSchema,
  stockReverseSchema,
  stockTransferSchema,
  warehouseSchema,
} from "@hassan/validation";
import { CurrentUser, Perm, Req, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { StockService } from "./stock.service";

const pg = (v?: string, d = 1) => Math.max(1, Math.min(Number(v) || d, 10_000));
type P = string;

@ApiTags("stock")
@Controller("schools/:schoolId")
export class StockController {
  constructor(private s: StockService) {}

  @Perm("stock.view")
  @Get("warehouses")
  warehouses(@Param("schoolId", ParseUUIDPipe) sid: P) {
    return this.s.warehouses(sid);
  }

  @Perm("stock.create")
  @Post("warehouses")
  createWarehouse(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.createWarehouse(sid, parse(warehouseSchema, b), req);
  }

  @Perm("stock.update")
  @Put("warehouses/:id")
  updateWarehouse(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.updateWarehouse(sid, id, parse(warehouseSchema, b), req);
  }

  @Perm("stock.view")
  @Get("stock/items")
  items(@Param("schoolId", ParseUUIDPipe) sid: P, @Query("q") q?: string, @Query("alert") alert?: string, @Query("all") all?: string) {
    return this.s.items(sid, { q: q?.slice(0, 100), alert, includeInactive: all === "1" });
  }

  @Perm("stock.create")
  @Post("stock/items")
  createItem(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.createItem(sid, parse(stockItemSchema, b), req);
  }

  @Perm("stock.update")
  @Put("stock/items/:id")
  updateItem(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.updateItem(sid, id, parse(stockItemSchema, b), req);
  }

  @Perm("stock.view")
  @Get("stock/movements")
  movements(
    @Param("schoolId", ParseUUIDPipe) sid: P,
    @Query("itemId") itemId?: string,
    @Query("warehouseId") warehouseId?: string,
    @Query("type") type?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") p?: string,
    @Query("pageSize") ps?: string,
  ) {
    const d = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
    return this.s.movements(sid, { itemId, warehouseId, type, from: d(from), to: d(to), page: pg(p), pageSize: Math.min(pg(ps, 50), 200) });
  }

  @Perm("stock.create")
  @Post("stock/movements/in")
  in_(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.stockIn(sid, parse(stockInSchema, b), u, req);
  }

  @Perm("stock.create")
  @Post("stock/movements/out")
  out(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.stockOut(sid, parse(stockOutSchema, b), u, req);
  }

  @Perm("stock.create")
  @Post("stock/movements/return")
  ret(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.stockReturn(sid, parse(stockReturnSchema, b), u, req);
  }

  @Perm("stock.create")
  @Post("stock/movements/transfer")
  transfer(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.transfer(sid, parse(stockTransferSchema, b), u, req);
  }

  @Perm("stock.adjust")
  @Post("stock/movements/adjust")
  adjust(@Param("schoolId", ParseUUIDPipe) sid: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.adjust(sid, parse(stockAdjustSchema, b), u, req);
  }

  @Perm("stock.reverse")
  @Post("stock/movements/:id/reverse")
  @HttpCode(200)
  reverse(@Param("schoolId", ParseUUIDPipe) sid: P, @Param("id", ParseUUIDPipe) id: P, @Body() b: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.reverse(sid, id, parse(stockReverseSchema, b).reason, u, req);
  }

  @Perm("stock.view")
  @Get("stock/alerts")
  alerts(@Param("schoolId", ParseUUIDPipe) sid: P) {
    return this.s.alerts(sid);
  }
}
