# Bug 02: Out-of-Order Webhooks Corrupting Order State

**Reproducing scenario:** `out_of_order_webhooks`

## Failing Symptom

Under retries or parallel workers, an earlier `checkout.created` or `checkout.failed` retry arrives **after** a `checkout.paid` webhook has already been processed. Naive status overwrites regress a paid order back to `pending` or `failed`.

## Fix

Enforce a monotonic state machine (`pending -> paid | failed | canceled | expired`). Reject/ignore transitions from terminal states (`paid`):

```ts
const ORDER_TERMINAL = new Set(['paid', 'refunded']);
if (ORDER_TERMINAL.has(order.status)) {
  return res.status(200).json({ ignored: true });
}
```

## Reproduce Locally

```bash
npx dz-sandbox scenario set chargily out_of_order_webhooks
```
