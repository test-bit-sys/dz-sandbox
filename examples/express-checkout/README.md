# Express Checkout Example (Chargily Pay v2 + dz-sandbox)

Demonstrates how `duplicate_webhook` exposes missing idempotency in an Express webhook handler.

## Run

1. Start `dz-sandbox` (`npx dz-sandbox start`).
2. `cd examples/express-checkout && npm install && npm start`
3. Create an order (`POST http://127.0.0.1:3100/orders`), switch scenario to `duplicate_webhook`, complete the hosted checkout URL, and inspect `GET http://127.0.0.1:3100/orders`:
   - With `IDEMPOTENT_WEBHOOKS=false` (default): `fulfillments` increments to `2` (bug reproduced!).
   - With `IDEMPOTENT_WEBHOOKS=true`: `fulfillments` stays `1`.
