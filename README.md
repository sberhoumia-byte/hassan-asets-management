# HASSAN IBN THABIT – ASSETS MANAGEMENT SYSTEM

**نظام التدبير المادي لمؤسسة حسان بن ثابت الابتدائية بأورير**
المديرية الإقليمية أكادير إداوتنان · الأكاديمية الجهوية للتربية والتكوين لجهة سوس ماسة

*التدبير المادي الذكي – من أجل مؤسسة منظمة وذات جودة للجميع.*

> ⚠ **الحالة الحالية: المرحلة الأولى (التحليل والتأسيس) فقط.**
> لا يوجد بعد تطبيق قابل للتشغيل. الموجود: الوثائق، هيكل المستودع، ومخطط قاعدة البيانات المُتحقَّق منه.

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

## أوامر معرَّفة لكنها غير مربوطة بعد
`npm run dev:web`, `dev:api`, `build:web`, `build:android`, `build:windows`, `test` — كل واحد منها يطبع المرحلة التي سيُنجز فيها ويخرج برمز خطأ، حتى لا يُظن أنها تعمل.

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
