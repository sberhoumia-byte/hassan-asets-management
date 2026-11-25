import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { categorySchema, inventoryPatternSchema, lookupValueSchema } from "@hassan/validation";
import { Perm, Req, SchoolScoped, type AppRequest } from "../common/context";
import { parse } from "../common/zod";
import { CatalogService } from "./catalog.service";

@ApiTags("catalog")
@Controller("schools/:schoolId")
export class CatalogController {
  constructor(private c: CatalogService) {}

  @SchoolScoped()
  @Get("categories")
  categories(@Param("schoolId", ParseUUIDPipe) schoolId: string) {
    return this.c.categories(schoolId);
  }

  @Perm("lookups.manage")
  @Post("categories")
  createCategory(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.c.createCategory(schoolId, parse(categorySchema, body), req);
  }

  @Perm("lookups.manage")
  @Put("categories/:id")
  updateCategory(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.c.updateCategory(schoolId, id, parse(categorySchema, body), req);
  }

  /** القوائم المرجعية: القيم العامة + قيم المؤسسة (all=1 يشمل المعطلة لشاشة الإدارة). */
  @SchoolScoped()
  @Get("lookups")
  lookups(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Query("listKey") listKey?: string, @Query("all") all?: string) {
    return this.c.lookups(schoolId, listKey, all === "1");
  }

  @Perm("lookups.manage")
  @Post("lookups/:listKey")
  createLookup(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Param("listKey") listKey: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.c.createLookup(schoolId, listKey, parse(lookupValueSchema, body), req);
  }

  @Perm("lookups.manage")
  @Put("lookups/value/:id")
  updateLookup(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.c.updateLookup(schoolId, id, parse(lookupValueSchema, body), req);
  }

  @SchoolScoped()
  @Get("settings/numbering")
  numbering(@Param("schoolId", ParseUUIDPipe) schoolId: string) {
    return this.c.numbering(schoolId);
  }

  @Perm("settings.manage")
  @Put("settings/numbering")
  setNumbering(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.c.setNumbering(schoolId, parse(inventoryPatternSchema, body).inventoryNumberPattern, req);
  }
}
