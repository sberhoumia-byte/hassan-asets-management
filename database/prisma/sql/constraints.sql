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

-- (هجرة 20261125195004_stock_direction) اتجاه الحركة: +1 يزيد الرصيد، -1 ينقصه
ALTER TABLE stock_movements ADD CONSTRAINT stock_movement_direction CHECK (direction IN (-1, 1));

-- 10) أرشيف التقارير والمحاضر المولدة: إلحاق فقط (المرحلة 7).
CREATE TRIGGER generated_reports_append_only
  BEFORE UPDATE OR DELETE ON generated_reports
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
