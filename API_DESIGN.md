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

### 3.1 المصادقة والحساب
| الطريقة | المسار | الوصف |
|---|---|---|
| POST | `/auth/login` | `{username, password}` → `{accessToken, user, schools[]}` + cookie |
| POST | `/auth/refresh` | تدوير refresh token |
| POST | `/auth/logout` | إلغاء الجلسة |
| GET | `/auth/me` | المستخدم، أدواره وصلاحياته الفعلية لكل مؤسسة |
| POST | `/auth/change-password` | |
| GET/DELETE | `/auth/sessions[/:id]` | إدارة الجلسات النشطة |

### 3.2 التسلسل الإداري والمؤسسات
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/academies` | قائمة الأكاديميات |
| GET | `/academies/:id/directorates` | المديريات التابعة فقط |
| GET | `/directorates/:id/schools?q=&code=` | المؤسسات التابعة، بحث بالاسم أو الرمز |
| POST/PATCH | `/academies`, `/directorates`, `/schools[/:id]` | 🔒 `schools.create/update` |
| GET/PATCH | `/schools/:id/settings` | إعدادات المؤسسة |
| GET/POST | `/schools/:id/years` | السنوات الدراسية |

### 3.3 الهوية البصرية والترويسة
| الطريقة | المسار | الوصف |
|---|---|---|
| GET/PATCH | `/branding` | إعدادات الهوية للمؤسسة النشطة |
| POST | `/branding/logo` | multipart (PNG/JPG/WEBP ≤ 2MB) |
| DELETE | `/branding/logo` | 🔒 بعد تأكيد |
| GET/POST | `/letterheads` | قائمة/إنشاء (`mode: IMAGE|GENERATED`) |
| PATCH | `/letterheads/:id` | يزيد `version` ويُسجَّل في التدقيق |
| POST | `/letterheads/:id/image` | رفع صورة الترويسة |
| POST | `/letterheads/:id/set-default` | |
| POST | `/letterheads/:id/preview` | → PDF A4 لتقرير نموذجي |
| POST | `/branding/reset` | استعادة الافتراضي |

### 3.4 المستخدمون والصلاحيات
`GET/POST /users`, `PATCH /users/:id`, `POST /users/:id/suspend`, `PUT /users/:id/roles` (قائمة `{roleId, schoolId}`), `PUT /users/:id/permission-overrides`, `GET /roles`, `GET /permissions`. كلها 🔒 `users.manage`.

### 3.5 القوائم القابلة للتعديل
`GET /lookups/:listKey`، `POST /lookups/:listKey` 🔒 `lookups.manage`، `PATCH /lookups/:listKey/:id`. تُستعمل لكل Select في الواجهة مع بحث `?q=`.

### 3.6 الممتلكات
| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/assets` | فلترة: تصنيف، حالة، فضاء، مصدر، فترة، مسؤول |
| POST | `/assets` | رقم الجرد يُولَّد تلقائياً أو يُدخل؛ التكرار → `409` |
| GET/PATCH | `/assets/:id` | |
| POST | `/assets/:id/archive` | الاستبعاد |
| GET | `/assets/:id/history` | التدقيق + المواقع + العهدة + الصيانة |
| GET | `/assets/:id/qr.png` | رمز QR (يحمل `qrToken` فقط) |
| GET | `/scan/:qrToken` | حل الرمز إلى الكيان (ممتلك أو وحدة وسيلة) |
| GET/POST/PATCH | `/asset-categories` | شجرة التصنيفات |

### 3.7 المخزون
| الطريقة | المسار | الوصف |
|---|---|---|
| GET/POST/PATCH | `/stock/items[/:id]` | المواد |
| GET | `/stock/items/:id/balances` | الرصيد حسب المخزن |
| GET | `/stock/movements` | فلترة بالمادة/المخزن/النوع/الفترة |
| POST | `/stock/movements/in` | `{itemId, warehouseId, quantity, unitCost?, supplierId?, expiryDate?}` |
| POST | `/stock/movements/out` | صرف؛ رصيد غير كاف → `422 STOCK_INSUFFICIENT` |
| POST | `/stock/movements/transfer` | ينشئ حركتين مرتبطتين ذرياً |
| POST | `/stock/movements/return` | |
| POST | `/stock/movements/adjust` | 🔒 `stock.adjust` + سبب إلزامي |
| POST | `/stock/movements/:id/reverse` | 🔒 `stock.reverse` |
| GET | `/stock/alerts` | منخفض / نافد / قارب الانتهاء |
| GET/POST | `/warehouses` | |

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

### 3.14 الموردون
`/suppliers` CRUD + `GET /suppliers/:id/orders` + `GET /suppliers/:id/invoices`.

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
