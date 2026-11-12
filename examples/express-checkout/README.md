# Express Checkout Example (Chargily Pay v2 + SATIM + dz-sandbox)

Demonstrates two real-world integration failure modes caught completely offline:

1. **Chargily `duplicate_webhook` bug & idempotency fix**:
   - `POST /webhooks/chargily/naive` processes every `checkout.paid` event blindly → **`fulfillments: 2`** when Chargily retries/duplicates a webhook.
   - `POST /webhooks/chargily/idempotent` deduplicates by `event.id` and `order.status === 'paid'` → **`fulfillments: 1`**.
   - `POST /orders` accepts `{ handler: "naive" | "idempotent" }` (or set `IDEMPOTENT_WEBHOOKS=true` for `/webhooks/chargily`).
2. **SATIM redirect + confirm flow** (simulated — see `docs/SPEC_STATUS.md`): registers an order in centimes (`currency=012`), completes the fake-card hosted form, and calls `confirmOrder.do` on return.

## Prerequisites

- Node.js 20+
- Running `dz-sandbox` instance (from repo root: `npm run build && node packages/cli/dist/cli.js start`, or `npx dz-sandbox start`, or `docker compose up`)

## Run Interactive Server

```bash
# Terminal 1 (from repo root)
node packages/cli/dist/cli.js start

# Terminal 2
cd examples/express-checkout
npm install
npm start
```

## Non-Interactive Educational Demo (`naive` vs `idempotent`)

With `dz-sandbox` running:

```bash
cd examples/express-checkout
npm install
npm run demo
```

Expected output highlights:

```text
express-checkout demo OK: naive=2 fulfillments (bug caught), idempotent=1 (fixed), satim=1
```

## Try Failure Scenarios Manually

1. Switch Chargily to `duplicate_webhook`:
   ```bash
   curl -X PUT http://127.0.0.1:4000/__control/scenario/chargily -H "Content-Type: application/json" -d '{"scenario":"duplicate_webhook"}'
   ```
2. Observe double fulfillment with the naive handler:
   ```bash
   curl -s -X POST http://127.0.0.1:3100/orders -H "Content-Type: application/json" -d '{"amount":2500,"handler":"naive"}'
   # Visit checkout_url and click "Pay Now (Success)", then check GET http://127.0.0.1:3100/orders -> fulfillments: 2
   ```
3. Verify the fix with the idempotent handler:
   ```bash
   curl -s -X POST http://127.0.0.1:3100/orders -H "Content-Type: application/json" -d '{"amount":2500,"handler":"idempotent"}'
   # Visit checkout_url and click "Pay Now (Success)", then check GET http://127.0.0.1:3100/orders -> fulfillments: 1
   ```
