#!/usr/bin/env bash
set -euo pipefail

# Terminal walkthrough of dz-sandbox v0.1.0:
# Starts the sandbox ephemerally, runs the express-checkout duplicate_webhook bug/fix demo,
# creates a Yalidine COD parcel to Algiers (16), and advances the virtual clock by 2h.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f packages/cli/dist/cli.js ]; then
  echo "Building workspace first..."
  npm run build
fi

export DZ_CONTROL_PORT="${DZ_CONTROL_PORT:-4100}"
export DZ_CHARGILY_PORT="${DZ_CHARGILY_PORT:-4101}"
export DZ_SATIM_PORT="${DZ_SATIM_PORT:-4102}"
export DZ_YALIDINE_PORT="${DZ_YALIDINE_PORT:-4103}"
export DZ_CONTROL_URL="http://127.0.0.1:${DZ_CONTROL_PORT}"
export CHARGILY_BASE_URL="http://127.0.0.1:${DZ_CHARGILY_PORT}/api/v2"
export SATIM_BASE_URL="http://127.0.0.1:${DZ_SATIM_PORT}/payment/rest"
export YALIDINE_BASE_URL="http://127.0.0.1:${DZ_YALIDINE_PORT}/v1"

echo "[1/4] Starting dz-sandbox on ports ${DZ_CONTROL_PORT}-${DZ_YALIDINE_PORT}..."
node packages/cli/dist/cli.js start >/tmp/dz-sandbox-demo.log 2>&1 &
SANDBOX_PID=$!
cleanup() {
  kill "$SANDBOX_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -fsS "${DZ_CONTROL_URL}/__control/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

echo "[2/4] Running Chargily duplicate_webhook bug-vs-fix + SATIM card walkthrough..."
npm run demo -w dz-sandbox-express-checkout-example

echo "[3/4] Creating Yalidine COD parcel with lifecycle_fast and advancing virtual clock by 2h..."
curl -fsS -X PUT "${DZ_CONTROL_URL}/__control/scenario/yalidine" \
  -H "Content-Type: application/json" \
  -d '{"scenario":"lifecycle_fast"}' >/dev/null

PARCEL_JSON="$(curl -fsS -X POST "${YALIDINE_BASE_URL}/parcels" \
  -H "Content-Type: application/json" \
  -H "X-API-ID: demo_id" -H "X-API-TOKEN: demo_token" \
  -d '[{"order_id":"ORD-DEMO-1","firstname":"Amine","familyname":"Kaci","contact_phone":"0550123456","address":"Didouche Mourad","to_commune_name":"Alger Centre","to_wilaya_id":16,"product_list":"Book","price":2500,"freeshipping":true,"is_stopdesk":false}]')"
echo "Created parcel response: ${PARCEL_JSON}"

echo "[4/4] Advancing virtual clock by 2 hours instantaneously..."
curl -fsS -X POST "${DZ_CONTROL_URL}/__control/clock/advance" \
  -H "Content-Type: application/json" \
  -d '{"duration":"2h"}'
echo ""
curl -fsS "${YALIDINE_BASE_URL}/parcels" \
  -H "X-API-ID: demo_id" -H "X-API-TOKEN: demo_token"
echo ""
echo "Demo complete!"
