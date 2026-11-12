# Bug 04: Non-Idempotent Fulfillment Across Redirect + Webhook Race

**Reproducing scenarios:** `delayed_webhook`, `duplicate_webhook`

## Failing Symptom

Users return to `success_url` immediately (where your backend polls `GET /checkouts/:id` or `confirmOrder.do`), while `delayed_webhook` arrives 60 seconds later (or concurrently in two workers). Without an order-level lock/idempotency flag, two Yalidine parcels get created for a single payment!

## Fix

Separate **payment confirmation** from **parcel dispatch** behind a unique `order.shipment_dispatched_at` / transactional status check:

```ts
const claimed = await db.markOrderForShippingOnce(orderId); // UPDATE orders SET state='shipping' WHERE id=? AND state='awaiting_payment'
if (claimed) await yalidineClient.createParcel(...);
```

## Reproduce Locally

```bash
npx dz-sandbox scenario set chargily delayed_webhook
# Complete checkout, hit redirect handler, then advance clock:
curl -X POST http://127.0.0.1:4000/__control/clock/advance -d '{"duration":"2m"}'
```
