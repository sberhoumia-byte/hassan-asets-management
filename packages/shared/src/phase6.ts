/** انتقالات حالات طلب الصيانة المسموحة (المصدر الوحيد للخادم والواجهة). */
export const MAINTENANCE_TRANSITIONS: Record<string, readonly string[]> = {
  NEW: ["UNDER_REVIEW", "IN_REPAIR", "CLOSED"],
  UNDER_REVIEW: ["IN_REPAIR", "UNREPAIRABLE", "CLOSED"],
  IN_REPAIR: ["REPAIRED", "UNREPAIRABLE"],
  REPAIRED: ["CLOSED"],
  UNREPAIRABLE: ["CLOSED"],
  CLOSED: [],
};
/** الإغلاق دون إصلاح (من «جديد» أو «قيد الدراسة») يتطلب ملاحظة تبرره. */
export const MAINTENANCE_CLOSE_NEEDS_NOTE = ["NEW", "UNDER_REVIEW"];

/** مسار دورة الجرد: مسودة ← مفتوحة ← انتهى العد ← مصادق عليها ← مغلقة ← مؤرشفة. */
export const INVENTORY_FLOW = ["DRAFT", "OPEN", "COUNTING_DONE", "VALIDATED", "CLOSED", "ARCHIVED"] as const;

/** مسار الطلبية (الحالات الطرفية: REJECTED، CANCELLED، CLOSED). */
export const PO_EDITABLE = ["NEED_RECORDED", "ESTIMATED"];
export const PO_CANCELLABLE = ["NEED_RECORDED", "ESTIMATED", "PENDING_APPROVAL", "APPROVED"];
export const PO_RECEIVABLE = ["ORDERED", "PARTIALLY_DELIVERED"];
