# Scenario Catalog (`dz-sandbox`)

Every scenario controls how mocks respond **deterministically**, without merchant accounts or random flakes.

## Scenario Resolution Precedence

1. **`X-DZ-Scenario: <name>`** HTTP header on a single request (highest priority)
2. **Per-resource binding** (`PUT /__control/scenario/{provider}/{resourceId}`)
3. **Sequence step** (`PUT /__control/scenario/{provider}` with `sequence: [...]` — e.g. `gateway_500` first, `success` second)
4. **Provider default** (`PUT /__control/scenario/{provider}`)
5. **Fallback** (`created_ok` for `yalidine`, `success` otherwise)

---

## Payment & Network Scenarios

| Name | Behavior | Real-World Failure Tested |
| --- | --- | --- |
| `success` | Payment completes cleanly; signed webhook sent once (Chargily) | Happy path baseline |
| `declined` | Issuer declines card/payment (`errorCode` / failure redirect + `checkout.failed`) | Graceful failure UI, avoid marking order paid |
| `insufficient_funds` | Insufficient balance rejection | Clear customer error messaging |
| `expired_card` | Expired card rejection | Card expiry validation & retry flow |
| `user_cancelled` | Customer aborts on hosted checkout page (`checkout.canceled` / SATIM failUrl) | Unblocking reserved stock when abandoned |
| `timeout` | Holds socket open for `DZ_TIMEOUT_MS` (default `30000ms`) then returns `504` | HTTP client timeout + circuit breaker behavior |
| `slow` | Adds `1500ms` latency before normal response | Frontend spinners & non-blocking checkout handlers |
| `gateway_500` | Returns HTTP `500` `GATEWAY_ERROR` immediately | Retry logic without duplicate order creation |
| `network_drop` | Destroys TCP socket mid-flight before HTTP headers | ECONNRESET / undelivered response recovery |
| `duplicate_webhook` | Payment succeeds and delivers the identical webhook twice | **Idempotency** — prevents double fulfillment / double shipping |
| `delayed_webhook` | Schedules webhook `30s` ahead on `VirtualClock` | Handling redirect-before-webhook race (`pending` UI state) |
| `out_of_order_webhooks` | Emits multi-step webhooks in reverse chronological order | State machine rejecting stale transitions |
| `webhook_bad_signature` | Delivers webhook with tampered HMAC-SHA256 `signature` header | Rejecting spoofed webhooks with HTTP `401`/`403` |
| `webhook_never_sent` | Payment succeeds on gateway, zero webhooks emitted | Polling / manual confirmation (`confirmOrder.do` / `GET /checkouts/:id`) fallback |
| `double_charge_attempt` | Rejects second charge/confirm with HTTP `409` `ALREADY_PAID` | Double-submit protection on checkout |
| `partial_refund` | SATIM `refund.do` refunds partial amount instead of full deposit | Reconciliation of partially refunded balances |
| `refund_failure` | SATIM `refund.do` fails with HTTP `422` `REFUND_REJECTED` | Admin refund error surfaced cleanly instead of silent failure |
| `rate_limited` | Returns HTTP `429` with `Retry-After: 5` and `X-RateLimit-Remaining: 0` | Exponential backoff honoring `Retry-After` |
| `auth_failed` | Forces HTTP `401` `UNAUTHORIZED` | Surfacing rotated/invalid key alerts early |

---

## Delivery Scenarios (`mock-yalidine`)

| Name | Behavior | Real-World Failure Tested |
| --- | --- | --- |
| `created_ok` | Creates COD parcel cleanly (`yal-XXXXXX`), valid wilaya/commune/phone checks run | Happy path baseline |
| `invalid_wilaya` | Rejects parcel creation with HTTP `422` `INVALID_WILAYA` | Catching bad wilaya codes/names before order confirmation |
| `invalid_commune` | Rejects parcel with HTTP `422` `INVALID_COMMUNE` | Preventing mismatched wilaya <-> commune pairs |
| `phone_rejected` | Rejects phone failing `05/06/07` 10-digit format check with HTTP `422` | Form validation before courier submission |
| `lifecycle_fast` | Schedules `Préparation` -> `Expédié` -> `En livraison` -> `Livré` at `+1m`, `+3m`, `+5m` on `VirtualClock` | Testing full delivery tracking via `clock/advance` in milliseconds |
| `returned_to_sender` | Schedules failed attempt -> `Retourné au vendeur` at `+4m` on `VirtualClock` | Restocking inventory + COD cancellation when buyer refuses |
| `delivery_failed_retry` | First attempt `Tentative échouée`, second attempt `Livré` | Handling intermediate failure statuses before final delivery |
| `status_stuck` | Leaves parcel stuck in preparation indefinitely | Alerting operations on stale shipments |

---

## Mobile Banking Scenarios (`mock-baridimob`)

| Name | Behavior | Real-World Failure Tested |
| --- | --- | --- |
| `invalid_otp` | Returns result `109` (invalid OTP) on device confirmation | Incorrect SMS verification code handling |
| `expired_otp` | Returns result `110` (expired OTP) on device confirmation | Expired SMS verification code and resend flow |
| `too_many_attempts` | Returns result `111` (too many failed attempts) | Rate-limiting & brute-force lockdown UI |
| `account_locked` | Returns result `104` (account locked) on login | Account suspension error handling |
| `session_expired` | Returns result `143` (session expired) on protected endpoints | Token refresh / re-login redirection |
| `device_confirm_required` | Forces login to return result `107` (device confirmation required) | Triggering 2FA / device pairing flow |
| `insufficient_funds` | Rejects transfer with result `115` (insufficient balance) | Handling transfer balance check rejections |

---

## Custom Scenarios (YAML / JSON Hot-Reload)

Drop `.yaml` or `.json` files in `./scenarios` (or set `DZ_SCENARIOS_DIR`):

```yaml
scenarios:
  - name: chargily_slow_duplicate
    provider: chargily
    category: payment
    description: Slow 350ms checkout + 2 duplicate paid webhooks.
    behavior:
      outcome: success
      latencyMs: 350
      webhook:
        count: 2
        delayMs: 50
```

Files are validated with Zod (`ScenarioDefinitionSchema`) on load and reloaded automatically when edited.
