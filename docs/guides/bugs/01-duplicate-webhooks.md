# Bug 01: Duplicate Webhooks Causing Double Fulfillment

**Reproducing scenario:** `duplicate_webhook` (Chargily Pay v2)

## Failing Symptom

Payment webhooks are **at-least-once** delivery. When your server takes >2s to respond or a network hiccup drops the ACK, the gateway retries the exact same event payload (`evt_...`, `data.id`).

```ts
// BUGGY HANDLER: trusts every incoming POST as brand-new payment
app.post('/webhooks/chargily', async (req, res) => {
  await fulfillOrder(req.body.data.id); // Called TWICE under duplicate_webhook!
  res.sendStatus(200);
});
```

## Fix

Persist processed event IDs (or transition order state atomically `WHERE status = 'pending'`) inside a database transaction:

```ts
const inserted = await db.insertProcessedEvent(req.body.id); // UNIQUE constraint
if (!inserted) return res.sendStatus(200); // Acknowledge idempotently without re-fulfilling
await fulfillOrder(req.body.data.id);
```

## Reproduce Locally

```bash
npx dz-sandbox scenario set chargily duplicate_webhook
npm run examples:smoke # See examples/express-checkout output: naive=2, idempotent=1
```
