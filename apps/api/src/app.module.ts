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
import { CatalogService } from "./catalog/catalog.service";
import { CatalogController } from "./catalog/catalog.controller";
import { AssetsService } from "./assets/assets.service";
import { AssetsController } from "./assets/assets.controller";
import { StockService } from "./stock/stock.service";
import { StockController } from "./stock/stock.controller";
import { SuppliersService } from "./suppliers/suppliers.service";
import { SuppliersController } from "./suppliers/suppliers.controller";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}),
    // حد عام سخي لكل عنوان؛ مسارات الدخول لها حد أضيق (@Throttle)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
  ],
  controllers: [AuthController, HierarchyController, BrandingController, DashboardController, UsersController, HealthController, CatalogController, AssetsController, StockController, SuppliersController],
  providers: [
    AuditService,
    AccessService,
    StorageService,
    AuthService,
    HierarchyService,
    BrandingService,
    DashboardService,
    UsersService,
    CatalogService,
    AssetsService,
    StockService,
    SuppliersService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AppGuard },
  ],
})
export class AppModule {}
