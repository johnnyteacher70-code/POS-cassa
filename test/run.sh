#!/usr/bin/env bash
# To'liq test: vaqtinchalik papkalarda (asosiy ma'lumotlarga tegmaydi). Ishga tushirish: npm test
set -e
cd "$(dirname "$0")/.."
export TZ=Asia/Tashkent
TMP=$(mktemp -d); PORT=3999
FRESH=$(mktemp -d); FPORT=3998
SRV=; SRV2=
trap 'kill $SRV $SRV2 2>/dev/null; rm -rf "$TMP" "$FRESH"' EXIT

start() {   # start <data_dir> <port> — serverni ishga tushirib, tayyor bo'lishini kutadi
  DATA_DIR=$1 PORT=$2 TRIAL_BRANCHES=${TRIAL:-50} node server/index.js >> "$1/server.log" 2>&1 &
  LAST=$!
  for _ in $(seq 1 30); do curl -fs http://localhost:$2/healthz > /dev/null && return 0; sleep 0.5; done
  echo "Server ishga tushmadi:"; cat "$1/server.log"; exit 1
}

# 1. Infratuzilma: filial bazalarining ajratilishi
INFRA=$(mktemp -d); DATA_DIR=$INFRA node test/infra_test.js; rm -rf "$INFRA"
LIC=$(mktemp -d); DATA_DIR=$LIC node test/license_test.js; rm -rf "$LIC"
node test/restore_test.js "$PWD"

# 2. Asosiy server: egasi + A filiali (demo ma'lumotlar bilan)
start "$TMP" $PORT; SRV=$LAST
node test/bootstrap.js http://localhost:$PORT
DATA_DIR=$TMP node server/demo.js 1 > /dev/null
node test/api_test.js http://localhost:$PORT "$TMP" "$PWD"
node test/branches_test.js http://localhost:$PORT "$TMP" "$PWD"
node test/isolation_test.js http://localhost:$PORT "$PWD"
node test/consistency_check.js "$TMP" "$PWD"   # qayta ishga tushirishdan oldin: trigger va keshlar to'g'rimi

# 3. Qayta ishga tushirish: ma'lumotlar joyida
kill $SRV; wait $SRV 2>/dev/null || true
start "$TMP" $PORT; SRV=$LAST
node test/restart_check.js http://localhost:$PORT
node test/fixes_test.js http://localhost:$PORT "$TMP" "$PWD"
node test/roles_test.js http://localhost:$PORT "$TMP" "$PWD"
node test/products_test.js http://localhost:$PORT "$TMP" "$PWD"
node test/trade_test.js http://localhost:$PORT "$TMP" "$PWD"
node test/finance_test.js http://localhost:$PORT "$TMP" "$PWD"
node test/network_test.js http://localhost:$PORT "$TMP" "$PWD"
node test/hardware_test.js http://localhost:$PORT "$TMP" "$PWD"
node test/gaps_test.js http://localhost:$PORT "$TMP" "$PWD"
node test/consistency_check.js "$TMP" "$PWD"

# 4. Brauzer testi (Chrome o'rnatilgan bo'lsa); ikkinchi server — bo'sh bazada, birinchi sozlashdan boshlab
if command -v google-chrome >/dev/null || command -v chromium-browser >/dev/null; then
  start "$FRESH" $FPORT; SRV2=$LAST
  node test/ui_smoke.js http://localhost:$PORT http://localhost:$FPORT
fi
