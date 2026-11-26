#!/bin/bash
# بناء APK موقّع داخل حاوية Android SDK (لا حاجة لتثبيت Android Studio).
#   HASSAN_SIGNING_DIR=<مجلد فيه hassan-release.jks و keystore.properties> ./build-apk.sh
# keystore.properties: storeFile=/signing/hassan-release.jks + storePassword + keyAlias + keyPassword
# المخرج: android/app/build/outputs/apk/release/app-release.apk
set -euo pipefail
cd "$(dirname "$0")"
: "${HASSAN_SIGNING_DIR:?set HASSAN_SIGNING_DIR (keystore folder, outside the repository)}"
npm ci --no-audit --no-fund
npm run sync
cp "$HASSAN_SIGNING_DIR/keystore.properties" android/keystore.properties
trap 'rm -f android/keystore.properties' EXIT
docker run --rm --user root -v "$PWD":/project -v "$HASSAN_SIGNING_DIR":/signing:ro -v hassan-gradle-cache:/root/.gradle \
  -w /project/android cimg/android:2025.10 bash -c 'export ANDROID_HOME=/home/circleci/android-sdk; ./gradlew --no-daemon assembleRelease'
echo "APK: android/app/build/outputs/apk/release/app-release.apk"
