#!/usr/bin/env bash
# Serverni Linux xizmati (systemd) sifatida o'rnatish: kompyuter yonganda o'zi ishga tushadi,
# yiqilsa 5 soniyadan keyin qayta ishga tushadi.
#   O'rnatish:   sudo bash scripts/install-service.sh
#   Holati:      systemctl status dokon
#   Jurnal:      journalctl -u dokon -f
#   To'xtatish:  sudo systemctl stop dokon      Olib tashlash: sudo bash scripts/install-service.sh --remove
set -euo pipefail

NAME=dokon
UNIT=/etc/systemd/system/$NAME.service

if [ "$(id -u)" -ne 0 ]; then echo "sudo bilan ishga tushiring: sudo bash $0"; exit 1; fi

if [ "${1:-}" = "--remove" ]; then
  systemctl disable --now "$NAME" 2>/dev/null || true
  rm -f "$UNIT"
  systemctl daemon-reload
  echo "Xizmat olib tashlandi."
  exit 0
fi

DIR="$(cd "$(dirname "$0")/.." && pwd)"          # loyiha papkasi
RUN_USER="${SUDO_USER:-$(stat -c %U "$DIR")}"     # server shu foydalanuvchi nomidan ishlaydi (root emas)
NODE="$(sudo -u "$RUN_USER" bash -lc 'command -v node' || true)"
if [ -z "$NODE" ]; then echo "node topilmadi ($RUN_USER uchun). Node.js 20+ o'rnating."; exit 1; fi

cat > "$UNIT" <<EOF
[Unit]
Description=Do'kon boshqaruv (ko'p filialli savdo tizimi)
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$DIR
ExecStart=$NODE $DIR/server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
# Qo'shimcha sozlamalar loyiha papkasidagi .env faylidan o'qiladi (PORT, DATA_DIR, BACKUP_COPY_DIR ...)

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$NAME"
sleep 2
systemctl --no-pager --lines=5 status "$NAME" || true
echo
echo "Tayyor: server kompyuter yonganda o'zi ishga tushadi. Manzil: http://localhost:3000 (yoki .env dagi PORT)"
