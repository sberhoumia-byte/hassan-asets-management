#!/bin/bash
# تحديث النظام إلى آخر إصدار في المستودع (الترحيلات تُطبَّق تلقائياً). أنشئ نسخة احتياطية ونزّلها قبل التحديث.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose -f docker/docker-compose.yml -f deploy/docker-compose.https.yml --env-file .env up -d --build
docker compose -f docker/docker-compose.yml -f deploy/docker-compose.https.yml --env-file .env ps
