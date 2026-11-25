# HASSAN IBN THABIT – ASSETS MANAGEMENT SYSTEM

**نظام التدبير المادي لمؤسسة حسان بن ثابت الابتدائية بأورير**
المديرية الإقليمية أكادير إداوتنان · الأكاديمية الجهوية للتربية والتكوين لجهة سوس ماسة

*التدبير المادي الذكي – من أجل مؤسسة منظمة وذات جودة للجميع.*

> ⚠ **الحالة الحالية: المرحلة الثانية (الواجهات) منجزة في «وضع المراجعة».**
> الواجهات تعمل فعلياً، لكن البيانات تُحفظ في المتصفح فقط إلى حين ربط الخادم وقاعدة البيانات في المرحلة 3.

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

## الأوامر المتاحة حالياً

```bash
npm install                 # تثبيت التبعيات (Prisma حالياً)
npm run db:validate         # التحقق من مخطط Prisma

# اختبار قيود قاعدة البيانات على قاعدة اختبار فارغة (ستُمسح محتوياتها)
TEST_DATABASE_URL=postgresql://user@localhost:5432/hassan_test ./scripts/test-db-constraints.sh
```

قاعدة تطوير عبر Docker:
```bash
cp .env.example .env        # ثم عدّل القيم
docker compose -f docker/docker-compose.dev.yml --env-file .env up -d
```

## تشغيل الواجهة (المرحلة 2)
```bash
npm install
npm run dev:web        # http://localhost:5173
npm run build:web      # بناء الإنتاج في apps/web/dist
npm run build:review   # ملف HTML واحد مستقل للمراجعة (apps/web/dist-review)
npm test               # اختبارات الوحدة (Vitest)
npm run test:e2e       # اختبارات Playwright (حاسوب + هاتف)
```
عند أول تشغيل تظهر شاشة «الإعداد الأول» لإنشاء حساب المدير.

## أوامر معرَّفة لكنها غير مربوطة بعد
`dev:api` (المرحلة 3)، `build:android` و`build:windows` (المرحلة 10) — تطبع المرحلة وتخرج برمز خطأ.

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
- البيانات التجريبية منفصلة (`database/seeds`، أمر `db:seed:test`).
- لا تُعلن أي وحدة مكتملة قبل اختبارها.
