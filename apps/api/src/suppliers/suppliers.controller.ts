import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { supplierSchema } from "@hassan/validation";
import { Perm, Req, type AppRequest } from "../common/context";
import { parse } from "../common/zod";
import { SuppliersService } from "./suppliers.service";

@ApiTags("suppliers")
@Controller("schools/:schoolId/suppliers")
export class SuppliersController {
  constructor(private s: SuppliersService) {}

  /** القائمة متاحة أيضاً لمن يدير الممتلكات أو المخزون (لاختيار المورد في النماذج). */
  @Perm("suppliers.view")
  @Get()
  list(@Param("schoolId", ParseUUIDPipe) sid: string, @Query("q") q?: string, @Query("archived") archived?: string) {
    return this.s.list(sid, { q: q?.slice(0, 100), archived: archived === "1" });
  }

  @Perm("suppliers.create")
  @Post()
  create(@Param("schoolId", ParseUUIDPipe) sid: string, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.create(sid, parse(supplierSchema, b), req);
  }

  @Perm("suppliers.update")
  @Put(":id")
  update(@Param("schoolId", ParseUUIDPipe) sid: string, @Param("id", ParseUUIDPipe) id: string, @Body() b: unknown, @Req() req: AppRequest) {
    return this.s.update(sid, id, parse(supplierSchema, b), req);
  }

  @Perm("suppliers.archive")
  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("schoolId", ParseUUIDPipe) sid: string, @Param("id", ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return this.s.setArchived(sid, id, true, req);
  }

  @Perm("suppliers.archive")
  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("schoolId", ParseUUIDPipe) sid: string, @Param("id", ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return this.s.setArchived(sid, id, false, req);
  }
}
