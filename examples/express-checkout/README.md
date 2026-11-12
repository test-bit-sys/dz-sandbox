# Express Checkout Example (Chargily Pay v2 + SATIM + dz-sandbox)

Demonstrates two real-world integration bugs caught offline:

1. **Chargily `duplicate_webhook`**: exposes missing idempotency in a webhook handler (`IDEMPOTENT_WEBHOOKS=false` increments fulfillment twice; `IDEMPOTENT_WEBHOOKS=true` deduplicates).
2. **SATIM redirect + confirm flow** (simulated — see `docs/SPEC_STATUS.md`): registers an order in centimes (`currency=012`), redirects to the fake-card hosted form, and calls `confirmOrder.do` on return.

## Run

1. Start `dz-sandbox` (`npx dz-sandbox start`).
2. `cd examples/express-checkout && npm install && npm start`
3. Chargily flow: create an order via `POST http://127.0.0.1:3100/orders`, enable `duplicate_webhook`, complete the hosted checkout URL, and inspect `GET http://127.0.0.1:3100/orders`.
4. SATIM flow: create an order via `POST http://127.0.0.1:3100/satim/orders` and open `formUrl` using fake test card `4000000000000001`.
