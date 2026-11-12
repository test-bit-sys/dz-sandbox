# Bug 07: Double Charge / 409 Conflict on Browser Refresh or Double-Submit

**Reproducing scenario:** `double_charge_attempt` (Chargily Pay v2 & SATIM)

## Failing Symptom

When a shopper double-clicks "Pay" or hits Back -> Refresh on a hosted payment page after `PAID`, re-submitting `POST /pay/.../action` or re-calling `register.do` with a reused `orderNumber` fails with `409` or creates a second order/charge.

## Fix

1. On payment confirmation UI, disable submit after the first click and query current checkout/order state before starting another session.
2. Bind one unique `orderNumber` / idempotency key per payment attempt; treat HTTP `409 CHECKOUT_CONFLICT` cleanly by fetching current order status (`confirmOrder.do` / `GET /checkouts/:id`) and redirecting to the final receipt page.

## Reproduce Locally

```bash
npx dz-sandbox scenario set satim double_charge_attempt
npx dz-sandbox scenario set chargily double_charge_attempt
```
