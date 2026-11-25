import { notifications } from "@mantine/notifications";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { ApiError } from "../api/types";
import { errorKey } from "./errors";

type T = (k: string, v?: Record<string, string | number>) => string;

/** رسالة خطأ الحقل مترجمة (رسائل zod والخادم مفاتيح errors.*). */
export function fieldError<F extends FieldValues>(f: UseFormReturn<F>, t: T) {
  return (name: Path<F>): string | undefined => {
    const parts = String(name).split(".");
    let e: unknown = f.formState.errors;
    for (const p of parts) e = (e as Record<string, unknown> | undefined)?.[p];
    const msg = (e as { message?: string } | undefined)?.message;
    return msg ? t(msg) : undefined;
  };
}

/** رموز قواعد العمل من الخادم ← مفاتيح الترجمة. */
const RULES: Record<string, string> = {
  DUPLICATE_CODE: "errors.duplicateItemCode",
  DUPLICATE_ICE: "errors.duplicateIce",
  DUPLICATE_INVENTORY_NUMBER: "errors.duplicateInventoryNumber",
  STOCK_INSUFFICIENT: "errors.stockInsufficient",
  ITEM_INACTIVE: "errors.itemInactive",
  WAREHOUSE_INACTIVE: "errors.warehouseInactive",
  NO_DIFFERENCE: "errors.noDifference",
  ALREADY_REVERSED: "errors.alreadyReversed",
  CANNOT_REVERSE_REVERSAL: "errors.cannotReverseReversal",
  UNIT_LOCKED: "errors.unitLocked",
  ASSET_ARCHIVED: "errors.assetArchived",
  CATEGORY_NOT_FOUND: "errors.categoryNotFound",
  CATEGORY_CYCLE: "errors.categoryCycle",
  NUMBER_GENERATION_FAILED: "errors.numberGeneration",
  NOT_FOUND: "errors.notFound",
  // المرحلة 5
  DUPLICATE_STAFF_NUMBER: "errors.duplicateStaffNumber",
  BUILDING_HAS_ROOMS: "errors.buildingHasRooms",
  ROOM_NOT_EMPTY: "errors.roomNotEmpty",
  FACILITY_HAS_EQUIPMENT: "errors.facilityHasEquipment",
  ARCHIVED: "errors.archivedEntity",
  TRACKING_LOCKED: "errors.trackingLocked",
  QUANTITY_BELOW_USED: "errors.quantityBelowUsed",
  RESOURCE_ON_LOAN: "errors.resourceOnLoan",
  RESOURCE_ALREADY_ON_LOAN: "errors.resourceAlreadyOnLoan",
  RESOURCE_NOT_AVAILABLE: "errors.resourceNotAvailable",
  RESOURCE_NOT_LENDABLE: "errors.resourceNotLendable",
  QUANTITY_NOT_AVAILABLE: "errors.quantityNotAvailable",
  RETURN_EXCEEDS: "errors.returnExceeds",
  LOAN_CLOSED: "errors.loanClosed",
  NOT_INDIVIDUAL_RESOURCE: "errors.notIndividualResource",
  NOT_QUANTITY_RESOURCE: "errors.notQuantityResource",
  // المرحلة 6
  INVALID_TRANSITION: "errors.invalidTransition",
  MAINTENANCE_CLOSED: "errors.maintenanceClosed",
  RECORD_NOT_ALLOWED: "errors.recordNotAllowed",
  UNIT_ON_LOAN: "errors.unitOnLoan",
  SCHEDULE_INACTIVE: "errors.scheduleInactive",
  SAME_CUSTODIAN: "errors.sameCustodian",
  NO_CURRENT_CUSTODIAN: "errors.noCurrentCustodian",
  SAME_ROOM: "errors.sameRoom",
  SESSION_NOT_DRAFT: "errors.sessionNotDraft",
  SESSION_NOT_OPEN: "errors.sessionNotOpen",
  QR_UNKNOWN: "errors.qrUnknown",
  WORKFLOW_IN_USE: "errors.workflowInUse",
  NO_WORKFLOW: "errors.noWorkflow",
  WORKFLOW_AMBIGUOUS: "errors.workflowAmbiguous",
  STEP_OUT_OF_ORDER: "errors.stepOutOfOrder",
  PO_LOCKED: "errors.poLocked",
  DELIVERY_EXCEEDS: "errors.deliveryExceeds",
  ALREADY_POSTED: "errors.alreadyPosted",
  NOTHING_ACCEPTED: "errors.nothingAccepted",
  INDIVIDUAL_NEEDS_INTEGER: "errors.individualNeedsInteger",
  NO_SUPPLIER: "errors.noSupplier",
  DUPLICATE_INVOICE: "errors.duplicateInvoice",
  UNPOSTED_ITEMS: "errors.unpostedItems",
};

/** مفتاح ومتغيرات رسالة خطأ عام (غير مرتبط بحقل). */
export function ruleMessage(t: T, e: unknown): string {
  if (e instanceof ApiError && RULES[e.code]) {
    const d = (e.details ?? {}) as Record<string, string | number>;
    return t(RULES[e.code]!, d);
  }
  return t(errorKey(e));
}

export function notifyError(t: T, e: unknown) {
  notifications.show({ color: "red", message: ruleMessage(t, e) });
}

/**
 * يوزع أخطاء التحقق القادمة من الخادم على حقول النموذج.
 * يعيد true إن عالجها كلها على الحقول؛ وإلا يُظهر إشعاراً ويعيد false.
 * fieldCodes: رموز تعارض تخص حقلاً محدداً (مثلاً DUPLICATE_CODE ← code).
 */
export function handleFormError<F extends FieldValues>(f: UseFormReturn<F>, t: T, e: unknown, fieldCodes: Record<string, Path<F>> = {}): boolean {
  if (e instanceof ApiError) {
    const target = fieldCodes[e.code];
    if (target) {
      // التفاصيل (مثلاً الكمية المتاحة) تُدمج في الرسالة هنا لأن رسائل الحقول تُترجم دون متغيرات
      const d = e.details as Record<string, string | number> | undefined;
      const key = RULES[e.code] ?? "errors.invalid";
      f.setError(target, { message: d && Object.keys(d).length ? t(key, d) : key });
      return true;
    }
    const fields = (e.details as { fields?: Record<string, string> } | undefined)?.fields;
    if (e.code === "VALIDATION_ERROR" && fields) {
      const known = Object.keys(f.getValues());
      let all = true;
      for (const [k, msg] of Object.entries(fields)) {
        if (known.includes(k.split(".")[0]!)) f.setError(k as Path<F>, { message: msg });
        else all = false;
      }
      if (all) return true;
    }
  }
  notifyError(t, e);
  return false;
}

/** معرّف عملية فريد لكل نموذج حركة: إعادة الإرسال (نقر مزدوج، انقطاع) لا تنشئ حركة ثانية. */
export function newOpId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const today = () => new Date().toISOString().slice(0, 10);

/** عرض كمية بثلاث خانات عشرية كحد أقصى وبأرقام لاتينية. */
export const fmtQty = (n: number) => new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 3 }).format(n);
export const fmtMoney = (n: number) => new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** يوم تاريخ الإرجاع (dueAt مخزن كنهاية اليوم UTC): نعرض اليوم نفسه دون انزياح المنطقة الزمنية. */
export const dayOf = (iso: string) => `${iso.slice(0, 10)}T12:00:00`;
