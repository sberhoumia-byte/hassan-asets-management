#!/bin/bash
# تثبيت النظام على خادم Ubuntu 24.04 جديد (يُشغَّل كـ root، مرة واحدة). يُستدعى من cloud-init أو يدوياً:
#   SETUP_TOKEN=... BACKUP_ENCRYPTION_KEY=... [DOMAIN=...] bash deploy/install.sh
# - يثبّت Docker من مستودع Ubuntu، ويولّد أسرار قاعدة البيانات والجلسات على الخادم نفسه (لا تغادره).
# - بلا DOMAIN: يستعمل <IP>.sslip.io مع شهادة HTTPS تلقائية.
# - يكتب الملخص في /root/hassan-info.txt
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
: "${SETUP_TOKEN:?SETUP_TOKEN is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"

export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io docker-compose-v2
  systemctl enable --now docker
fi
# ذاكرة احتياطية لبناء الصور على خادم صغير
if ! swapon --show | grep -q /swapfile && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

if [ -z "${DOMAIN:-}" ]; then
  IP=$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
  DOMAIN="${IP//./-}.sslip.io"
fi

if [ ! -f .env ]; then
  umask 077
  cat > .env <<ENV
POSTGRES_USER=hassan
POSTGRES_DB=hassan_assets
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
SETUP_TOKEN=${SETUP_TOKEN}
BACKUP_ENCRYPTION_KEY=${BACKUP_ENCRYPTION_KEY}
BACKUP_DAILY_HOUR=${BACKUP_DAILY_HOUR:-2}
DOMAIN=${DOMAIN}
WEB_ORIGIN=https://${DOMAIN}
COOKIE_SECURE=true
ENV
fi

docker compose -f docker/docker-compose.yml -f deploy/docker-compose.https.yml --env-file .env up -d --build

for i in $(seq 90); do
  curl -fsS "https://${DOMAIN}/api/v1/health" >/dev/null 2>&1 && break
  sleep 5
done
STATUS=$(curl -fsS "https://${DOMAIN}/api/v1/health" 2>/dev/null || echo "not ready")
cat > /root/hassan-info.txt <<INFO
نظام التدبير المادي
العنوان: https://${DOMAIN}
حالة الخادم: ${STATUS}
التحديث لاحقاً: bash ${APP_DIR}/deploy/update.sh
INFO
cat /root/hassan-info.txt
