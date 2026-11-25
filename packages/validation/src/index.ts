/**
 * مخططات التحقق المشتركة بين الواجهة والخادم.
 * رسائل الأخطاء مفاتيح ترجمة (errors.*) تترجمها الواجهة حسب اللغة.
 */
import { z } from "zod";

// حقل غائب كلياً يُعرض كـ"مطلوب" بدل رسالة zod الإنجليزية العامة؛ ونوع خاطئ كـ"قيمة غير صالحة"
z.config({
  customError: (iss) => (iss.code === "invalid_type" ? (iss.input === undefined || iss.input === null ? "errors.required" : "errors.invalidChoice") : undefined),
});

const req = (s: z.ZodString) => s.trim().min(1, "errors.required");
const optionalText = z.string().trim().max(300, "errors.tooLong").optional().or(z.literal(""));

export const loginSchema = z.object({
  username: req(z.string()),
  password: req(z.string()),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordSchema = z
  .string()
  .min(10, "errors.passwordMin")
  .max(128, "errors.tooLong")
  .refine((v) => /[A-Za-z؀-ۿ]/.test(v) && /\d/.test(v), "errors.passwordMix");

export const setupAdminSchema = z
  .object({
    fullNameAr: req(z.string()).max(120, "errors.tooLong"),
    username: req(z.string())
      .min(3, "errors.usernameMin")
      .max(40, "errors.tooLong")
      .regex(/^[a-zA-Z0-9._-]+$/, "errors.usernameChars"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "errors.passwordMismatch",
    path: ["confirmPassword"],
  });
export type SetupAdminInput = z.infer<typeof setupAdminSchema>;

export const academySchema = z.object({
  nameAr: req(z.string()).max(200, "errors.tooLong"),
  nameFr: optionalText,
  code: optionalText,
});
export type AcademyInput = z.infer<typeof academySchema>;

export const directorateSchema = z.object({
  academyId: req(z.string()),
  nameAr: req(z.string()).max(200, "errors.tooLong"),
  nameFr: optionalText,
  code: optionalText,
});
export type DirectorateInput = z.infer<typeof directorateSchema>;

const phone = z
  .string()
  .trim()
  .regex(/^[+0-9 ()-]{6,20}$/, "errors.phone")
  .optional()
  .or(z.literal(""));
const email = z.string().trim().email("errors.email").optional().or(z.literal(""));

export const schoolSchema = z.object({
  directorateId: req(z.string()),
  nameAr: req(z.string()).max(200, "errors.tooLong"),
  nameFr: optionalText,
  adminCode: z
    .string()
    .trim()
    .max(30, "errors.tooLong")
    .regex(/^[A-Za-z0-9-]*$/, "errors.codeChars")
    .optional()
    .or(z.literal("")),
  cycle: optionalText,
  address: optionalText,
  phone,
  email,
});
export type SchoolInput = z.infer<typeof schoolSchema>;

export const schoolYearLabel = z
  .string()
  .regex(/^\d{4}\/\d{4}$/, "errors.schoolYear")
  .refine((v) => {
    const [a, b] = v.split("/").map(Number);
    return b === (a ?? 0) + 1;
  }, "errors.schoolYear");

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LETTERHEAD_TYPES = ["image/png", "image/jpeg"] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LETTERHEAD_MAX_BYTES = 5 * 1024 * 1024;

export const alignment = z.enum(["right", "center", "left"]);

export const letterheadSchema = z.object({
  mode: z.enum(["GENERATED", "IMAGE"]),
  linesAr: z.array(z.string().trim().max(200, "errors.tooLong")).max(8),
  linesFr: z.array(z.string().trim().max(200, "errors.tooLong")).max(8),
  showFrenchBlock: z.boolean(),
  showLogo: z.boolean(),
  showContact: z.boolean(),
  imageWidthMm: z.number().min(50).max(210),
  imageHeightMm: z.number().min(10).max(80),
  imageAlign: alignment,
  heightMm: z.number().min(15).max(80),
  placement: z.enum(["FIRST_PAGE", "ALL_PAGES"]),
  marginsMm: z.object({
    top: z.number().min(5).max(40),
    right: z.number().min(5).max(40),
    bottom: z.number().min(5).max(40),
    left: z.number().min(5).max(40),
  }),
  footerText: z.string().trim().max(200, "errors.tooLong"),
  showFooter: z.boolean(),
  showPageNumbers: z.boolean(),
});
export type LetterheadInput = z.infer<typeof letterheadSchema>;

export const logoSettingsSchema = z.object({
  logoWidthMm: z.number().min(10).max(60),
  logoAlign: alignment,
});
export type LogoSettingsInput = z.infer<typeof logoSettingsSchema>;

export const changePasswordSchema = z.object({
  currentPassword: req(z.string()),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ---------- المستخدمون والأدوار (المرحلة 3) ----------
const username = req(z.string())
  .min(3, "errors.usernameMin")
  .max(40, "errors.tooLong")
  .regex(/^[a-zA-Z0-9._-]+$/, "errors.usernameChars");

export const userCreateSchema = z.object({
  username,
  fullNameAr: req(z.string()).max(120, "errors.tooLong"),
  fullNameFr: optionalText,
  email,
  phone,
  roles: z.array(z.string().min(1)).min(1, "errors.roleRequired"),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  fullNameAr: req(z.string()).max(120, "errors.tooLong"),
  fullNameFr: optionalText,
  email,
  phone,
  status: z.enum(["ACTIVE", "DISABLED"]),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const userRolesSchema = z.object({ roles: z.array(z.string().min(1)) });
export const userOverridesSchema = z.object({
  overrides: z.array(z.object({ permission: z.string().min(3), granted: z.boolean() })).max(300),
});
export type UserOverridesInput = z.infer<typeof userOverridesSchema>;

// =====================================================================
// المرحلة 4: التصنيفات، القوائم، الممتلكات، المخزون، الموردون
// =====================================================================
const code = req(z.string()).max(30, "errors.tooLong").regex(/^[A-Za-z0-9_-]+$/, "errors.codeChars");
const optId = z.string().uuid("errors.required").optional().or(z.literal("")).nullable();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "errors.date")
  .optional()
  .or(z.literal(""))
  .nullable();
const qty = z
  .number({ error: "errors.number" })
  .positive("errors.positive")
  .max(1_000_000_000, "errors.tooLarge")
  .refine((v) => Math.round(v * 1000) === v * 1000, "errors.decimals3");
const money = z.number({ error: "errors.number" }).min(0, "errors.nonNegative").max(1_000_000_000, "errors.tooLarge").optional().nullable();
const reason = req(z.string()).max(300, "errors.tooLong");

export const categorySchema = z.object({
  code,
  nameAr: req(z.string()).max(150, "errors.tooLong"),
  nameFr: optionalText,
  parentId: optId,
  isActive: z.boolean().optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const lookupValueSchema = z.object({
  code,
  labelAr: req(z.string()).max(150, "errors.tooLong"),
  labelFr: optionalText,
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});
export type LookupValueInput = z.infer<typeof lookupValueSchema>;

export const ASSET_STATUSES = ["AVAILABLE", "DAMAGED", "UNDER_REPAIR", "DISPOSED"] as const;
export const assetSchema = z.object({
  name: req(z.string()).max(200, "errors.tooLong"),
  /** فارغ = يُولَّد تلقائياً حسب صيغة المؤسسة */
  inventoryNumber: z.string().trim().max(40, "errors.tooLong").regex(/^[A-Za-z0-9/_.-]*$/, "errors.codeChars").optional(),
  categoryId: req(z.string()),
  assetTypeId: optId,
  description: z.string().trim().max(1000, "errors.tooLong").optional().or(z.literal("")),
  trackingMode: z.enum(["INDIVIDUAL", "QUANTITY"]),
  quantity: z.number().int("errors.integer").min(1, "errors.positive").max(100000, "errors.tooLarge"),
  serialNumber: optionalText,
  acquisitionDate: isoDate,
  fundingSourceId: optId,
  acquisitionValue: money,
  supplierId: optId,
  status: z.enum(["AVAILABLE", "DAMAGED", "UNDER_REPAIR"]),
  /** المرحلة 5: الموقع (فضاء أو ملعب) والمسؤول */
  roomId: optId,
  facilityId: optId,
  responsibleStaffId: optId,
  photoDataUrl: z.string().max(3_000_000).optional().nullable(),
}).refine((v) => v.trackingMode === "QUANTITY" || v.quantity === 1, { message: "errors.individualQty", path: ["quantity"] });
export type AssetInput = z.infer<typeof assetSchema>;

export const archiveSchema = z.object({ reason });

export const warehouseSchema = z.object({
  code,
  name: req(z.string()).max(150, "errors.tooLong"),
  isActive: z.boolean().optional(),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;

export const stockItemSchema = z.object({
  code,
  name: req(z.string()).max(200, "errors.tooLong"),
  categoryId: optId,
  unitId: req(z.string()),
  minQuantity: z.number({ error: "errors.number" }).min(0, "errors.nonNegative").max(1_000_000_000, "errors.tooLarge"),
  tracksExpiry: z.boolean(),
  defaultSupplierId: optId,
  notes: z.string().trim().max(500, "errors.tooLong").optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});
export type StockItemInput = z.infer<typeof stockItemSchema>;

const mvBase = { itemId: req(z.string()), quantity: qty, occurredAt: isoDate, clientOpId: z.string().max(80).optional() };
export const stockInSchema = z.object({
  ...mvBase,
  warehouseId: req(z.string()),
  unitCost: money,
  supplierId: optId,
  expiryDate: isoDate,
  reason: z.string().trim().max(300, "errors.tooLong").optional().or(z.literal("")),
});
/** الصرف: المستفيد أو الغرض إلزامي */
export const stockOutSchema = z.object({ ...mvBase, warehouseId: req(z.string()), reason });
export const stockReturnSchema = z.object({ ...mvBase, warehouseId: req(z.string()), reason });
export const stockTransferSchema = z
  .object({ ...mvBase, fromWarehouseId: req(z.string()), toWarehouseId: req(z.string()), reason: z.string().trim().max(300).optional().or(z.literal("")) })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, { message: "errors.sameWarehouse", path: ["toWarehouseId"] });
/** التسوية: الكمية الفعلية المعدودة، والفرق يُسجَّل حركةً (لا تعديل مباشر للرصيد) */
export const stockAdjustSchema = z.object({
  itemId: req(z.string()),
  warehouseId: req(z.string()),
  countedQuantity: z.number({ error: "errors.number" }).min(0, "errors.nonNegative").max(1_000_000_000).refine((v) => Math.round(v * 1000) === v * 1000, "errors.decimals3"),
  reason,
  clientOpId: z.string().max(80).optional(),
});
export const stockReverseSchema = z.object({ reason });
export type StockInInput = z.infer<typeof stockInSchema>;
export type StockOutInput = z.infer<typeof stockOutSchema>;
export type StockReturnInput = z.infer<typeof stockReturnSchema>;
export type StockTransferInput = z.infer<typeof stockTransferSchema>;
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;

export const supplierSchema = z.object({
  name: req(z.string()).max(200, "errors.tooLong"),
  activityId: optId,
  phone,
  email,
  address: optionalText,
  ice: z.string().trim().regex(/^\d{15}$/, "errors.ice").optional().or(z.literal("")),
  notes: z.string().trim().max(1000, "errors.tooLong").optional().or(z.literal("")),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const inventoryPatternSchema = z.object({
  inventoryNumberPattern: req(z.string())
    .max(60, "errors.tooLong")
    .regex(/^[A-Za-z0-9{}:\-/_.]+$/, "errors.codeChars")
    .refine((v) => /\{SEQ(?::\d{1,2})?\}/.test(v), "errors.patternSeq"),
});

// =====================================================================
// المرحلة 5: البنايات والفضاءات والملاعب، الموظفون، الوسائل التعليمية، الإعارة
// =====================================================================
export const SPACE_STATUSES = ["GOOD", "NEEDS_MAINTENANCE", "OUT_OF_SERVICE"] as const;
const spaceStatus = z.enum(SPACE_STATUSES);
const optInt = (max: number) => z.number({ error: "errors.number" }).int("errors.integer").min(0, "errors.nonNegative").max(max, "errors.tooLarge").optional().nullable();
const notes = z.string().trim().max(1000, "errors.tooLong").optional().or(z.literal(""));

export const buildingSchema = z.object({
  code,
  name: req(z.string()).max(150, "errors.tooLong"),
  floors: optInt(50),
  builtYear: z.number({ error: "errors.number" }).int("errors.integer").min(1900, "errors.tooSmall").max(2100, "errors.tooLarge").optional().nullable(),
  status: spaceStatus,
  notes,
});
export type BuildingInput = z.infer<typeof buildingSchema>;

export const roomSchema = z.object({
  code,
  name: req(z.string()).max(150, "errors.tooLong"),
  buildingId: optId,
  spaceTypeId: req(z.string()),
  floor: optionalText,
  locationNote: optionalText,
  areaM2: z.number({ error: "errors.number" }).min(0, "errors.nonNegative").max(1_000_000, "errors.tooLarge").optional().nullable(),
  capacity: optInt(10_000),
  status: spaceStatus,
});
export type RoomInput = z.infer<typeof roomSchema>;

export const facilitySchema = z.object({
  code,
  name: req(z.string()).max(150, "errors.tooLong"),
  facilityTypeId: req(z.string()),
  roomId: optId,
  surfaceCondition: optionalText,
  netsGoalsCondition: optionalText,
  status: spaceStatus,
  notes,
});
export type FacilityInput = z.infer<typeof facilitySchema>;

export const STAFF_TYPES = ["TEACHER", "ADMINISTRATIVE", "SUPPORT", "OTHER"] as const;
export const staffSchema = z.object({
  fullNameAr: req(z.string()).max(120, "errors.tooLong"),
  fullNameFr: optionalText,
  type: z.enum(STAFF_TYPES),
  staffNumber: z.string().trim().max(30, "errors.tooLong").regex(/^[A-Za-z0-9_-]*$/, "errors.codeChars").optional().or(z.literal("")),
  phone,
  email,
  isActive: z.boolean().optional(),
});
export type StaffInput = z.infer<typeof staffSchema>;

export const resourceSchema = z
  .object({
    code,
    name: req(z.string()).max(200, "errors.tooLong"),
    resourceTypeId: optId,
    categoryId: optId,
    trackingMode: z.enum(["INDIVIDUAL", "QUANTITY"]),
    /** الأصناف الكمية فقط؛ الفردية تُحسب من وحداتها */
    quantityTotal: z.number({ error: "errors.number" }).int("errors.integer").min(0, "errors.nonNegative").max(100_000, "errors.tooLarge"),
    roomId: optId,
    acquisitionDate: isoDate,
    isLendable: z.boolean(),
    photoDataUrl: z.string().max(3_000_000).optional().nullable(),
  });
export type ResourceInput = z.infer<typeof resourceSchema>;

export const UNIT_STATUSES = ["AVAILABLE", "DAMAGED", "UNDER_MAINTENANCE", "DISPOSED"] as const;
export const resourceUnitSchema = z.object({
  /** فارغ = يُولَّد من رمز الصنف: CODE-001 */
  inventoryNumber: z.string().trim().max(40, "errors.tooLong").regex(/^[A-Za-z0-9/_.-]*$/, "errors.codeChars").optional(),
  serialNumber: optionalText,
  roomId: optId,
  /** ON_LOAN لا يُضبط يدوياً: تديره الإعارة والإرجاع */
  status: z.enum(UNIT_STATUSES),
});
export type ResourceUnitInput = z.infer<typeof resourceUnitSchema>;

/** تعديل كمية المعطوب في صنف كمي (إصلاح أو تلف خارج الإعارة) بسبب إلزامي. */
export const resourceDamageSchema = z.object({
  quantityDamaged: z.number({ error: "errors.number" }).int("errors.integer").min(0, "errors.nonNegative"),
  reason,
});

export const loanSchema = z.object({
  resourceId: req(z.string()),
  unitId: optId,
  quantity: z.number({ error: "errors.number" }).int("errors.integer").min(1, "errors.positive").max(10_000, "errors.tooLarge"),
  borrowerStaffId: req(z.string()),
  dueAt: req(z.string()).regex(/^\d{4}-\d{2}-\d{2}$/, "errors.date"),
  conditionOut: optionalText,
  notes,
  clientOpId: z.string().max(80).optional(),
});
export type LoanInput = z.infer<typeof loanSchema>;

export const loanReturnSchema = z.object({
  quantity: z.number({ error: "errors.number" }).int("errors.integer").min(1, "errors.positive").max(10_000, "errors.tooLarge"),
  conditionIn: optionalText,
  damaged: z.boolean(),
  notes,
  clientOpId: z.string().max(80).optional(),
});
export type LoanReturnInput = z.infer<typeof loanReturnSchema>;

// =====================================================================
// المرحلة 6: الصيانة، العهدة، الجرد، الطلبيات والاقتناء
// =====================================================================
const longText = z.string().trim().max(2000, "errors.tooLong").optional().or(z.literal(""));
const reqDate = req(z.string()).regex(/^\d{4}-\d{2}-\d{2}$/, "errors.date");

/** هدف واحد بالضبط: ممتلك أو فضاء أو ملعب أو وحدة وسيلة. */
export const MAINTENANCE_TARGETS = ["asset", "room", "facility", "resourceUnit"] as const;
export const MAINTENANCE_TYPES = ["PREVENTIVE", "CORRECTIVE", "EMERGENCY"] as const;
export const URGENCIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export const MAINTENANCE_STATUSES = ["NEW", "UNDER_REVIEW", "IN_REPAIR", "REPAIRED", "UNREPAIRABLE", "CLOSED"] as const;
export type MaintenanceStatusCode = (typeof MAINTENANCE_STATUSES)[number];

export const maintenanceRequestSchema = z.object({
  targetType: z.enum(MAINTENANCE_TARGETS),
  targetId: req(z.string()),
  type: z.enum(MAINTENANCE_TYPES),
  damageTypeId: optId,
  description: req(z.string()).max(2000, "errors.tooLong"),
  urgency: z.enum(URGENCIES),
  assigneeId: optId,
  photoDataUrl: z.string().max(3_000_000).optional().nullable(),
  clientOpId: z.string().max(80).optional(),
});
export type MaintenanceRequestInput = z.infer<typeof maintenanceRequestSchema>;

export const maintenanceTransitionSchema = z.object({
  to: z.enum(MAINTENANCE_STATUSES),
  note: z.string().trim().max(500, "errors.tooLong").optional().or(z.literal("")),
});
export type MaintenanceTransitionInput = z.infer<typeof maintenanceTransitionSchema>;

/** تدخل: الجهة المتدخلة، التكلفة، الفاتورة (اختيارية)، المحضر، والنتيجة. */
export const maintenanceRecordSchema = z
  .object({
    contractor: optionalText,
    cost: money,
    interventionReport: longText,
    startedAt: isoDate,
    repairedAt: isoDate,
    outcome: z.enum(["IN_REPAIR", "REPAIRED", "UNREPAIRABLE"]),
    invoice: z
      .object({ supplierId: req(z.string()), invoiceNumber: req(z.string()).max(60, "errors.tooLong"), invoiceDate: reqDate, amount: z.number({ error: "errors.number" }).min(0, "errors.nonNegative").max(1_000_000_000, "errors.tooLarge") })
      .optional()
      .nullable(),
  })
  .refine((v) => v.outcome !== "REPAIRED" || !!v.repairedAt, { message: "errors.required", path: ["repairedAt"] });
export type MaintenanceRecordInput = z.infer<typeof maintenanceRecordSchema>;

export const maintenanceScheduleSchema = z.object({
  title: req(z.string()).max(200, "errors.tooLong"),
  targetType: z.enum(MAINTENANCE_TARGETS),
  targetId: req(z.string()),
  intervalDays: z.number({ error: "errors.number" }).int("errors.integer").min(1, "errors.positive").max(3650, "errors.tooLarge"),
  nextDueAt: reqDate,
  remindDaysBefore: z.number({ error: "errors.number" }).int("errors.integer").min(0, "errors.nonNegative").max(365, "errors.tooLarge"),
  isActive: z.boolean().optional(),
});
export type MaintenanceScheduleInput = z.infer<typeof maintenanceScheduleSchema>;

export const CUSTODY_ACTIONS = ["HANDOVER", "ASSIGNMENT", "RELOCATION", "TRANSFER", "RETURN"] as const;
export const custodySchema = z
  .object({
    action: z.enum(CUSTODY_ACTIONS),
    assetId: req(z.string()),
    toStaffId: optId,
    toRoomId: optId,
    occurredAt: isoDate,
    notes: longText,
    clientOpId: z.string().max(80).optional(),
  })
  .refine((v) => !["HANDOVER", "ASSIGNMENT", "TRANSFER"].includes(v.action) || !!v.toStaffId, { message: "errors.required", path: ["toStaffId"] })
  .refine((v) => v.action !== "RELOCATION" || !!v.toRoomId, { message: "errors.required", path: ["toRoomId"] });
export type CustodyInput = z.infer<typeof custodySchema>;

export const INVENTORY_TYPES = ["ANNUAL", "PERIODIC", "EXCEPTIONAL"] as const;
export const inventorySessionSchema = z
  .object({
    type: z.enum(INVENTORY_TYPES),
    startDate: reqDate,
    endDate: reqDate,
    includesStock: z.boolean(),
    roomIds: z.array(z.string().uuid()).max(500),
    assigneeIds: z.array(z.string().uuid()).max(50),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "errors.endBeforeStart", path: ["endDate"] });
export type InventorySessionInput = z.infer<typeof inventorySessionSchema>;

/** سطر عدّ: بمعرّف السطر أو برمز QR (ممتلك/وحدة). */
export const inventoryCountSchema = z
  .object({
    lineId: optId,
    qrToken: z.string().max(80).optional().or(z.literal("")),
    countedQty: z.number({ error: "errors.number" }).min(0, "errors.nonNegative").max(1_000_000_000, "errors.tooLarge"),
    foundRoomId: optId,
    conditionFound: optionalText,
    notes: optionalText,
    clientOpId: z.string().max(80).optional(),
  })
  .refine((v) => !!v.lineId || !!v.qrToken, { message: "errors.required", path: ["lineId"] });
export type InventoryCountInput = z.infer<typeof inventoryCountSchema>;

export const inventoryValidateSchema = z.object({ reportNotes: req(z.string()).max(5000, "errors.tooLong") });

export const PO_TARGETS = ["ASSET", "STOCK", "RESOURCE"] as const;
export const approvalWorkflowSchema = z.object({
  name: req(z.string()).max(150, "errors.tooLong"),
  fundingSourceId: optId,
  managingBody: optionalText,
  isActive: z.boolean().optional(),
  steps: z.array(z.object({ name: req(z.string()).max(150, "errors.tooLong"), requiredRoleCode: z.string().max(40).optional().or(z.literal("")).nullable() })).max(10),
});
export type ApprovalWorkflowInput = z.infer<typeof approvalWorkflowSchema>;

export const purchaseOrderSchema = z.object({
  title: req(z.string()).max(200, "errors.tooLong"),
  needDescription: longText,
  fundingSourceId: optId,
  budgetLine: optionalText,
  supplierId: optId,
  items: z
    .array(
      z
        .object({
          description: req(z.string()).max(300, "errors.tooLong"),
          quantity: qty,
          unitId: optId,
          estimatedUnitCost: money,
          targetKind: z.enum(PO_TARGETS),
          inventoryItemId: optId,
        })
        .refine((v) => v.targetKind !== "STOCK" || !!v.inventoryItemId, { message: "errors.required", path: ["inventoryItemId"] }),
    )
    .min(1, "errors.atLeastOneItem")
    .max(100, "errors.tooLarge"),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const poSubmitSchema = z.object({ workflowId: optId });
export const poDecisionSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), comment: z.string().trim().max(500, "errors.tooLong").optional().or(z.literal("")) });
export const poOrderSchema = z.object({ supplierId: req(z.string()), orderDocRef: optionalText, orderedAt: isoDate });
export const poCancelSchema = z.object({ reason });

export const deliverySchema = z.object({
  receivedAt: reqDate,
  conformity: z.enum(["CONFORM", "NON_CONFORM", "PARTIAL"]),
  conformityNotes: longText,
  items: z
    .array(
      z
        .object({ purchaseOrderItemId: req(z.string()), quantityReceived: z.number({ error: "errors.number" }).min(0, "errors.nonNegative"), quantityAccepted: z.number({ error: "errors.number" }).min(0, "errors.nonNegative") })
        .refine((v) => v.quantityAccepted <= v.quantityReceived, { message: "errors.acceptedExceedsReceived", path: ["quantityAccepted"] }),
    )
    .min(1, "errors.atLeastOneItem"),
  clientOpId: z.string().max(80).optional(),
});
export type DeliveryInput = z.infer<typeof deliverySchema>;

/** إدخال سطر متسلَّم: إلى المخزون (مخزن) أو إلى الممتلكات (تصنيف، فردي/كمي، فضاء). */
export const postDeliverySchema = z
  .object({
    deliveryItemId: req(z.string()),
    warehouseId: optId,
    categoryId: optId,
    trackingMode: z.enum(["INDIVIDUAL", "QUANTITY"]).optional(),
    roomId: optId,
    unitCost: money,
  });
export type PostDeliveryInput = z.infer<typeof postDeliverySchema>;

export const invoiceSchema = z.object({
  invoiceNumber: req(z.string()).max(60, "errors.tooLong"),
  invoiceDate: reqDate,
  amount: z.number({ error: "errors.number" }).min(0, "errors.nonNegative").max(1_000_000_000, "errors.tooLarge"),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

// =====================================================================
// المرحلة 7: التقارير (المفاتيح، المرشحات، اللغة)
// =====================================================================
export const REPORT_KEYS = [
  "ASSETS",
  "STOCK",
  "STOCK_MOVEMENTS",
  "STOCK_LOW",
  "SPACES",
  "FACILITIES",
  "RESOURCES",
  "LOANS",
  "LOANS_OVERDUE",
  "RETURNS",
  "MAINTENANCE",
  "PURCHASING",
  "SUPPLIERS",
  "CUSTODY",
  "INVENTORY",
  "DISCREPANCIES",
  "ANNUAL",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_FILTERS = ["q", "from", "to", "status", "categoryId", "roomId", "warehouseId", "supplierId", "sessionId", "year", "includeArchived"] as const;
export type ReportFilterKey = (typeof REPORT_FILTERS)[number];

const optUuid = z.string().uuid("errors.required").optional().or(z.literal("").transform(() => undefined));
const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "errors.date")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const reportFiltersSchema = z
  .object({
    q: z.string().trim().max(100, "errors.tooLong").optional(),
    from: optDate,
    to: optDate,
    status: z.string().max(40).regex(/^[A-Z_]*$/, "errors.invalid").optional(),
    categoryId: optUuid,
    roomId: optUuid,
    warehouseId: optUuid,
    supplierId: optUuid,
    sessionId: optUuid,
    year: z.number({ error: "errors.number" }).int().min(2000, "errors.invalid").max(2100, "errors.invalid").optional(),
    includeArchived: z.boolean().optional(),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, { path: ["to"], message: "errors.endBeforeStart" });
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const reportRequestSchema = z.object({
  lang: z.enum(["ar", "fr"]).default("ar"),
  filters: reportFiltersSchema.default({}),
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

// =====================================================================
// المرحلة 7: الوثائق المرفوعة (إصدارات، ربط بالكيانات، أرشفة بلا حذف)
// =====================================================================
export const DOCUMENT_LINK_TYPES = ["ASSET", "SUPPLIER", "PURCHASE_ORDER", "MAINTENANCE_REQUEST", "ROOM", "FACILITY"] as const;
export const DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;
const fileBody = {
  fileName: req(z.string()).max(200, "errors.tooLong"),
  // 8MB بعد base64 ≈ 10.7MB
  dataBase64: req(z.string()).max(11_000_000, "errors.fileTooLarge").regex(/^[A-Za-z0-9+/=\s]+$/, "errors.fileType"),
};
export const documentMetaSchema = z
  .object({
    title: req(z.string()).max(200, "errors.tooLong"),
    categoryId: optId,
    documentDate: isoDate,
    issuingBody: optionalText,
    expiresAt: isoDate,
    notes: z.string().trim().max(2000, "errors.tooLong").optional().or(z.literal("")),
    accessLevel: z.enum(["SCHOOL", "RESTRICTED"]).default("SCHOOL"),
    links: z.array(z.object({ entityType: z.enum(DOCUMENT_LINK_TYPES), entityId: z.string().uuid("errors.invalidChoice") })).max(20).default([]),
  })
  .refine((v) => !v.documentDate || !v.expiresAt || v.documentDate <= v.expiresAt, { path: ["expiresAt"], message: "errors.endBeforeStart" });
export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;
export const documentCreateSchema = z.intersection(documentMetaSchema, z.object(fileBody));
export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;
export const documentVersionSchema = z.object({ ...fileBody, changeNote: req(z.string()).max(300, "errors.tooLong") });
export type DocumentVersionInput = z.infer<typeof documentVersionSchema>;
