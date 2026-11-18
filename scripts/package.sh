#!/usr/bin/env bash
# Sotish / o'rnatish paketi: dastur kodi (ma'lumotlar, testlar, git va node_modules siz) → dist/dokon-boshqaruv-<versiya>.zip
# Mijoz kompyuterida: zip ni oching → Windows: scripts\windows\install.bat, Linux: npm install --omit=dev && sudo bash scripts/install-service.sh
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(node -p "require('./package.json').version")
OUT="dist/dokon-boshqaruv-$VER.zip"
mkdir -p dist
rm -f "$OUT"
zip -qr "$OUT" server public scripts package.json package-lock.json .env.example README.md QOLLANMA.md \
  -x 'scripts/license.js' -x '*/.DS_Store'
echo "Paket: $OUT ($(du -h "$OUT" | cut -f1))"
echo "Eslatma: scripts/license.js (kalit chiqarish) paketga kirmaydi — u faqat sizda qoladi."
