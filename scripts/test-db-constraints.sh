#!/usr/bin/env bash
# يطبّق المخطط + القيود على قاعدة اختبار فارغة ثم يشغّل اختبارات القيود.
# الاستعمال: TEST_DATABASE_URL=postgresql://user@host:5432/hassan_test ./scripts/test-db-constraints.sh
set -euo pipefail
: "${TEST_DATABASE_URL:?TEST_DATABASE_URL مطلوب (قاعدة اختبار فقط، ستُمسح محتوياتها)}"
cd "$(dirname "$0")/../database"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script \
  | psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f prisma/sql/constraints.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f ../tests/database/constraints.test.sql 2>&1 | grep -E 'PASS|FAIL|ERROR'
