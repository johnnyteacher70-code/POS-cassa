#!/usr/bin/env bash
# Kassa rejimi (Linux): Chrome/Chromium to'liq ekranda, chek oynasiz standart printerga (--kiosk-printing). Chiqish: Alt+F4.
URL="${1:-http://localhost:3000/#/pos}"
for B in google-chrome chromium chromium-browser microsoft-edge; do
  if command -v "$B" >/dev/null; then exec "$B" --kiosk --kiosk-printing --user-data-dir="$HOME/.dokon-kassa" --app="$URL"; fi
done
echo "Chrome yoki Chromium topilmadi"; exit 1
