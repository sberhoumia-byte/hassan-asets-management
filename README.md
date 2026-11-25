# HASSAN IBN THABIT – ASSETS MANAGEMENT SYSTEM

**نظام التدبير المادي لمؤسسة حسان بن ثابت الابتدائية بأورير**
المديرية الإقليمية أكادير إداوتنان · الأكاديمية الجهوية للتربية والتكوين لجهة سوس ماسة

*التدبير المادي الذكي – من أجل مؤسسة منظمة وذات جودة للجميع.*

> **الحالة الحالية: المرحلة التاسعة منجزة (بانتظار المراجعة)** — إضافة إلى ما سبق (الخادم، المصادقة، الصلاحيات، التسلسل الإداري، الهوية البصرية، المستخدمون، الممتلكات، المخزون، الموردون، المرجعيات، البنايات والفضاءات، الموظفون، الوسائل التعليمية، الإعارة، الجرد، الصيانة، العهدة، الطلبيات، التقارير PDF/Excel، الاستيراد، الوثائق): الإشعارات المجدولة بتفضيلاتها، صفحة سجل التدقيق، المخطط التفاعلي للمؤسسة بألوان الحالة، والعمل دون اتصال (PWA وطابور عمليات يُزامَن دون تكرار)، والنسخ الاحتياطي المشفر والاستعادة، واختبارات الأمن والأداء. المتبقي: بناء النسخ النهائية (المرحلة 10).

## ما هو موجود الآن

| الملف | المحتوى |
|---|---|
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | المعمارية، التقنيات، المراحل، القرارات المطروحة |
| [DATABASE_DESIGN.md](DATABASE_DESIGN.md) | تصميم القاعدة ومخططات ERD والقواعد الحرجة |
| [database/prisma/schema.prisma](database/prisma/schema.prisma) | مخطط Prisma (63 جدولاً) |
| [database/prisma/sql/constraints.sql](database/prisma/sql/constraints.sql) | القيود الإضافية (CHECK، فهارس جزئية، append-only) |
| [API_DESIGN.md](API_DESIGN.md) | عقود REST والصلاحيات وصيغة الأخطاء |
| [TEST_PLAN.md](TEST_PLAN.md) | خطة الاختبارات |
| [SECURITY.md](SECURITY.md) | الأمن والقانون 09-08 |
| [docs/UI/screens-concept.html](docs/UI/screens-concept.html) | تصور أولي للشاشات (ثابت، للمراجعة فقط) |
| [docs/ERD/erd.mmd](docs/ERD/erd.mmd) | مخطط ERD بصيغة Mermaid |

## المتطلبات
- Node.js 22 أو أحدث، npm 10
- PostgreSQL 16 (أو Docker)
- Chromium لتوليد PDF على الخادم (متصفح Playwright المثبت، أو `CHROMIUM_PATH=/usr/bin/chromium`؛ داخل الحاويات `PDF_NO_SANDBOX=true`). صورة Docker للخادم تثبّته تلقائياً.
- لاختبارات PDF فقط: `poppler-utils` (pdftotext، pdftoppm، pdffonts)

## التشغيل المحلي (تطوير)

```bash
npm install
cp .env.example .env          # املأ DATABASE_URL و TEST_DATABASE_URL والأسرار (32 حرفاً عشوائياً على الأقل)
docker compose -f docker/docker-compose.dev.yml --env-file .env up -d   # أو PostgreSQL 16 مثبت محلياً
npm run db:deploy             # تطبيق الهجرات
npm run db:seed               # بيانات الأساس: الصلاحيات، الأدوار، القوائم، التسلسل الافتراضي (لا مستخدمين)
npm run dev:api               # الخادم: http://localhost:3000/api/v1  (Swagger: /api/docs)
npm run dev:web               # الواجهة: http://localhost:5173 (تمرر /api إلى 3000)
```
عند أول فتح تظهر شاشة «الإعداد الأول» لإنشاء حساب مدير النظام. لا توجد أي كلمة مرور افتراضية.

## التشغيل على خادم المؤسسة (Docker)
```bash
cp .env.example .env          # كلمات مرور وأسرار حقيقية هنا فقط، لا في المستودع
docker compose -f docker/docker-compose.yml --env-file .env up -d --build
# الواجهة: http://<عنوان-الخادم>:8080
```
⚠ ملفات Docker مكتوبة لكنها **لم تُجرَّب** في بيئة البناء الحالية (لا يتوفر فيها Docker).

## الاختبارات
```bash
npm test                  # وحدة الواجهة + تكامل الخادم على PostgreSQL
npm run test:e2e          # الشاشات (Playwright، حاسوب + هاتف) على نسخة المراجعة
npm run test:e2e:server   # المسار الكامل على الخادم الحقيقي
TEST_DATABASE_URL=... ./scripts/test-db-constraints.sh   # قيود القاعدة (SQL)
```

## نسخة المراجعة
`npm run build:review` ينتج ملف HTML واحداً يعمل دون خادم (البيانات في المتصفح فقط) لعرض الواجهات.

## أوامر معرَّفة لكنها غير مربوطة بعد
`build:android` و`build:windows` (المرحلة 10) — تطبع المرحلة وتخرج برمز خطأ.

## هيكل المستودع
```
apps/        web · api · android · desktop
packages/    shared · ui · types · validation · config
database/    prisma · migrations · seeds
docs/        ERD · API · UI · USER-MANUAL · INSTALLATION
scripts/  tests/  docker/  storage/
```

## قواعد العمل
- لا أسرار ولا كلمات مرور حقيقية في المستودع.
- لا أرقام أو بيانات واقعية مفترضة؛ كل البيانات تُدخل من المستخدم أو Excel.
- بيانات الأساس (`db:seed`) لا تحتوي أي بيانات واقعية ولا مستخدمين؛ الاختبارات تعمل في مخططات معزولة تُحذف بعدها.
- لا تُعلن أي وحدة مكتملة قبل اختبارها.
