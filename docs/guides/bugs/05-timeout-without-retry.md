# Bug 05: Missing Timeouts, Retries & Backoff on Upstream Failures

**Reproducing scenarios:** `timeout`, `network_drop`, `gateway_500`, `rate_limited`

## Failing Symptom

Without explicit `AbortSignal.timeout(...)` on `fetch()` calls, a hung SATIM/Chargily TCP socket stalls Node workers indefinitely under load (`timeout`), or a transient `500`/`429` crashes checkout instead of respecting `Retry-After` / backoff.

## Fix

1. Always configure an explicit request timeout (`AbortSignal.timeout(5000)`).
2. Catch `ECONNRESET` (`network_drop`), `5xx`, and `429` (honor `Retry-After`) with bounded exponential backoff + jitter for safe `GET`/idempotent calls.
3. Never blindly retry non-idempotent `POST /register.do` with the same order without checking order status first (`duplicate_order`).

## Reproduce Locally

```bash
npx dz-sandbox scenario set satim gateway_500
# Also test per-request override via header:
curl -H "X-Dz-Scenario: network_drop" http://127.0.0.1:4001/api/v2/checkouts
```
