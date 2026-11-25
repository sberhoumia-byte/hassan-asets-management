import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { userCreateSchema, userOverridesSchema, userRolesSchema, userUpdateSchema } from "@hassan/validation";
import { CurrentUser, Perm, Req, SchoolId, type AppRequest, type AuthUser } from "../common/context";
import { parse } from "../common/zod";
import { UsersService } from "./users.service";

/** إدارة المستخدمين داخل المؤسسة النشطة (ترويسة X-School-Id) — صلاحية users.manage. */
@ApiTags("users")
@Controller()
export class UsersController {
  constructor(private users: UsersService) {}

  @Get("roles")
  roles() {
    return this.users.roles();
  }

  @Get("permissions")
  permissions() {
    return this.users.permissions();
  }

  @Perm("users.manage")
  @Get("users")
  list(@SchoolId() schoolId: string, @CurrentUser() u: AuthUser) {
    return this.users.list(schoolId, u);
  }

  @Perm("users.manage")
  @Post("users")
  create(@SchoolId() schoolId: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.users.create(schoolId, parse(userCreateSchema, body), u, req);
  }

  @Perm("users.manage")
  @Put("users/:id")
  update(@SchoolId() schoolId: string, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.users.update(schoolId, id, parse(userUpdateSchema, body), u, req);
  }

  @Perm("users.manage")
  @Put("users/:id/roles")
  roles_(@SchoolId() schoolId: string, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.users.setRoles(schoolId, id, parse(userRolesSchema, body).roles, u, req);
  }

  @Perm("users.manage")
  @Put("users/:id/overrides")
  overrides(@SchoolId() schoolId: string, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.users.setOverrides(schoolId, id, parse(userOverridesSchema, body), u, req);
  }

  @Perm("users.manage")
  @Post("users/:id/reset-password")
  @HttpCode(200)
  resetPassword(@SchoolId() schoolId: string, @Param("id", ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: AppRequest) {
    return this.users.resetPassword(schoolId, id, u, req);
  }
}
