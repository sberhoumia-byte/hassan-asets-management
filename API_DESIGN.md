# تصميم واجهات البرمجة — API_DESIGN

> الحالة: **عقود مصممة في المرحلة الأولى**. لم يُنفَّذ أي endpoint بعد. التنفيذ يبدأ في المرحلة الثالثة (NestJS + Swagger)، وستُولَّد مواصفة OpenAPI من الشيفرة وتُحفظ في `docs/API/openapi.json`.

## 1. الاتفاقيات العامة

| البند | القرار |
|---|---|
| الأسلوب | REST + JSON، البادئة `/api/v1` |
| التوثيق | Swagger UI على `/api/docs` (معطّل في الإنتاج أو محمي) |
| المصادقة | `Authorization: Bearer <access JWT>` (15 دقيقة) + refresh token في cookie `HttpOnly; Secure; SameSite=Strict` (7 أيام، دوّار) |
| المؤسسة النشطة | ترويسة `X-School-Id`. الخادم يتحقق أن للمستخدم دوراً في هذه المؤسسة، وإلا `403` |
| اللغة | `Accept-Language: ar | fr` لرسائل الأخطاء |
| التحقق | مخططات Zod مشتركة في `packages/validation` تُستعمل في الواجهة والخادم |
| الترقيم | `?page=1&pageSize=25` (حد أقصى 200) → `{ data, meta: { page, pageSize, total } }` |
| البحث والفرز | `?q=...&sort=field:asc&filter[status]=AVAILABLE&filter[categoryId]=...` |
| عدم التكرار | العمليات الحساسة تقبل ترويسة `Idempotency-Key` (= `clientOpId`) |
| التزامن المتفائل | `PATCH` يتطلب `If-Match: <updatedAt>`؛ التعارض → `409` |
| الحذف | لا `DELETE` فعلي للسجلات الحساسة؛ `POST /{id}/archive` أو `/cancel` |

### صيغة الأخطاء

```json
{
  "error": {
    "code": "STOCK_INSUFFICIENT",
    "message": "الكمية المطلوبة (12) أكبر من الرصيد المتوفر (5)",
    "details": { "available": 5, "requested": 12 },
    "requestId": "c0a8..."
  }
}
```

| HTTP | الاستعمال |
|---|---|
| 400 | `VALIDATION_ERROR` مع قائمة الحقول |
| 401 | غير مصادق |
| 403 | `FORBIDDEN` / `SCHOOL_ACCESS_DENIED` |
| 404 | غير موجود (أو خارج المؤسسة — لا نكشف الوجود) |
| 409 | `DUPLICATE_INVENTORY_NUMBER`، `RESOURCE_ALREADY_ON_LOAN`، `VERSION_CONFLICT` |
| 422 | قاعدة عمل: `STOCK_INSUFFICIENT`، `RESOURCE_NOT_AVAILABLE`، `SESSION_NOT_OPEN` |
| 429 | تجاوز حد المحاولات (تسجيل الدخول) |

## 2. الصلاحيات

صيغة الصلاحية: `<module>.<action>`. الأفعال: `view, create, update, approve, cancel, archive, export, print` + أفعال خاصة.

الوحدات: `dashboard, schools, branding, users, assets, stock, spaces, facilities, resources, loans, inventory, maintenance, purchasing, custody, suppliers, floorplan, imports, documents, reports, audit, backup, settings, lookups`.

أفعال خاصة: `stock.adjust` (تسوية)، `stock.reverse` (عكس حركة)، `inventory.validate`، `backup.restore`، `audit.view`، `users.manage`، `settings.manage`، `lookups.manage`، `reports.choose_letterhead`.

| الدور | الصلاحيات الافتراضية (قابلة للتخصيص لكل مستخدم) |
|---|---|
| ADMIN | الكل، بما فيها `backup.restore` و`users.manage` |
| DIRECTOR | الكل في مؤسسته عدا `backup.restore`؛ اعتماد الطلبيات والجرد |
| ASSET_MANAGER | `assets.*`, `custody.*`, `spaces.view/update`, `reports.*` للممتلكات |
| STOCK_MANAGER | `stock.*` عدا `stock.adjust`، `suppliers.*` |
| MAINTENANCE_MANAGER | `maintenance.*`, `spaces.view`, `facilities.*` |
| EDUCATIONAL_RESOURCES_MANAGER | `resources.*`, `loans.*` |
| INVENTORY_MANAGER | `inventory.*` عدا `inventory.validate` |
| DOCUMENT_MANAGER | `documents.*` |
| VIEWER | `*.view` فقط |

## 3. العقود حسب الوحدة

الرمز 🔒 = يتطلب صلاحية خاصة. كل المسارات تحت `/api/v1`.

> ✅ = منفذ ومختبر على الخادم الحقيقي (المرحلتان 3 و4). الباقي تصميم للمراحل اللاحقة.
> المؤسسة النشطة تُحدد من المسار `/schools/:schoolId/...` أو من الترويسة `X-School-Id` للمسارات العامة مثل `/users`.
> التوثيق التفاعلي (Swagger) متاح في التطوير على `/api/docs`.

### 3.1 المصادقة والحساب ✅
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/auth/setup-status` | `{needsSetup, setupTokenRequired}` |
| POST | `/auth/setup` | الإعداد الأول: حساب مدير النظام مرة واحدة فقط (`setupToken` إن ضُبط `SETUP_TOKEN`) |
| POST | `/auth/login` | `{username, password}` → `{accessToken, user}` + cookie `hat_refresh` (httpOnly) |
| POST | `/auth/refresh` | تدوير رمز التجديد؛ إعادة استعمال رمز قديم تلغي كل جلسات المستخدم |
| POST | `/auth/logout` | إلغاء الجلسة |
| GET | `/auth/me` | المستخدم، أدواره، `permissions` الفعلية لكل مؤسسة، `mustChangePassword` |
| POST | `/auth/change-password` | `{currentPassword, newPassword}`؛ يلغي جلسات الأجهزة الأخرى |
| GET/DELETE | `/auth/sessions[/:id]` | الجلسات النشطة |

حساب بكلمة مرور مؤقتة لا يصل إلا إلى `me` و`change-password` و`logout` (غير ذلك: 403 `PASSWORD_CHANGE_REQUIRED`).

### 3.2 التسلسل الإداري والمؤسسات ✅
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/academies` | قائمة الأكاديميات (لكل مستخدم مسجل) |
| POST | `/academies` | 🔒 مدير النظام |
| GET | `/directorates?academyId=` | المديريات التابعة فقط |
| POST | `/directorates` | 🔒 مدير النظام |
| GET | `/schools?directorateId=&q=` | المؤسسات **المرئية للمستخدم فقط**؛ بحث عربي يتجاهل التشكيل والهمزات |
| POST | `/schools` | 🔒 مدير النظام (تُنشأ معها `school_settings`) |
| GET | `/schools/:schoolId` | 🔒 `schools.view` |
| PUT | `/schools/:schoolId` | 🔒 `schools.update`، مع `schoolYear` (سنة حالية واحدة لكل مؤسسة) |

### 3.3 الهوية البصرية والترويسة ✅
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/schools/:schoolId/branding` | الإعدادات + الترويسة الحالية (الافتراضية من التسلسل إن لم تُحفظ) |
| PUT | `/schools/:schoolId/branding` | 🔒 `branding.update`؛ الصور data URL يُتحقق من نوعها الحقيقي وحجمها وتُخزن كملفات؛ كل حفظ = إصدار ترويسة جديد والقديم يُؤرشف |
| POST | `/schools/:schoolId/branding/reset` | 🔒 `branding.update`؛ استعادة الافتراضي كإصدار جديد (الشعار لا يُمس) |
| GET | `/schools/:schoolId/branding/history` | من سجل التدقيق |

تعدد الترويسات واختيارها لكل تقرير (`reports.choose_letterhead`) وتوليد PDF على الخادم: المرحلة 7.

### 3.4 المستخدمون والصلاحيات ✅
كلها 🔒 `users.manage` داخل المؤسسة النشطة (`X-School-Id`):
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/roles`, `/permissions` | الأدوار بصلاحياتها الافتراضية، وقائمة الصلاحيات |
| GET | `/users` | من لهم دور في المؤسسة (مدير النظام يرى أيضاً الحسابات بلا دور) |
| POST | `/users` | ينشئ الحساب بكلمة مرور مؤقتة عشوائية تُعاد **مرة واحدة** |
| PUT | `/users/:id` | البيانات والحالة (`ACTIVE`/`DISABLED`؛ التعطيل يلغي الجلسات؛ لا حذف) |
| PUT | `/users/:id/roles` | أدوار المستخدم في هذه المؤسسة |
| PUT | `/users/:id/overrides` | منح/سحب فردي `[{permission, granted}]` |
| POST | `/users/:id/reset-password` | كلمة مرور مؤقتة جديدة + إلغاء الجلسات + فك القفل |

قواعد منع التصعيد: دور `ADMIN` لا يمنحه أو يسحبه إلا مدير نظام؛ لا يُمنح فردياً ما لا يملكه المانح؛ غير مدير النظام لا يعدّل حساب مدير نظام؛ يبقى مدير نظام نشط واحد على الأقل (`LAST_ADMIN`).

### 3.5 القوائم والتصنيفات وصيغة الترقيم ✅
كل المسارات تحت `/schools/:schoolId`. القراءة لأي عضو في المؤسسة؛ الكتابة 🔒 `lookups.manage` (وصيغة الترقيم 🔒 `settings.manage`).
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/lookups?listKey=&all=1` | القيم العامة + قيم المؤسسة (`all=1` يشمل المعطلة) |
| POST | `/lookups/:listKey` | قيمة خاصة بالمؤسسة؛ رمز مكرر → `409 DUPLICATE_CODE` |
| PUT | `/lookups/value/:id` | القيم العامة لا تُعدَّل من مؤسسة (404) |
| GET/POST/PUT | `/categories[/:id]` | شجرة؛ أب غير موجود `422 CATEGORY_NOT_FOUND`، حلقة `422 CATEGORY_CYCLE` |
| GET/PUT | `/settings/numbering` | `{inventoryNumberPattern}` يجب أن يتضمن `{SEQ}` أو `{SEQ:n}` |

### 3.19-أ لوحة القيادة ✅
`GET /schools/:schoolId/dashboard/{stats,alerts,activity}` 🔒 `dashboard.view` — أرقام محسوبة من القاعدة، وآخر العمليات من سجل التدقيق. الإشعارات: 3.19. `GET /health` فحص الخادم والقاعدة.

### 3.6 الممتلكات ✅
المسارات تحت `/schools/:schoolId`.
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/assets?q=&categoryId=&status=&archived=1&page=&pageSize=` | 🔒 `assets.view` → `{items,total,page,pageSize}` |
| POST | `/assets` | 🔒 `assets.create`؛ رقم الجرد فارغ = يُولَّد حسب الصيغة؛ التكرار → `409 DUPLICATE_INVENTORY_NUMBER` (حتى مع طلبين متزامنين) |
| GET/PUT | `/assets/:id` | 🔒 `assets.view`/`assets.update`؛ `photoDataUrl`: غائب = بلا تغيير، `null` = حذف؛ مستبعد → `422 ASSET_ARCHIVED` |
| POST | `/assets/:id/archive` | 🔒 `assets.archive` `{reason}` — الحالة DISPOSED، لا حذف |
| GET | `/assets/:id/history` | التدقيق مع الحقول المتغيرة (القديم والجديد) |
| GET | `/scan/:qrToken` (بلا مؤسسة) | يعيد `{kind, id, schoolId}` لمن يصل إلى المؤسسة فقط، وإلا 404 |

رمز QR يُولَّد في الواجهة ويحمل رابط `#/scan/<qrToken>` فقط (رمز عشوائي لا يكشف بيانات). المواقع والعهدة والصيانة في السجل: المراحل 5 و6.

### 3.7 المخزون ✅
المسارات تحت `/schools/:schoolId`. القراءة 🔒 `stock.view`، الحركات 🔒 `stock.create`. كل حركة تقبل `clientOpId` (إعادة الإرسال تعيد `{replayed:true}` دون حركة ثانية) وتعيد أرقام الحركات `MV-{YEAR}-{SEQ:5}`.
| الطريقة | المسار | الوصف |
|---|---|---|
| GET/POST/PUT | `/warehouses[/:id]` | مخزن معطل → `422 WAREHOUSE_INACTIVE` عند الحركة |
| GET | `/stock/items?q=&alert=low\|out&all=1` | المواد مع `total` و`balances` لكل مخزن و`level` |
| POST/PUT | `/stock/items[/:id]` | تغيير الوحدة بعد وجود حركات → `422 UNIT_LOCKED` |
| GET | `/stock/movements?itemId=&warehouseId=&type=&from=&to=&page=` | |
| POST | `/stock/movements/in` | `{itemId, warehouseId, quantity, unitCost?, supplierId?, expiryDate?, reason?, occurredAt?}` |
| POST | `/stock/movements/out` | `reason` (المستفيد/الغرض) إلزامي؛ رصيد غير كاف → `422 STOCK_INSUFFICIENT {available, requested}` |
| POST | `/stock/movements/return` | سبب إلزامي |
| POST | `/stock/movements/transfer` | حركتان مرتبطتان (`transferGroupId`) في معاملة واحدة؛ نفس المخزن مرفوض |
| POST | `/stock/movements/adjust` | 🔒 `stock.adjust` `{countedQuantity, reason}` — الفرق حركة؛ لا فرق → `422 NO_DIFFERENCE` |
| POST | `/stock/movements/:id/reverse` | 🔒 `stock.reverse` `{reason}` — مرة واحدة (`ALREADY_REVERSED`)، يعكس طرفي التحويل معاً |
| GET | `/stock/alerts` | `{out, low, expiring}` (الصلاحية خلال 30 يوماً) |

**تسلسل الصرف داخل الخادم (معاملة واحدة):**
1. `SELECT quantity FROM stock_balances WHERE itemId=$1 AND warehouseId=$2 FOR UPDATE`
2. إن كانت الكمية < المطلوب → إلغاء المعاملة و`422`
3. توليد الرقم من `number_sequences` (قفل الصف)
4. `INSERT stock_movements` + `UPDATE stock_balances`
5. `INSERT audit_logs`
6. COMMIT، ثم تقييم التنبيهات (حد أدنى) خارج المعاملة

### 3.8 البنايات والفضاءات والملاعب والموظفون ✅
المسارات تحت `/schools/:schoolId`. القراءة متاحة لكل مستخدم في المؤسسة (لقوائم الاختيار)، والكتابة 🔒 `spaces.*` / `facilities.*`. لا حذف: `POST /:id/archive` و`/:id/restore`.
| الطريقة | المسار | الوصف |
|---|---|---|
| GET/POST/PUT | `/buildings[/:id]?archived=1` | مع عدد الحجرات النشطة؛ أرشفة بناية تضم حجرات نشطة → `422 BUILDING_HAS_ROOMS` |
| GET | `/rooms?q=&buildingId=&spaceTypeId=&status=&archived=1` | مع `counts {assets, resourceUnits, facilities}` |
| POST/PUT | `/rooms[/:id]` | رمز مكرر → `409 DUPLICATE_CODE`؛ بناية مؤرشفة → `errors.archivedChoice` |
| GET | `/rooms/:id/contents` | 🔒 `spaces.view` الممتلكات والوحدات والأصناف الكمية والمرافق الموجودة |
| POST | `/rooms/:id/archive` | حجرة غير فارغة → `422 ROOM_NOT_EMPTY {assets, units}` |
| GET/POST/PUT | `/facilities[/:id]` | النوع من `FACILITY_TYPE`، حالة الأرضية والشباك؛ أرشفة مع تجهيزات → `422 FACILITY_HAS_EQUIPMENT` |
| GET | `/facilities/:id/equipment` | 🔒 `facilities.view` الممتلكات المرتبطة |
| GET/POST/PUT | `/staff[/:id]?q=&all=1` | الكتابة لمن يملك إحدى: `loans.create`، `custody.create`، `assets.update`، `users.manage`، `settings.manage`؛ رقم تأجير مكرر → `409 DUPLICATE_STAFF_NUMBER` |

الممتلك يقبل `roomId` و`facilityId` و`responsibleStaffId`؛ تغيير الحجرة يغلق `asset_locations` المفتوح ويفتح سطراً جديداً.

### 3.9 الوسائل التعليمية والإعارة ✅
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/resources?q=&resourceTypeId=&archived=1&lendable=1` | 🔒 `resources.view` مع `{total, available, onLoan, damaged, maintenance}` |
| GET | `/resources/:id` | البطاقة والوحدات (الحالة، الحجرة، `qrToken`، الإعارة الجارية) |
| POST/PUT | `/resources[/:id]` | `trackingMode` لا يتغير بعد وجود وحدات/إعارات → `422 TRACKING_LOCKED`؛ إجمالي أقل من المعار+المعطوب → `422 QUANTITY_BELOW_USED` |
| POST | `/resources/:id/damaged` | 🔒 `resources.update` `{quantityDamaged, reason}` للأصناف الكمية |
| POST | `/resources/:id/units` · PUT `/resources/:id/units/:unitId` | رقم فارغ = `CODE-001`؛ الحالة `ON_LOAN` لا تُضبط يدوياً |
| POST | `/resources/:id/archive` | إعارات جارية → `422 RESOURCE_ON_LOAN` |
| GET | `/loans?status=open\|returned&overdue=1&borrowerId=&resourceId=&q=&page=` | 🔒 `loans.view` مع `outstanding`، `overdue`، `lateDays`، `returns` |
| GET | `/loans/:id` | تفاصيل الإعارة والإرجاعات (للوصل) |
| POST | `/loans` | 🔒 `loans.create` `{resourceId, unitId?, quantity, borrowerStaffId, dueAt (YYYY-MM-DD), conditionOut?, notes?, clientOpId?}` — معارة → `409 RESOURCE_ALREADY_ON_LOAN`، معطوبة/قيد الصيانة → `422 RESOURCE_NOT_AVAILABLE`، كمية زائدة → `422 QUANTITY_NOT_AVAILABLE {available, requested}`، غير قابلة للإعارة → `422 RESOURCE_NOT_LENDABLE`، تاريخ ماضٍ → `errors.dueInPast` |
| POST | `/loans/:id/returns` | 🔒 `loans.update` `{quantity, damaged, conditionIn?, notes?, clientOpId?}` — أكثر من المتبقي → `422 RETURN_EXCEEDS`، مغلقة → `422 LOAN_CLOSED` |
| GET | `/scan/:qrToken` | يحل رمز الوحدة إلى `{kind:"resourceUnit", id: resourceId, unitId, schoolId}` |

التأخير = عدد الأيام (بالتقريب للأعلى) بعد نهاية يوم الإرجاع المتوقع؛ للإعارة المرجعة يُحسب حتى آخر إرجاع. **مؤجل**: `POST /loans/:id/signature` (التوقيع الإلكتروني)، `classId`، `receipt.pdf` من الخادم (المرحلة 7؛ الوصل الآن صفحة A4 في الواجهة `#/loans/:id/receipt`).

### 3.10 الجرد ✅
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/inventory-sessions` · `/inventory-sessions/:id` | 🔒 `inventory.view` مع `stats {lines, counted, withIssue}` |
| GET | `/inventory-sessions/assignable-users` | 🔒 `inventory.create` المستخدمون النشطون في المؤسسة |
| POST/PUT | `/inventory-sessions[/:id]` | `{type: ANNUAL\|PERIODIC\|EXCEPTIONAL, startDate, endDate, includesStock, roomIds[], assigneeIds[]}` — بعد الفتح → `422 SESSION_NOT_DRAFT` |
| POST | `/:id/open` | يأخذ اللقطة النظرية (ثابتة بعدها) |
| POST | `/:id/counts` | `{lineId \| qrToken, countedQty, foundRoomId?, conditionFound?, notes?, clientOpId?}` — خارج «مفتوحة» → `422 SESSION_NOT_OPEN`؛ غير مكلَّف → `403`؛ رمز مجهول → `422 QR_UNKNOWN` |
| GET | `/:id/lines?filter=pending\|counted\|issues&roomId=&q=` · `/:id/discrepancies` | الأسطر بفروقها، والملخص حسب النوع |
| POST | `/:id/complete` · `/:id/reopen` · `/:id/validate` 🔒 `inventory.validate` `{reportNotes}` · `/:id/close` 🔒 `inventory.validate` · `/:id/archive` 🔒 `inventory.archive` | انتقال غير مسموح → `422 INVALID_TRANSITION {from, to}` |

المحضر صفحة A4 في الواجهة `#/inventory/:id/report`؛ `report.pdf` من الخادم: المرحلة 7.

### 3.11 الصيانة ✅
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/maintenance/requests?q=&status=&urgency=&open=1&targetType=&page=` · `/maintenance/requests/:id` | 🔒 `maintenance.view` (التفاصيل مع الصورة والتدخلات والتكلفة) |
| POST | `/maintenance/requests` | 🔒 `maintenance.create` `{targetType: asset\|room\|facility\|resourceUnit, targetId, type, damageTypeId?, description, urgency, assigneeId?, photoDataUrl?, clientOpId?}` |
| PUT | `/maintenance/requests/:id` | الوصف/النوع/الاستعجال/المكلف — مغلق → `422 MAINTENANCE_CLOSED` |
| POST | `/maintenance/requests/:id/transition` | `{to, note?}` — غير مسموح → `422 INVALID_TRANSITION`؛ إغلاق دون إصلاح بلا ملاحظة → `errors.closeNeedsNote` |
| POST | `/maintenance/requests/:id/records` | `{outcome, contractor?, cost?, interventionReport?, startedAt?, repairedAt?, invoice?}` — خارج «قيد الدراسة/الإصلاح» → `422 RECORD_NOT_ALLOWED`؛ فاتورة مكررة → `409 DUPLICATE_INVOICE` |
| GET/POST/PUT | `/maintenance/schedules[/:id]` · POST `/maintenance/schedules/:id/generate` | الوقائية مع `dueSoon/overdue`؛ جدولة معطلة → `422 SCHEDULE_INACTIVE` |
| GET | `/maintenance/assignees` | المستخدمون الممكن تكليفهم |

### 3.12 الطلبيات والاقتناء ✅
| الطريقة | المسار | الوصف |
|---|---|---|
| GET/POST/PUT | `/approval-workflows[/:id]` | العرض 🔒 `purchasing.view`، التعديل 🔒 `settings.manage` `{name, fundingSourceId?, managingBody?, isActive, steps[{name, requiredRoleCode?}]}` — مستعمل → `422 WORKFLOW_IN_USE` |
| GET | `/purchase-orders?status=open\|<status>&q=&page=` · `/purchase-orders/:id` | 🔒 `purchasing.view` مع الأسطر والمصادقات والتسلمات والفواتير |
| POST/PUT | `/purchase-orders[/:id]` | `{title, needDescription?, fundingSourceId?, budgetLine?, supplierId?, items[{description, quantity, unitId?, estimatedUnitCost?, targetKind: ASSET\|STOCK\|RESOURCE, inventoryItemId?}]}` — بعد الإرسال → `422 PO_LOCKED` |
| POST | `/:id/submit` | `{workflowId?}` تلقائي حسب مصدر التمويل ثم الافتراضي — `422 NO_WORKFLOW` / `422 WORKFLOW_AMBIGUOUS {count}` |
| POST | `/:id/approvals/:stepId` | `{decision, comment?}` بالترتيب (`422 STEP_OUT_OF_ORDER`)، بالدور المطلوب أو `purchasing.approve` (`403`)، الرفض بتعليل |
| POST | `/:id/order` · `/:id/cancel` 🔒 `purchasing.cancel` `{reason}` | |
| POST | `/:id/deliveries` | `{receivedAt, conformity, conformityNotes?, items[{purchaseOrderItemId, quantityReceived, quantityAccepted}], clientOpId?}` — `422 DELIVERY_EXCEEDS {item, remaining, requested}` |
| POST | `/deliveries/post` | `{deliveryItemId, warehouseId? \| categoryId + trackingMode + roomId?, unitCost?}` مرة واحدة (`422 ALREADY_POSTED`) |
| POST | `/:id/invoices` · `/:id/close` | الفاتورة تتطلب مورداً (`422 NO_SUPPLIER`)؛ الإغلاق → `422 UNPOSTED_ITEMS {count}` |

### 3.13 العهدة ✅
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/custody?assetId=&staffId=&action=&q=&page=` · `/custody/:id` | 🔒 `custody.view` |
| POST | `/custody` | 🔒 `custody.create` `{action: HANDOVER\|ASSIGNMENT\|RELOCATION\|TRANSFER\|RETURN, assetId, toStaffId?, toRoomId?, occurredAt?, notes?, clientOpId?}` — `422 SAME_CUSTODIAN / NO_CURRENT_CUSTODIAN / SAME_ROOM / ASSET_ARCHIVED`؛ يحدّث المسؤول والفضاء ذرياً ويظهر في سجل الممتلك |

المحضر صفحة A4 `#/custody/:id/report`؛ التوقيع الإلكتروني و`report.pdf` من الخادم: مؤجلان.

### 3.14 الموردون ✅ (الطلبيات والفواتير: 3.12)
`GET /schools/:schoolId/suppliers?q=&archived=1` 🔒 `suppliers.view` (مع عدد الاستعمالات)، `POST`/`PUT` 🔒 `suppliers.create`/`update` (ICE مكرر → `409 DUPLICATE_ICE`)، `POST /:id/archive` و`/:id/restore` 🔒 `suppliers.archive` — لا حذف. `GET /suppliers/:id/orders` و`/invoices`: المرحلة 6.

### 3.15 المخطط التفاعلي ✅
`GET /schools/:schoolId/floor-plans` 🔒 `floorplan.view` (الاسم، أبعاد الخلفية، عدد الأشكال).
`GET /floor-plans/:id` 🔒 `floorplan.view` → المخطط وأشكاله، ولكل شكل `status: {level: GOOD|WARN|BAD|NONE, targetCode, targetName, spaceStatus, openMaintenance, assets, damagedAssets}` محسوبة من البيانات الحية: `BAD` = الفضاء أو المرفق `OUT_OF_SERVICE`؛ `WARN` = `NEEDS_MAINTENANCE` أو طلب صيانة مفتوح (`NEW/UNDER_REVIEW/IN_REPAIR`) أو ممتلك `DAMAGED/UNDER_REPAIR`؛ `NONE` = غير مرتبط.
`GET /floor-plans/:id/background` 🔒 `floorplan.view` → الصورة (`Cache-Control: private`).
`POST /floor-plans` 🔒 `floorplan.create` و`PUT /floor-plans/:id` 🔒 `floorplan.update` `{name, background?}`: `background` data URL لصورة PNG/JPEG/WEBP حتى 5 ميغابايت (النوع والأبعاد تُقرأ من محتوى الملف، 50 إلى 12000 بكسل)، `""` يزيل الخلفية، غيابه يبقيها.
`PUT /floor-plans/:id/shapes` 🔒 `floorplan.update` `{shapes:[{kind, geometry, label?, roomId?|facilityId?}]}` (حتى 500، استبدال كامل في معاملة): الإحداثيات نسبية 0..1 — `RECTANGLE {x,y,w,h}`، `CIRCLE {x,y,r}` (r نسبة من العرض)، `POLYGON {points:[x1,y1,...]}` (3 نقاط فأكثر)، `MARKER {x,y}`؛ الفضاء أو المرفق يجب أن يتبع نفس المؤسسة.
`DELETE /floor-plans/:id` 🔒 `floorplan.archive` — سجل التدقيق `FLOORPLAN_DELETE` يحفظ نسخة كاملة من الأشكال.
غير منجز: خلفية PDF.

### 3.16 الاستيراد ✅ (التصدير عبر التقارير 3.18)
الكيانات: `ASSETS`، `STAFF`، `SUPPLIERS`، `STOCK` (بطاقات المواد فقط، بلا أرصدة). كل المسارات تحت `/schools/:schoolId/imports`.

| الطريقة | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/entities` | `imports.view` | الكيانات وأعمدتها، و`allowed` حسب صلاحية الكيان المستهدف |
| GET | `/templates/:entity?lang=ar\|fr` | `imports.view` | قالب xlsx: البيانات (عناوين فقط)، القوائم (قيم المؤسسة الفعلية)، التعليمات |
| GET | `/` | `imports.view` | آخر 50 مهمة |
| GET | `/:id` | `imports.view` | المهمة: العناوين، المطابقة، الأعمدة الإلزامية الناقصة، أول 200 خطأ |
| POST | `/` | `imports.create` + إضافة الكيان | `{entity, fileName, dataBase64}` ← حفظ الملف (توقيع xlsx حقيقي، 5MB، 2000 سطر) + مطابقة تلقائية |
| POST | `/:id/validate` | `imports.create` + إضافة الكيان | `{mapping?: {field: columnIndex\|null}}` ← المقبول/المرفوض والأخطاء `{row, field, code, value}`؛ **بلا كتابة** |
| GET | `/:id/errors.xlsx?lang=` | `imports.view` | الأسطر المرفوضة كما هي مع عمود الشرح |
| POST | `/:id/commit` | `imports.create` + إضافة الكيان | `{acceptPartial?}` ← إعادة التحقق ثم الإنشاء في معاملة واحدة + تدقيق لكل سطر و`IMPORT_COMMIT` |
| POST | `/:id/cancel` | `imports.create` | إلغاء مهمة لم تُعتمد |

أخطاء: `IMPORT_EMPTY`، `IMPORT_TOO_MANY_ROWS {rows,max}`، `IMPORT_MAPPING_REQUIRED {fields}`، `IMPORT_STATE`، `IMPORT_STALE` (409: تغيرت البيانات منذ التحقق)، `IMPORT_NOTHING`، `IMPORT_HAS_ERRORS {rejected}`.

### 3.17 الوثائق ✅
تحت `/schools/:schoolId/documents`. الملف PDF أو PNG أو JPEG (8MB) بـ base64 في JSON، والنوع يُحدد من التوقيع.

| الطريقة | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/?q&categoryId&archived=1&entityType&entityId` | `documents.view` | القائمة (المقيدة تظهر فقط لمن يملك `documents.update`) |
| GET | `/:id` | `documents.view` | التفاصيل، الروابط بتسمياتها، الإصدارات |
| POST | `/` | `documents.create` | `{title, categoryId?, documentDate?, issuingBody?, expiresAt?, notes?, accessLevel, links[], fileName, dataBase64}` ← الإصدار 1 |
| PUT | `/:id` | `documents.update` | البيانات والروابط (الفرق في سجل التدقيق) |
| POST | `/:id/versions` | `documents.update` | `{fileName, dataBase64, changeNote}` ← إصدار جديد |
| GET | `/:id/versions/:versionId/download` | `documents.view` | الملف بعد التحقق من البصمة |
| POST | `/:id/archive` · `/:id/restore` | `documents.archive` | أرشفة بسبب / استرجاع. **لا مسار للحذف** |

أنواع الروابط: `ASSET, SUPPLIER, PURCHASE_ORDER, MAINTENANCE_REQUEST, ROOM, FACILITY` (من نفس المؤسسة). أخطاء: `DOCUMENT_ARCHIVED`، `DOCUMENT_VERSION_CONFLICT`، `FILE_INTEGRITY`، `FILE_MISSING`.

### 3.18 التقارير ✅
تحت `/schools/:schoolId`:

| الطريقة | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/reports` | `reports.view` | الكتالوج حسب صلاحيات المستخدم (المرشحات والحالات المقبولة لكل تقرير) |
| POST | `/reports/:key/preview` | `reports.view` | `{lang, filters}` ← `{html, rowCount}` |
| POST | `/reports/:key/pdf` | `reports.print` | PDF مؤرشف؛ الترويسات `X-Report-Id`، `X-Report-Number`، `X-Report-Pages` |
| POST | `/reports/:key/xlsx` | `reports.export` | Excel مؤرشف |
| GET | `/report-archive?key&q&page&pageSize` | `reports.view` | الأرشيف (التقارير التي يحق للمستخدم رؤيتها فقط) |
| GET | `/report-archive/:id/download` | `reports.view` | إعادة التنزيل بعد التحقق من البصمة |
| POST | `/loans/:id/receipt.pdf`، `/custody/:id/report.pdf`، `/inventory-sessions/:id/report.pdf` | `reports.print` + صلاحية الوحدة | الوصل والمحاضر PDF من الخادم، مؤرشفة |

مفاتيح التقارير المنجزة: `ASSETS, STOCK, STOCK_MOVEMENTS, STOCK_LOW, SPACES, FACILITIES, RESOURCES, LOANS, LOANS_OVERDUE, RETURNS, MAINTENANCE, PURCHASING, SUPPLIERS, CUSTODY, INVENTORY, DISCREPANCIES, ANNUAL` (`ANNUAL` يتطلب أيضاً `dashboard.view`). المرشحات: `q, from, to, status, categoryId, roomId, warehouseId, supplierId, sessionId, year, includeArchived`. أخطاء: `REPORT_TOO_LARGE {max}`، `PDF_ENGINE_UNAVAILABLE` (503).
غير منجز: `/report-templates` واختيار الترويسة لكل تقرير (`reports.choose_letterhead`)، والمفتاح `EQUIPMENT`.

### 3.19 لوحة القيادة والإشعارات والتدقيق
`GET /dashboard/stats`, `/dashboard/charts` (✅ 12 شهراً، `dashboard.view`), `/dashboard/alerts`, `/dashboard/activity` — كلها محسوبة من القاعدة.
**الإشعارات ✅** (المرحلة 8): تُولَّد بفحص دوري على الخادم كل `NOTIFY_INTERVAL_MINUTES` دقيقة (افتراضياً 15؛ 0 يعطله) لكل مؤسسة نشطة، بقفل استشاري (`pg_try_advisory_xact_lock`) يمنع فحصين متزامنين. الأنواع: `STOCK_OUT, STOCK_LOW, STOCK_EXPIRY, LOAN_OVERDUE, MAINTENANCE_URGENT, MAINTENANCE_DUE, APPROVAL_REQUEST, INVENTORY_SESSION, DOCUMENT_EXPIRY`. المستلمون حسب الصلاحية الفعلية (مثلاً `stock.view`)، والمصادقة لصاحب الدور المطلوب في الخطوة، والجرد للمكلفين، والوثيقة المقيدة لمن يملك `documents.update`. عدم التكرار بمفتاح `(userId, dedupeKey)` فريد؛ زوال الشرط يحرر المفتاح فيُعاد التنبيه إن عاد الشرط، والإشعارات القديمة تبقى.
`GET /notifications?unread=1&limit=` → `{unread, items:[{id, at, type, titleKey, vars, schoolId, entityType, entityId, readAt}]}` (النص يُركَّب في الواجهة من `titleKey` و`vars` حسب اللغة).
`POST /notifications/:id/read` (إشعار مستخدم آخر → 404)، `POST /notifications/read-all`.
`GET/PUT /notifications/preferences` `{items:[{type, enabled}]}` (نوع غير معروف → 400؛ القناة داخل التطبيق فقط).
`POST /schools/:schoolId/notifications/run` 🔒 `settings.manage` → `{created, active}` (تشغيل يدوي للفحص).
**سجل التدقيق ✅**: `GET /schools/:schoolId/audit-logs?userId=&action=&entityType=&entityId=&from=&to=&page=&pageSize=` 🔒 `audit.view` → `{total, page, pageSize, items:[{id, at, action, entityType, entityId, user, userId, ip, requestId, before, after}]}` (فترة معكوسة → 400). `GET /audit-logs/facets` → القيم المتاحة للتصفية. قراءة فقط: لا مسار للتعديل أو الحذف (والجدول إلحاق فقط بقادح في القاعدة).

### 3.20 النسخ الاحتياطي ✅ (مدير النظام فقط)
`GET /backups` (القائمة + هل المفتاح مضبوط + ساعة النسخ اليومي + عبارة التأكيد)، `POST /backups` (إنشاء؛ 503 `BACKUP_KEY_MISSING` بلا مفتاح، 409 `BACKUP_BUSY` أثناء عملية أخرى)، `POST /backups/upload` (`application/octet-stream`، حتى 1 GB؛ 422 `BACKUP_DECRYPT_FAILED` لملف معدّل أو بمفتاح آخر)، `POST /backups/:id/verify`، `GET /backups/:id/download`، `POST /backups/:id/restore` `{password, confirm: "استعادة النسخة"}` (401 `WRONG_PASSWORD`، 409 `BACKUP_SCHEMA_MISMATCH`). صيغة الملف `.hbk`: `HBK1` + ملح 16 بايت + IV 12 بايت + نص مشفر AES-256-GCM + وسم 16 بايت؛ داخله `db.dump` و`files.tgz` و`manifest.json`. `PUT /backups/schedule` غير منجز (الموعد عبر `BACKUP_DAILY_HOUR`).

### 3.21 المزامنة دون اتصال ✅ (جزئياً)
`POST /schools/:schoolId/sync` `{deviceId, operations:[{clientOpId (UUID), operation, payload, clientCreatedAt}]}` (1 إلى 100) → `{results:[{clientOpId, status: APPLIED|CONFLICT|REJECTED|RECEIVED, error?, details?, resultRef?, replayed?}]}`.
العمليات المقبولة: `stock.in` و`stock.out` (🔒 `stock.create`) و`inventory.count` (🔒 `inventory.view` + التكليف؛ الحمولة تضم `sessionId`). تُطبَّق بالترتيب عبر نفس الخدمات المعتادة (نفس التحقق وسجل التدقيق)، والصلاحية تُفحص لكل عملية. كل عملية تُسجَّل في `offline_sync_operations`؛ `clientOpId` فريد فإعادة الإرسال (أو إرسال متزامن) تعيد النتيجة الأولى بـ`replayed: true` ولا تطبق شيئاً مرتين.
- `CONFLICT`: حالة تغيرت على الخادم أثناء الانقطاع — `STOCK_INSUFFICIENT`، `SESSION_NOT_OPEN`، `ITEM_INACTIVE`، `WAREHOUSE_INACTIVE`، `COUNT_NEWER` (عدّ أحدث من مستخدم آخر بعد `clientCreatedAt`؛ لا يُكتب فوقه).
- `REJECTED`: `VALIDATION_ERROR`، `FORBIDDEN`، `NOT_FOUND`، `FOREIGN_OPERATION` (المعرّف لمستخدم أو مؤسسة أخرى).
- `RECEIVED`: خطأ غير متوقع؛ تبقى العملية وتُعاد محاولتها.
`GET /schools/:schoolId/sync` → آخر 100 عملية للمستخدم.
غير منجز: `GET /sync/pull` (لا تخزين محلي لبيانات الخادم؛ العمل دون اتصال داخل جلسة مفتوحة فقط)، وعمليات الإعارة والإرجاع دون اتصال.
