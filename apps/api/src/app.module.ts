import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.service";
import { AuditService } from "./common/audit.service";
import { AccessService } from "./rbac/access.service";
import { AppGuard } from "./rbac/guards";
import { StorageService } from "./files/storage.service";
import { AuthService } from "./auth/auth.service";
import { AuthController } from "./auth/auth.controller";
import { HierarchyService } from "./hierarchy/hierarchy.service";
import { HierarchyController } from "./hierarchy/hierarchy.controller";
import { BrandingService } from "./branding/branding.service";
import { BrandingController } from "./branding/branding.controller";
import { DashboardService } from "./dashboard/dashboard.service";
import { DashboardController } from "./dashboard/dashboard.controller";
import { UsersService } from "./users/users.service";
import { UsersController } from "./users/users.controller";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}),
    // حد عام سخي لكل عنوان؛ مسارات الدخول لها حد أضيق (@Throttle)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
  ],
  controllers: [AuthController, HierarchyController, BrandingController, DashboardController, UsersController, HealthController],
  providers: [
    AuditService,
    AccessService,
    StorageService,
    AuthService,
    HierarchyService,
    BrandingService,
    DashboardService,
    UsersService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AppGuard },
  ],
})
export class AppModule {}
