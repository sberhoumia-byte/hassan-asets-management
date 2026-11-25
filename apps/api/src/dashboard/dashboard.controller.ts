import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser, Perm, type AuthUser } from "../common/context";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@Controller()
export class DashboardController {
  constructor(private d: DashboardService) {}

  @Perm("dashboard.view")
  @Get("schools/:schoolId/dashboard/stats")
  stats(@Param("schoolId", ParseUUIDPipe) schoolId: string) {
    return this.d.stats(schoolId);
  }

  @Perm("dashboard.view")
  @Get("schools/:schoolId/dashboard/charts")
  charts(@Param("schoolId", ParseUUIDPipe) schoolId: string) {
    return this.d.charts(schoolId);
  }

  @Perm("dashboard.view")
  @Get("schools/:schoolId/dashboard/alerts")
  alerts(@Param("schoolId", ParseUUIDPipe) schoolId: string) {
    return this.d.alerts(schoolId);
  }

  @Perm("dashboard.view")
  @Get("schools/:schoolId/dashboard/activity")
  activity(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Query("limit") limit?: string) {
    return this.d.activity(schoolId, Number(limit) || 8);
  }

  @Get("notifications")
  notifications(@CurrentUser() u: AuthUser) {
    return this.d.notifications(u.id);
  }
}
