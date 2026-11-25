-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ar', 'fr');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'DAMAGED', 'UNDER_REPAIR', 'DISPOSED');

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('INDIVIDUAL', 'QUANTITY');

-- CreateEnum
CREATE TYPE "ResourceUnitStatus" AS ENUM ('AVAILABLE', 'ON_LOAN', 'DAMAGED', 'UNDER_MAINTENANCE', 'DISPOSED');

-- CreateEnum
CREATE TYPE "SpaceStatus" AS ENUM ('GOOD', 'NEEDS_MAINTENANCE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'IN', 'OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'RETURN', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'PARTIALLY_RETURNED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'IN_REPAIR', 'REPAIRED', 'UNREPAIRABLE', 'CLOSED');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "InventorySessionType" AS ENUM ('ANNUAL', 'PERIODIC', 'EXCEPTIONAL');

-- CreateEnum
CREATE TYPE "InventorySessionStatus" AS ENUM ('DRAFT', 'OPEN', 'COUNTING_DONE', 'VALIDATED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InventoryItemKind" AS ENUM ('ASSET', 'RESOURCE_UNIT', 'RESOURCE_QUANTITY', 'STOCK_ITEM');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('NEED_RECORDED', 'ESTIMATED', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'INVOICED', 'CLOSED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConformityResult" AS ENUM ('CONFORM', 'NON_CONFORM', 'PARTIAL');

-- CreateEnum
CREATE TYPE "CustodyAction" AS ENUM ('HANDOVER', 'ASSIGNMENT', 'RELOCATION', 'TRANSFER', 'RETURN');

-- CreateEnum
CREATE TYPE "StaffType" AS ENUM ('TEACHER', 'ADMINISTRATIVE', 'SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('STOCK_LOW', 'STOCK_OUT', 'STOCK_EXPIRY', 'LOAN_OVERDUE', 'MAINTENANCE_URGENT', 'INVENTORY_SESSION', 'APPROVAL_REQUEST', 'DELIVERY_RECEIVED', 'DOCUMENT_EXPIRY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RECEIVED', 'APPLIED', 'CONFLICT', 'REJECTED');

-- CreateEnum
CREATE TYPE "BackupKind" AS ENUM ('DATABASE', 'FILES', 'SETTINGS', 'FULL');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'VERIFIED', 'RESTORED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'MAPPED', 'VALIDATED', 'COMMITTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LetterheadMode" AS ENUM ('IMAGE', 'GENERATED');

-- CreateEnum
CREATE TYPE "LetterheadPlacement" AS ENUM ('FIRST_PAGE', 'ALL_PAGES');

-- CreateEnum
CREATE TYPE "MapShapeKind" AS ENUM ('POLYGON', 'RECTANGLE', 'CIRCLE', 'MARKER');

-- CreateTable
CREATE TABLE "academies" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameFr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provincial_directorates" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "code" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameFr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provincial_directorates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "directorateId" UUID NOT NULL,
    "adminCode" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameFr" TEXT,
    "cycle" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_years" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "school_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_settings" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "defaultLocale" "Locale" NOT NULL DEFAULT 'ar',
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "loanDefaultDays" INTEGER NOT NULL DEFAULT 7,
    "overdueReminderDays" INTEGER NOT NULL DEFAULT 1,
    "inventoryNumberPattern" TEXT NOT NULL DEFAULT '{SCHOOL}-{YEAR}-{SEQ:5}',
    "extra" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branding_settings" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "logoFileId" UUID,
    "logoWidthMm" DECIMAL(6,2),
    "logoPosition" TEXT,
    "defaultLetterheadId" UUID,
    "primaryColor" TEXT NOT NULL DEFAULT '#0B2545',
    "secondaryColor" TEXT NOT NULL DEFAULT '#1D5FA8',
    "footerText" TEXT,
    "showPageNumbers" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "branding_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letterheads" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "LetterheadMode" NOT NULL,
    "imageFileId" UUID,
    "imageWidthMm" DECIMAL(6,2),
    "imageHeightMm" DECIMAL(6,2),
    "textLines" JSONB,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showContact" BOOLEAN NOT NULL DEFAULT false,
    "placement" "LetterheadPlacement" NOT NULL DEFAULT 'ALL_PAGES',
    "heightMm" DECIMAL(6,2) NOT NULL DEFAULT 35,
    "marginsMm" JSONB,
    "footer" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "letterheads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullNameAr" TEXT NOT NULL,
    "fullNameFr" TEXT,
    "phone" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'ar',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameFr" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "descriptionAr" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "granted" BOOLEAN NOT NULL,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_values" (
    "id" UUID NOT NULL,
    "schoolId" UUID,
    "listKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelFr" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lookup_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floors" INTEGER,
    "builtYear" INTEGER,
    "status" "SpaceStatus" NOT NULL DEFAULT 'GOOD',
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "buildingId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spaceTypeId" UUID NOT NULL,
    "floor" TEXT,
    "locationNote" TEXT,
    "areaM2" DECIMAL(10,2),
    "capacity" INTEGER,
    "status" "SpaceStatus" NOT NULL DEFAULT 'GOOD',
    "lastInspectedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "roomId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facilityTypeId" UUID NOT NULL,
    "surfaceCondition" TEXT,
    "netsGoalsCondition" TEXT,
    "status" "SpaceStatus" NOT NULL DEFAULT 'GOOD',
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "roomId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" UUID NOT NULL,
    "schoolId" UUID,
    "parentId" UUID,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameFr" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "inventoryNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "assetTypeId" UUID,
    "description" TEXT,
    "trackingMode" "TrackingMode" NOT NULL DEFAULT 'INDIVIDUAL',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "serialNumber" TEXT,
    "acquisitionDate" DATE,
    "fundingSourceId" UUID,
    "acquisitionValue" DECIMAL(12,2),
    "supplierId" UUID,
    "roomId" UUID,
    "facilityId" UUID,
    "responsibleStaffId" UUID,
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "photoFileId" UUID,
    "qrToken" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchaseOrderItemId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_locations" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toDate" TIMESTAMP(3),
    "custodyRecordId" UUID,

    CONSTRAINT "asset_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" UUID,
    "unitId" UUID NOT NULL,
    "minQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "tracksExpiry" BOOLEAN NOT NULL DEFAULT false,
    "defaultSupplierId" UUID,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "itemId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("itemId","warehouseId")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "itemId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,2),
    "expiryDate" DATE,
    "supplierId" UUID,
    "recipientStaffId" UUID,
    "transferGroupId" UUID,
    "reversesId" UUID,
    "deliveryItemId" UUID,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,
    "clientOpId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "activityId" UUID,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "ice" TEXT,
    "otherIds" JSONB,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fundingSourceId" UUID,
    "managingBody" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflow_steps" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "requiredRoleCode" TEXT,
    "requiredUserId" UUID,

    CONSTRAINT "approval_workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "needDescription" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'NEED_RECORDED',
    "fundingSourceId" UUID,
    "budgetLine" TEXT,
    "estimatedTotal" DECIMAL(12,2),
    "supplierId" UUID,
    "workflowId" UUID,
    "orderDocRef" TEXT,
    "orderedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitId" UUID,
    "estimatedUnitCost" DECIMAL(12,2),
    "targetKind" TEXT NOT NULL,
    "inventoryItemId" UUID,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_approvals" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "stepId" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,

    CONSTRAINT "purchase_order_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "number" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receivedById" UUID NOT NULL,
    "conformity" "ConformityResult",
    "conformityNotes" TEXT,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_items" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "purchaseOrderItemId" UUID,
    "description" TEXT NOT NULL,
    "quantityReceived" DECIMAL(12,3) NOT NULL,
    "quantityAccepted" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "type" "StaffType" NOT NULL DEFAULT 'TEACHER',
    "staffNumber" TEXT,
    "fullNameAr" TEXT NOT NULL,
    "fullNameFr" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "userId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "schoolYearId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "level" TEXT,
    "roomId" UUID,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educational_resources" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resourceTypeId" UUID,
    "categoryId" UUID,
    "trackingMode" "TrackingMode" NOT NULL,
    "quantityTotal" INTEGER NOT NULL DEFAULT 0,
    "quantityDamaged" INTEGER NOT NULL DEFAULT 0,
    "roomId" UUID,
    "photoFileId" UUID,
    "acquisitionDate" DATE,
    "isLendable" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "educational_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educational_resource_units" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "inventoryNumber" TEXT NOT NULL,
    "serialNumber" TEXT,
    "status" "ResourceUnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "roomId" UUID,
    "qrToken" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "educational_resource_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_loans" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "unitId" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "borrowerStaffId" UUID NOT NULL,
    "classId" UUID,
    "loanedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "conditionOut" TEXT,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "borrowerSignature" JSONB,
    "handedOverById" UUID NOT NULL,
    "overdueNotifiedAt" TIMESTAMP(3),
    "clientOpId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_returns" (
    "id" UUID NOT NULL,
    "loanId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "returnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conditionIn" TEXT,
    "damaged" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "receivedById" UUID NOT NULL,
    "clientOpId" TEXT,

    CONSTRAINT "resource_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "assetId" UUID,
    "roomId" UUID,
    "facilityId" UUID,
    "resourceUnitId" UUID,
    "type" "MaintenanceType" NOT NULL,
    "damageTypeId" UUID,
    "description" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedById" UUID NOT NULL,
    "urgency" "Urgency" NOT NULL DEFAULT 'NORMAL',
    "assigneeId" UUID,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'NEW',
    "scheduleId" UUID,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "contractor" TEXT,
    "supplierInvoiceId" UUID,
    "cost" DECIMAL(12,2),
    "interventionReport" TEXT,
    "startedAt" TIMESTAMP(3),
    "repairedAt" TIMESTAMP(3),
    "outcome" "MaintenanceStatus" NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_schedules" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "remindDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_sessions" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "InventorySessionType" NOT NULL,
    "status" "InventorySessionStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "includesStock" BOOLEAN NOT NULL DEFAULT false,
    "reportNotes" TEXT,
    "validatedById" UUID,
    "validatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_session_scopes" (
    "sessionId" UUID NOT NULL,
    "roomId" UUID NOT NULL,

    CONSTRAINT "inventory_session_scopes_pkey" PRIMARY KEY ("sessionId","roomId")
);

-- CreateTable
CREATE TABLE "inventory_session_assignees" (
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "inventory_session_assignees_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateTable
CREATE TABLE "inventory_session_items" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "kind" "InventoryItemKind" NOT NULL,
    "assetId" UUID,
    "resourceId" UUID,
    "resourceUnitId" UUID,
    "stockItemId" UUID,
    "expectedRoomId" UUID,
    "foundRoomId" UUID,
    "expectedQty" DECIMAL(12,3) NOT NULL,
    "countedQty" DECIMAL(12,3),
    "conditionFound" TEXT,
    "isUnexpected" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "countedById" UUID,
    "countedAt" TIMESTAMP(3),
    "clientOpId" TEXT,

    CONSTRAINT "inventory_session_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_records" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "action" "CustodyAction" NOT NULL,
    "assetId" UUID NOT NULL,
    "fromStaffId" UUID,
    "toStaffId" UUID,
    "fromRoomId" UUID,
    "toRoomId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatures" JSONB,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" UUID,
    "documentDate" DATE,
    "issuingBody" TEXT,
    "expiresAt" DATE,
    "notes" TEXT,
    "accessLevel" TEXT NOT NULL DEFAULT 'SCHOOL',
    "archivedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "fileId" UUID NOT NULL,
    "changeNote" TEXT,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_links" (
    "documentId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,

    CONSTRAINT "document_links_pkey" PRIMARY KEY ("documentId","entityType","entityId")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" UUID,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId","type","channel")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "schoolId" UUID,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_sync_operations" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" TEXT NOT NULL,
    "clientOpId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "baseVersion" TEXT,
    "status" "SyncStatus" NOT NULL DEFAULT 'RECEIVED',
    "resultRef" TEXT,
    "error" TEXT,
    "clientCreatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "offline_sync_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_records" (
    "id" UUID NOT NULL,
    "schoolId" UUID,
    "kind" "BackupKind" NOT NULL,
    "status" "BackupStatus" NOT NULL,
    "storagePath" TEXT,
    "sizeBytes" BIGINT,
    "sha256" TEXT,
    "scheduled" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "restoredAt" TIMESTAMP(3),
    "triggeredById" UUID,
    "error" TEXT,

    CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "sourceFileId" UUID NOT NULL,
    "columnMapping" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER,
    "acceptedRows" INTEGER,
    "rejectedRows" INTEGER,
    "errorReport" JSONB,
    "createdById" UUID NOT NULL,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_templates" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "ownerId" UUID,
    "reportKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "columns" JSONB,
    "letterheadId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floor_plans" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "backgroundFileId" UUID,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floor_plan_shapes" (
    "id" UUID NOT NULL,
    "floorPlanId" UUID NOT NULL,
    "kind" "MapShapeKind" NOT NULL,
    "geometry" JSONB NOT NULL,
    "label" TEXT,
    "roomId" UUID,
    "facilityId" UUID,

    CONSTRAINT "floor_plan_shapes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ClassTeachers" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ClassTeachers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "academies_code_key" ON "academies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "academies_nameAr_key" ON "academies"("nameAr");

-- CreateIndex
CREATE INDEX "provincial_directorates_academyId_idx" ON "provincial_directorates"("academyId");

-- CreateIndex
CREATE UNIQUE INDEX "provincial_directorates_academyId_nameAr_key" ON "provincial_directorates"("academyId", "nameAr");

-- CreateIndex
CREATE UNIQUE INDEX "provincial_directorates_academyId_code_key" ON "provincial_directorates"("academyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "schools_adminCode_key" ON "schools"("adminCode");

-- CreateIndex
CREATE INDEX "schools_directorateId_idx" ON "schools"("directorateId");

-- CreateIndex
CREATE INDEX "schools_nameAr_idx" ON "schools"("nameAr");

-- CreateIndex
CREATE UNIQUE INDEX "school_years_schoolId_label_key" ON "school_years"("schoolId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "school_settings_schoolId_key" ON "school_settings"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "branding_settings_schoolId_key" ON "branding_settings"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "branding_settings_defaultLetterheadId_key" ON "branding_settings"("defaultLetterheadId");

-- CreateIndex
CREATE INDEX "letterheads_schoolId_idx" ON "letterheads"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refreshTokenHash_key" ON "auth_sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE INDEX "user_roles_schoolId_idx" ON "user_roles"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_schoolId_key" ON "user_roles"("userId", "roleId", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_userId_permissionId_schoolId_key" ON "user_permission_overrides"("userId", "permissionId", "schoolId");

-- CreateIndex
CREATE INDEX "lookup_values_listKey_idx" ON "lookup_values"("listKey");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_values_schoolId_listKey_code_key" ON "lookup_values"("schoolId", "listKey", "code");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_schoolId_key_year_key" ON "number_sequences"("schoolId", "key", "year");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storageKey_key" ON "stored_files"("storageKey");

-- CreateIndex
CREATE INDEX "stored_files_schoolId_idx" ON "stored_files"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_schoolId_code_key" ON "buildings"("schoolId", "code");

-- CreateIndex
CREATE INDEX "rooms_buildingId_idx" ON "rooms"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_schoolId_code_key" ON "rooms"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_schoolId_code_key" ON "facilities"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_schoolId_code_key" ON "warehouses"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_schoolId_code_key" ON "asset_categories"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "assets_qrToken_key" ON "assets"("qrToken");

-- CreateIndex
CREATE INDEX "assets_schoolId_status_idx" ON "assets"("schoolId", "status");

-- CreateIndex
CREATE INDEX "assets_schoolId_categoryId_idx" ON "assets"("schoolId", "categoryId");

-- CreateIndex
CREATE INDEX "assets_roomId_idx" ON "assets"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_schoolId_inventoryNumber_key" ON "assets"("schoolId", "inventoryNumber");

-- CreateIndex
CREATE INDEX "asset_locations_assetId_fromDate_idx" ON "asset_locations"("assetId", "fromDate");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_schoolId_code_key" ON "inventory_items"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reversesId_key" ON "stock_movements"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_clientOpId_key" ON "stock_movements"("clientOpId");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_warehouseId_occurredAt_idx" ON "stock_movements"("itemId", "warehouseId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_schoolId_occurredAt_idx" ON "stock_movements"("schoolId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_schoolId_number_key" ON "stock_movements"("schoolId", "number");

-- CreateIndex
CREATE INDEX "suppliers_schoolId_name_idx" ON "suppliers"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflow_steps_workflowId_stepOrder_key" ON "approval_workflow_steps"("workflowId", "stepOrder");

-- CreateIndex
CREATE INDEX "purchase_orders_schoolId_status_idx" ON "purchase_orders"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_schoolId_number_key" ON "purchase_orders"("schoolId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_approvals_purchaseOrderId_stepId_key" ON "purchase_order_approvals"("purchaseOrderId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_schoolId_number_key" ON "deliveries"("schoolId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_supplierId_invoiceNumber_key" ON "invoices"("supplierId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_userId_key" ON "staff_members"("userId");

-- CreateIndex
CREATE INDEX "staff_members_schoolId_type_idx" ON "staff_members"("schoolId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_schoolId_staffNumber_key" ON "staff_members"("schoolId", "staffNumber");

-- CreateIndex
CREATE UNIQUE INDEX "classes_schoolYearId_code_key" ON "classes"("schoolYearId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "educational_resources_schoolId_code_key" ON "educational_resources"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "educational_resource_units_qrToken_key" ON "educational_resource_units"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "educational_resource_units_resourceId_inventoryNumber_key" ON "educational_resource_units"("resourceId", "inventoryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "resource_loans_clientOpId_key" ON "resource_loans"("clientOpId");

-- CreateIndex
CREATE INDEX "resource_loans_schoolId_status_dueAt_idx" ON "resource_loans"("schoolId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "resource_loans_borrowerStaffId_idx" ON "resource_loans"("borrowerStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "resource_loans_schoolId_number_key" ON "resource_loans"("schoolId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "resource_returns_clientOpId_key" ON "resource_returns"("clientOpId");

-- CreateIndex
CREATE INDEX "resource_returns_loanId_idx" ON "resource_returns"("loanId");

-- CreateIndex
CREATE INDEX "maintenance_requests_schoolId_status_urgency_idx" ON "maintenance_requests"("schoolId", "status", "urgency");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_requests_schoolId_number_key" ON "maintenance_requests"("schoolId", "number");

-- CreateIndex
CREATE INDEX "maintenance_records_requestId_idx" ON "maintenance_records"("requestId");

-- CreateIndex
CREATE INDEX "maintenance_schedules_schoolId_nextDueAt_idx" ON "maintenance_schedules"("schoolId", "nextDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_sessions_schoolId_number_key" ON "inventory_sessions"("schoolId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_session_items_clientOpId_key" ON "inventory_session_items"("clientOpId");

-- CreateIndex
CREATE INDEX "inventory_session_items_sessionId_idx" ON "inventory_session_items"("sessionId");

-- CreateIndex
CREATE INDEX "custody_records_assetId_occurredAt_idx" ON "custody_records"("assetId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "custody_records_schoolId_number_key" ON "custody_records"("schoolId", "number");

-- CreateIndex
CREATE INDEX "documents_schoolId_categoryId_idx" ON "documents"("schoolId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_version_key" ON "document_versions"("documentId", "version");

-- CreateIndex
CREATE INDEX "document_links_entityType_entityId_idx" ON "document_links"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "audit_logs_schoolId_createdAt_idx" ON "audit_logs"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "offline_sync_operations_clientOpId_key" ON "offline_sync_operations"("clientOpId");

-- CreateIndex
CREATE INDEX "offline_sync_operations_schoolId_status_idx" ON "offline_sync_operations"("schoolId", "status");

-- CreateIndex
CREATE INDEX "backup_records_startedAt_idx" ON "backup_records"("startedAt");

-- CreateIndex
CREATE INDEX "import_jobs_schoolId_createdAt_idx" ON "import_jobs"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "floor_plan_shapes_floorPlanId_idx" ON "floor_plan_shapes"("floorPlanId");

-- CreateIndex
CREATE INDEX "_ClassTeachers_B_index" ON "_ClassTeachers"("B");

-- AddForeignKey
ALTER TABLE "provincial_directorates" ADD CONSTRAINT "provincial_directorates_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "provincial_directorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding_settings" ADD CONSTRAINT "branding_settings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding_settings" ADD CONSTRAINT "branding_settings_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding_settings" ADD CONSTRAINT "branding_settings_defaultLetterheadId_fkey" FOREIGN KEY ("defaultLetterheadId") REFERENCES "letterheads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letterheads" ADD CONSTRAINT "letterheads_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letterheads" ADD CONSTRAINT "letterheads_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookup_values" ADD CONSTRAINT "lookup_values_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_responsibleStaffId_fkey" FOREIGN KEY ("responsibleStaffId") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_locations" ADD CONSTRAINT "asset_locations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_locations" ADD CONSTRAINT "asset_locations_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_defaultSupplierId_fkey" FOREIGN KEY ("defaultSupplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_recipientStaffId_fkey" FOREIGN KEY ("recipientStaffId") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_deliveryItemId_fkey" FOREIGN KEY ("deliveryItemId") REFERENCES "delivery_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflow_steps" ADD CONSTRAINT "approval_workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_approvals" ADD CONSTRAINT "purchase_order_approvals_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_approvals" ADD CONSTRAINT "purchase_order_approvals_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "approval_workflow_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educational_resources" ADD CONSTRAINT "educational_resources_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educational_resources" ADD CONSTRAINT "educational_resources_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educational_resources" ADD CONSTRAINT "educational_resources_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educational_resource_units" ADD CONSTRAINT "educational_resource_units_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "educational_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educational_resource_units" ADD CONSTRAINT "educational_resource_units_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_loans" ADD CONSTRAINT "resource_loans_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_loans" ADD CONSTRAINT "resource_loans_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "educational_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_loans" ADD CONSTRAINT "resource_loans_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "educational_resource_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_loans" ADD CONSTRAINT "resource_loans_borrowerStaffId_fkey" FOREIGN KEY ("borrowerStaffId") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_loans" ADD CONSTRAINT "resource_loans_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_returns" ADD CONSTRAINT "resource_returns_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "resource_loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_resourceUnitId_fkey" FOREIGN KEY ("resourceUnitId") REFERENCES "educational_resource_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "maintenance_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "maintenance_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sessions" ADD CONSTRAINT "inventory_sessions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_session_scopes" ADD CONSTRAINT "inventory_session_scopes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inventory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_session_scopes" ADD CONSTRAINT "inventory_session_scopes_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_session_assignees" ADD CONSTRAINT "inventory_session_assignees_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inventory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_session_items" ADD CONSTRAINT "inventory_session_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inventory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_session_items" ADD CONSTRAINT "inventory_session_items_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_session_items" ADD CONSTRAINT "inventory_session_items_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "educational_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_session_items" ADD CONSTRAINT "inventory_session_items_resourceUnitId_fkey" FOREIGN KEY ("resourceUnitId") REFERENCES "educational_resource_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_session_items" ADD CONSTRAINT "inventory_session_items_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_fromStaffId_fkey" FOREIGN KEY ("fromStaffId") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_toStaffId_fkey" FOREIGN KEY ("toStaffId") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_fromRoomId_fkey" FOREIGN KEY ("fromRoomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_toRoomId_fkey" FOREIGN KEY ("toRoomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sync_operations" ADD CONSTRAINT "offline_sync_operations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_letterheadId_fkey" FOREIGN KEY ("letterheadId") REFERENCES "letterheads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plans" ADD CONSTRAINT "floor_plans_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plans" ADD CONSTRAINT "floor_plans_backgroundFileId_fkey" FOREIGN KEY ("backgroundFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plan_shapes" ADD CONSTRAINT "floor_plan_shapes_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "floor_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plan_shapes" ADD CONSTRAINT "floor_plan_shapes_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plan_shapes" ADD CONSTRAINT "floor_plan_shapes_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClassTeachers" ADD CONSTRAINT "_ClassTeachers_A_fkey" FOREIGN KEY ("A") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClassTeachers" ADD CONSTRAINT "_ClassTeachers_B_fkey" FOREIGN KEY ("B") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===================== قيود إضافية (prisma/sql/constraints.sql) =====================
-- =====================================================================
-- قيود لا يعبّر عنها Prisma. تُلحق بأول migration في المرحلة الثالثة.
-- =====================================================================

-- 1) المخزون: الرصيد لا يكون سالباً أبداً، والكميات موجبة.
ALTER TABLE stock_balances  ADD CONSTRAINT stock_balance_non_negative CHECK (quantity >= 0);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movement_qty_positive CHECK (quantity > 0);

-- 2) حركات المخزون غير قابلة للتعديل أو الحذف (التصحيح بحركة REVERSAL).
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'P0001';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- 3) سجل التدقيق: إلحاق فقط.
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- 4) الإعارة: لا يمكن إعارة نفس الوحدة الفردية مرتين في وقت واحد.
CREATE UNIQUE INDEX resource_loans_one_active_per_unit
  ON resource_loans ("unitId")
  WHERE "unitId" IS NOT NULL AND status IN ('ACTIVE', 'PARTIALLY_RETURNED');

ALTER TABLE resource_loans ADD CONSTRAINT loan_qty_positive CHECK (quantity > 0);
ALTER TABLE resource_loans ADD CONSTRAINT loan_unit_qty_one CHECK ("unitId" IS NULL OR quantity = 1);
ALTER TABLE resource_loans ADD CONSTRAINT loan_due_after_start CHECK ("dueAt" >= "loanedAt");

-- 5) الوسائل الكمية: المعطوب لا يتجاوز الإجمالي.
ALTER TABLE educational_resources ADD CONSTRAINT resource_qty_valid
  CHECK ("quantityTotal" >= 0 AND "quantityDamaged" >= 0 AND "quantityDamaged" <= "quantityTotal");

-- 6) طلب الصيانة يستهدف كياناً واحداً بالضبط.
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_single_target CHECK (
  num_nonnulls("assetId", "roomId", "facilityId", "resourceUnitId") = 1
);

-- 7) سطر جرد يستهدف كياناً واحداً حسب نوعه.
ALTER TABLE inventory_session_items ADD CONSTRAINT inventory_line_single_target CHECK (
  num_nonnulls("assetId", "resourceUnitId", "stockItemId") +
  CASE WHEN kind = 'RESOURCE_QUANTITY' THEN (CASE WHEN "resourceId" IS NOT NULL THEN 1 ELSE 0 END) ELSE 0 END = 1
);

-- 8) القوائم العامة: تفرد (listKey, code) عندما schoolId = NULL
--    (UNIQUE العادي في PostgreSQL لا يعتبر NULL مكرراً).
CREATE UNIQUE INDEX lookup_values_global_unique
  ON lookup_values ("listKey", code) WHERE "schoolId" IS NULL;
CREATE UNIQUE INDEX asset_categories_global_unique
  ON asset_categories (code) WHERE "schoolId" IS NULL;

-- 9) سنة دراسية حالية واحدة لكل مؤسسة.
CREATE UNIQUE INDEX school_years_one_current
  ON school_years ("schoolId") WHERE "isCurrent";

-- 10) الأسعار والقيم غير سالبة.
ALTER TABLE assets ADD CONSTRAINT asset_value_non_negative CHECK ("acquisitionValue" IS NULL OR "acquisitionValue" >= 0);
ALTER TABLE assets ADD CONSTRAINT asset_qty_positive CHECK (quantity >= 1);
