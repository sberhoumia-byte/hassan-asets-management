import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { floorPlanSchema, floorPlanShapesSchema } from "@hassan/validation";
import { CurrentUser, Perm, Req, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { FloorPlanService } from "./floorplan.service";

const SID = () => Param("schoolId", ParseUUIDPipe);
const ID = () => Param("id", ParseUUIDPipe);

@ApiTags("floorplan")
@Controller("schools/:schoolId/floor-plans")
export class FloorPlanController {
  constructor(private s: FloorPlanService) {}

  @Perm("floorplan.view")
  @Get()
  list(@SID() sid: string) {
    return this.s.list(sid);
  }

  @Perm("floorplan.view")
  @Get(":id")
  get(@SID() sid: string, @ID() id: string) {
    return this.s.get(sid, id);
  }

  @Perm("floorplan.view")
  @Get(":id/background")
  async background(@SID() sid: string, @ID() id: string, @Res() res: Response) {
    const f = await this.s.background(sid, id);
    res.setHeader("Content-Type", f.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(f.buf);
  }

  @Perm("floorplan.create")
  @Post()
  create(@SID() sid: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.create(sid, parse(floorPlanSchema, body), u, req);
  }

  @Perm("floorplan.update")
  @Put(":id")
  update(@SID() sid: string, @ID() id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.s.update(sid, id, parse(floorPlanSchema, body), u, req);
  }

  @Perm("floorplan.update")
  @Put(":id/shapes")
  shapes(@SID() sid: string, @ID() id: string, @Body() body: unknown, @Req() req: AppRequest) {
    return this.s.saveShapes(sid, id, parse(floorPlanShapesSchema, body).shapes, req);
  }

  @Perm("floorplan.archive")
  @Delete(":id")
  remove(@SID() sid: string, @ID() id: string, @Req() req: AppRequest) {
    return this.s.remove(sid, id, req);
  }
}
