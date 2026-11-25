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
import { SpacesService } from "./spaces/spaces.service";
import { StaffService } from "./staff/staff.service";
import { ResourcesService } from "./resources/resources.service";
import { LoansService } from "./loans/loans.service";
import { LoansController, ResourcesController, SpacesController, StaffController } from "./phase5.controllers";
import { MaintenanceService } from "./maintenance/maintenance.service";
import { CustodyService } from "./custody/custody.service";
import { InventoryService } from "./inventory/inventory.service";
import { PurchasingService } from "./purchasing/purchasing.service";
import { CustodyController, InventoryController, MaintenanceController, PurchasingController } from "./phase6.controllers";
import { PdfService } from "./reports/pdf.service";
import { ReportsService } from "./reports/reports.service";
import { ReportsController } from "./reports/reports.controller";
import { ImportsService } from "./imports/imports.service";
import { ImportsController } from "./imports/imports.controller";
import { DocumentsService } from "./documents/documents.service";
import { DocumentsController } from "./documents/documents.controller";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}),
    // حد عام سخي لكل عنوان؛ مسارات الدخول لها حد أضيق (@Throttle)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
  ],
  controllers: [AuthController, HierarchyController, BrandingController, DashboardController, UsersController, HealthController, CatalogController, AssetsController, StockController, SuppliersController, SpacesController, StaffController, ResourcesController, LoansController, MaintenanceController, CustodyController, InventoryController, PurchasingController, ReportsController, ImportsController, DocumentsController],
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
    SpacesService,
    StaffService,
    ResourcesService,
    LoansService,
    MaintenanceService,
    CustodyService,
    InventoryService,
    PurchasingService,
    PdfService,
    ReportsService,
    ImportsService,
    DocumentsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AppGuard },
  ],
})
export class AppModule {}
