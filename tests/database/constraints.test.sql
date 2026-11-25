-- اختبار قيود قاعدة البيانات (يُشغَّل على قاعدة اختبار فارغة بعد init + constraints.sql)
-- كل كتلة تتوقع فشلاً؛ إن نجحت العملية الممنوعة يرفع الاختبار استثناء FAIL.
BEGIN;
INSERT INTO academies (id,"nameAr","updatedAt") VALUES ('00000000-0000-0000-0000-000000000001','أكاديمية اختبار',now());
INSERT INTO provincial_directorates (id,"academyId","nameAr","updatedAt") VALUES ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','مديرية اختبار',now());
INSERT INTO schools (id,"directorateId","nameAr","updatedAt") VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','مؤسسة اختبار',now());
INSERT INTO lookup_values (id,"listKey",code,"labelAr") VALUES ('00000000-0000-0000-0000-000000000004','UNIT_OF_MEASURE','PCS','قطعة');
INSERT INTO warehouses (id,"schoolId",code,name) VALUES ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000003','W1','مخزن اختبار');
INSERT INTO inventory_items (id,"schoolId",code,name,"unitId","updatedAt") VALUES ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000003','I1','مادة اختبار','00000000-0000-0000-0000-000000000004',now());
INSERT INTO stock_balances ("itemId","warehouseId",quantity,"updatedAt") VALUES ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000005',5,now());
INSERT INTO stock_movements (id,"schoolId",number,type,"itemId","warehouseId",quantity,direction,"createdById") VALUES ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000003','M1','IN','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000005',5,1,'00000000-0000-0000-0000-0000000000aa');
INSERT INTO staff_members (id,"schoolId","fullNameAr","updatedAt") VALUES ('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000003','أستاذ اختبار',now());
INSERT INTO educational_resources (id,"schoolId",code,name,"trackingMode","updatedAt") VALUES ('00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000003','R1','جهاز عرض','INDIVIDUAL',now());
INSERT INTO educational_resource_units (id,"resourceId","inventoryNumber","updatedAt") VALUES ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000009','U1',now());
INSERT INTO resource_loans (id,"schoolId",number,"resourceId","unitId","borrowerStaffId","dueAt","handedOverById","updatedAt") VALUES ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000003','L1','00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000008',now()+interval '7 day','00000000-0000-0000-0000-0000000000aa',now());
INSERT INTO audit_logs ("schoolId",action,"entityType") VALUES ('00000000-0000-0000-0000-000000000003','CREATE','TEST');

CREATE FUNCTION expect_fail(sql text, label text) RETURNS void AS $$
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PASS: %', label; RETURN; END;
  RAISE EXCEPTION 'FAIL: % (operation was allowed)', label;
END; $$ LANGUAGE plpgsql;

SELECT expect_fail($$UPDATE stock_balances SET quantity = -1$$, 'رصيد سالب ممنوع');
SELECT expect_fail($$UPDATE stock_movements SET quantity = 99$$, 'تعديل حركة مخزون ممنوع');
SELECT expect_fail($$DELETE FROM stock_movements$$, 'حذف حركة مخزون ممنوع');
SELECT expect_fail($$INSERT INTO stock_movements (id,"schoolId",number,type,"itemId","warehouseId",quantity,direction,"createdById") VALUES (gen_random_uuid(),'00000000-0000-0000-0000-000000000003','M2','IN','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000005',1,0,'00000000-0000-0000-0000-0000000000aa')$$, 'اتجاه حركة غير +1/-1 مرفوض');
SELECT expect_fail($$DELETE FROM audit_logs$$, 'حذف سجل التدقيق ممنوع');
SELECT expect_fail($$UPDATE audit_logs SET action='X'$$, 'تعديل سجل التدقيق ممنوع');
SELECT expect_fail($$INSERT INTO resource_loans (id,"schoolId",number,"resourceId","unitId","borrowerStaffId","dueAt","handedOverById","updatedAt") VALUES (gen_random_uuid(),'00000000-0000-0000-0000-000000000003','L2','00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000008',now()+interval '1 day','00000000-0000-0000-0000-0000000000aa',now())$$, 'إعارة وحدة معارة ممنوعة');
SELECT expect_fail($$INSERT INTO educational_resource_units (id,"resourceId","inventoryNumber","updatedAt") VALUES (gen_random_uuid(),'00000000-0000-0000-0000-000000000009','U1',now())$$, 'تكرار رقم الجرد ممنوع');
SELECT expect_fail($$INSERT INTO assets (id,"schoolId","inventoryNumber",name,"categoryId","updatedAt") VALUES (gen_random_uuid(),'00000000-0000-0000-0000-000000000003','A1','x',gen_random_uuid(),now())$$, 'ممتلك بتصنيف غير موجود ممنوع (FK)');
SELECT expect_fail($$INSERT INTO provincial_directorates (id,"academyId","nameAr","updatedAt") VALUES (gen_random_uuid(),gen_random_uuid(),'x',now())$$, 'مديرية بلا أكاديمية ممنوعة');
SELECT expect_fail($$INSERT INTO maintenance_requests (id,"schoolId",number,type,description,"reportedById","updatedAt") VALUES (gen_random_uuid(),'00000000-0000-0000-0000-000000000003','MR1','CORRECTIVE','x',gen_random_uuid(),now())$$, 'طلب صيانة بلا هدف ممنوع');
SELECT expect_fail($$INSERT INTO lookup_values (id,"listKey",code,"labelAr") VALUES (gen_random_uuid(),'UNIT_OF_MEASURE','PCS','مكرر')$$, 'تكرار قيمة قائمة عامة ممنوع');

-- بعد الإرجاع يُسمح بإعارة الوحدة من جديد
UPDATE resource_loans SET status='RETURNED' WHERE number='L1';
INSERT INTO resource_loans (id,"schoolId",number,"resourceId","unitId","borrowerStaffId","dueAt","handedOverById","updatedAt") VALUES (gen_random_uuid(),'00000000-0000-0000-0000-000000000003','L3','00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000008',now()+interval '1 day','00000000-0000-0000-0000-0000000000aa',now());
DO $$ BEGIN RAISE NOTICE 'PASS: إعارة الوحدة بعد إرجاعها مسموحة'; END $$;
ROLLBACK;
