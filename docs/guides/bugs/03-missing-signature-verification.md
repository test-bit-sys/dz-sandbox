# Bug 03: Missing HMAC Signature Verification on Webhooks

**Reproducing scenario:** `webhook_bad_signature`

## Failing Symptom

Anyone who discovers your `/webhooks/chargily` URL can `curl -X POST` a fake `checkout.paid` payload and ship free goods unless you verify the HMAC-SHA256 `signature` header over the **raw** request body using `crypto.timingSafeEqual`.

## Fix

Capture raw bytes *before* `JSON.parse()`, compute `HMAC-SHA256(secretKey, rawBody)`, and compare in constant time (`verifySignature` from `@chargily/chargily-pay`):

```ts
if (!verifySignature(req.rawBody, req.headers['signature'], CHARGILY_SECRET)) {
  return res.status(401).json({ error: 'Invalid webhook signature' });
}
```

## Reproduce Locally

```bash
npx dz-sandbox scenario set chargily webhook_bad_signature
```

Expect your endpoint to return **HTTP 401/403** and refuse fulfillment.
