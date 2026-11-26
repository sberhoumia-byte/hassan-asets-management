#!/bin/bash
# بناء مثبّت Windows (NSIS) من Linux أو macOS داخل حاوية electron-builder (فيها Wine لتضمين الأيقونة).
# على Windows مباشرة: npm ci && npm run build:win
# المخرج: dist/HassanAssets-Setup-<الإصدار>.exe (غير موقّع رقمياً: يظهر تحذير SmartScreen، انظر دليل التثبيت)
set -euo pipefail
cd "$(dirname "$0")"
npm ci --no-audit --no-fund
npm run prepare-connect
docker run --rm -v "$PWD":/project -v hassan-electron-cache:/root/.cache -w /project electronuserland/builder:wine \
  bash -c "npx electron-builder --win nsis --x64 && chown -R $(id -u):$(id -g) dist"
ls -la dist/*.exe
