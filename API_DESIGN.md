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
`GET /schools/:schoolId/dashboard/{stats,alerts,activity}` 🔒 `dashboard.view` — أرقام محسوبة من القاعدة، وآخر العمليات من سجل التدقيق. `GET /notifications` إشعارات المستخدم. `GET /health` فحص الخادم والقاعدة.

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

### 3.8 البنايات والفضاءات والملاعب
`/buildings`, `/rooms` (فلترة بالنوع والبناية والحالة)، `/rooms/:id/contents` (الممتلكات والوسائل الموجودة)، `/facilities`، `/facilities/:id/equipment`. كلها CRUD + archive.

### 3.9 الوسائل التعليمية والإعارة
| الطريقة | المسار | الوصف |
|---|---|---|
| GET/POST/PATCH | `/resources[/:id]` | |
| GET/POST | `/resources/:id/units` | الوحدات الفردية |
| GET | `/resources/:id/availability` | المتاح الآن |
| GET | `/loans?status=&overdue=true&borrowerId=` | |
| POST | `/loans` | `{resourceId, unitId? , quantity?, borrowerStaffId, classId?, dueAt, conditionOut}` — معارة → `409 RESOURCE_ALREADY_ON_LOAN`، معطوبة → `422 RESOURCE_NOT_AVAILABLE` |
| POST | `/loans/:id/returns` | `{quantity, conditionIn, damaged}` — إرجاع كلي أو جزئي |
| POST | `/loans/:id/signature` | توقيع المستعير |
| GET | `/loans/:id/receipt.pdf` · `/returns/:id/receipt.pdf` | وصل الإعارة / الإرجاع |

### 3.10 الجرد
`POST /inventory-sessions` (نوع، تواريخ، فضاءات، مكلفون) → `POST /:id/open` (يأخذ لقطة النظري) → `POST /:id/counts` (سطر عدّ، يقبل `Idempotency-Key`، يدعم QR) → `GET /:id/discrepancies` → `POST /:id/complete` → `POST /:id/validate` 🔒 → `POST /:id/close` → `GET /:id/report.pdf` (المحضر).

### 3.11 الصيانة
`/maintenance/requests` (CRUD، فلترة بالاستعجال والحالة)، `POST /:id/transition` `{to: MaintenanceStatus}` مع التحقق من الانتقالات المسموحة، `POST /:id/records` (تدخل)، `/maintenance/schedules` (الوقائية).

### 3.12 الطلبيات والاقتناء
`/purchase-orders` CRUD، `POST /:id/submit` (يختار مسار المصادقة حسب مصدر التمويل)، `POST /:id/approvals/:stepId` `{decision, comment}`، `POST /:id/deliveries` (التسلم + المطابقة)، `POST /deliveries/:id/post-to-stock`، `POST /deliveries/:id/post-to-assets`، `/invoices`، `/approval-workflows` 🔒 `settings.manage`.

### 3.13 العهدة
`GET /custody?assetId=&staffId=`، `POST /custody` `{action, assetId, toStaffId?, toRoomId?, signatures?}` (يحدّث موقع/مسؤول الممتلك ذرياً)، `GET /custody/:id/report.pdf` (محضر التسليم).

### 3.14 الموردون ✅ (الطلبيات والفواتير: المرحلة 6)
`GET /schools/:schoolId/suppliers?q=&archived=1` 🔒 `suppliers.view` (مع عدد الاستعمالات)، `POST`/`PUT` 🔒 `suppliers.create`/`update` (ICE مكرر → `409 DUPLICATE_ICE`)، `POST /:id/archive` و`/:id/restore` 🔒 `suppliers.archive` — لا حذف. `GET /suppliers/:id/orders` و`/invoices`: المرحلة 6.

### 3.15 المخطط التفاعلي
`/floor-plans` CRUD، `POST /floor-plans/:id/background` (صورة أو PDF)، `PUT /floor-plans/:id/shapes` (حفظ الأشكال وربطها)، `GET /floor-plans/:id/status` (ألوان حسب الحالة والأعطاب).

### 3.16 الاستيراد والتصدير
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/imports/templates/:entity.xlsx` | نموذج Excel |
| POST | `/imports` | رفع الملف → `ImportJob` |
| PUT | `/imports/:id/mapping` | ربط الأعمدة |
| POST | `/imports/:id/validate` | → المقبول/المرفوض + تقرير الأخطاء (بدون كتابة) |
| GET | `/imports/:id/errors.xlsx` | تقرير الأخطاء |
| POST | `/imports/:id/commit` | الكتابة النهائية في معاملة واحدة + تدقيق |
| GET | `/exports/:entity.xlsx?…filters` | تصدير الكل / نتائج البحث / فترة / تصنيف / موقع |

### 3.17 الوثائق
`/documents` CRUD، `POST /documents/:id/versions` (multipart)، `GET /documents/:id/versions/:v/download` (رابط موقّع قصير الأجل)، `PUT /documents/:id/links`.

### 3.18 التقارير
`GET /reports` (الكتالوج)، `POST /reports/:key/preview` → HTML للمعاينة، `POST /reports/:key/pdf`، `POST /reports/:key/xlsx`، `/report-templates` (النماذج المفضلة، مع `letterheadId` اختياري 🔒 `reports.choose_letterhead`).

مفاتيح التقارير: `ASSETS, EQUIPMENT, STOCK, STOCK_MOVEMENTS, STOCK_LOW, SPACES, FACILITIES, RESOURCES, LOANS, LOANS_OVERDUE, RETURNS, MAINTENANCE, PURCHASING, SUPPLIERS, CUSTODY, INVENTORY, DISCREPANCIES, ANNUAL`.

### 3.19 لوحة القيادة والإشعارات والتدقيق
`GET /dashboard/stats`, `/dashboard/charts?range=`, `/dashboard/alerts`, `/dashboard/activity` — كلها محسوبة من القاعدة.
`GET /notifications`, `POST /notifications/:id/read`, `PUT /notifications/preferences`.
`GET /audit-logs` 🔒 `audit.view` (قراءة فقط، لا مسار للتعديل أو الحذف).

### 3.20 النسخ الاحتياطي
`GET /backups`، `POST /backups` 🔒، `POST /backups/:id/verify`، `GET /backups/:id/download` 🔒، `POST /backups/:id/restore` 🔒 `backup.restore` + إعادة إدخال كلمة المرور + عبارة تأكيد، `PUT /backups/schedule`.

### 3.21 المزامنة دون اتصال
`POST /sync/push` `{deviceId, operations:[{clientOpId, operation, payload, baseVersion, clientCreatedAt}]}` → لكل عملية: `APPLIED | CONFLICT | REJECTED` مع السبب.
`GET /sync/pull?since=` → التغييرات في الكيانات المسموح تخزينها محلياً.
العمليات الحساسة (صرف مخزون، إعارة، عدّ جرد) تبقى «قيد التحقق» في الواجهة حتى يرد الخادم بـ `APPLIED`.
