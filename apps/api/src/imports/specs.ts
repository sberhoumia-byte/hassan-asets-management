import { ASSET_STATUSES, assetSchema, STAFF_TYPES, staffSchema, stockItemSchema, supplierSchema } from "@hassan/validation";
import type { z } from "zod";

/**
 * أعمدة الاستيراد لكل كيان. مفتاح الحقل = اسم الحقل في مخطط التحقق المشترك،
 * فتُعاد أخطاء zod إلى العمود الصحيح مباشرة.
 * المراجع (التصنيف، الوحدة، المورد، الفضاء، الموظف) تُكتب برمزها أو اسمها وتُحوَّل إلى معرفاتها.
 * لا يستورد المخزون أرصدة: الكميات تدخل فقط بحركات إدخال (لا تلاعب مباشر بالأرصدة).
 */
export const IMPORT_ENTITIES = ["ASSETS", "STAFF", "SUPPLIERS", "STOCK"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export type FieldKind = "text" | "int" | "number" | "date" | "bool" | "enum" | "category" | "lookup" | "supplier" | "room" | "facility" | "staff";

export interface FieldSpec {
  key: string;
  kind: FieldKind;
  required?: boolean;
  /** قيم التعداد ومفتاح ترجمة تسمياتها (prefix + "." + القيمة). */
  values?: readonly string[];
  labelPrefix?: string;
  /** للقوائم المرجعية: مفتاح القائمة. */
  list?: string;
  /** قيمة افتراضية عند خلو الخلية. */
  default?: unknown;
  /** يجب أن تكون القيمة فريدة داخل الملف وداخل المؤسسة. */
  unique?: boolean;
}

export interface EntitySpec {
  entity: ImportEntity;
  /** صلاحيات الوحدة المستهدفة: يكفي امتلاك إحداها. */
  perms: string[];
  schema: z.ZodType;
  fields: FieldSpec[];
}

const STAFF_MANAGERS = ["loans.create", "custody.create", "assets.update", "users.manage", "settings.manage"];

export const SPECS: Record<ImportEntity, EntitySpec> = {
  ASSETS: {
    entity: "ASSETS",
    perms: ["assets.create"],
    schema: assetSchema,
    fields: [
      { key: "name", kind: "text", required: true },
      { key: "inventoryNumber", kind: "text", unique: true },
      { key: "categoryId", kind: "category", required: true },
      { key: "assetTypeId", kind: "lookup", list: "ASSET_TYPE" },
      { key: "trackingMode", kind: "enum", values: ["INDIVIDUAL", "QUANTITY"], labelPrefix: "assets.mode", default: "INDIVIDUAL" },
      { key: "quantity", kind: "int", default: 1 },
      { key: "status", kind: "enum", values: ASSET_STATUSES.filter((s) => s !== "DISPOSED"), labelPrefix: "assetStatus", default: "AVAILABLE" },
      { key: "serialNumber", kind: "text" },
      { key: "acquisitionDate", kind: "date" },
      { key: "acquisitionValue", kind: "number" },
      { key: "fundingSourceId", kind: "lookup", list: "FUNDING_SOURCE" },
      { key: "supplierId", kind: "supplier" },
      { key: "roomId", kind: "room" },
      { key: "facilityId", kind: "facility" },
      { key: "responsibleStaffId", kind: "staff" },
      { key: "description", kind: "text" },
    ],
  },
  STAFF: {
    entity: "STAFF",
    perms: STAFF_MANAGERS,
    schema: staffSchema,
    fields: [
      { key: "fullNameAr", kind: "text", required: true },
      { key: "fullNameFr", kind: "text" },
      { key: "type", kind: "enum", values: STAFF_TYPES, labelPrefix: "staffType", required: true },
      { key: "staffNumber", kind: "text", unique: true },
      { key: "phone", kind: "text" },
      { key: "email", kind: "text" },
    ],
  },
  SUPPLIERS: {
    entity: "SUPPLIERS",
    perms: ["suppliers.create"],
    schema: supplierSchema,
    fields: [
      { key: "name", kind: "text", required: true },
      { key: "activityId", kind: "lookup", list: "SUPPLIER_ACTIVITY" },
      { key: "ice", kind: "text", unique: true },
      { key: "phone", kind: "text" },
      { key: "email", kind: "text" },
      { key: "address", kind: "text" },
      { key: "notes", kind: "text" },
    ],
  },
  STOCK: {
    entity: "STOCK",
    perms: ["stock.create"],
    schema: stockItemSchema,
    fields: [
      { key: "code", kind: "text", required: true, unique: true },
      { key: "name", kind: "text", required: true },
      { key: "categoryId", kind: "category" },
      { key: "unitId", kind: "lookup", list: "UNIT_OF_MEASURE", required: true },
      { key: "minQuantity", kind: "number", default: 0 },
      { key: "tracksExpiry", kind: "bool", default: false },
      { key: "defaultSupplierId", kind: "supplier" },
      { key: "notes", kind: "text" },
    ],
  },
};

/** مفتاح ترجمة عنوان العمود. */
export const colLabel = (entity: ImportEntity, key: string) => `imp.col.${entity}.${key}`;
