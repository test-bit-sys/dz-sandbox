# Provider Fixture Capture & Redaction Guide

`fixtures/*/captured/` is intentionally empty until contributors capture real responses from provider sandboxes/accounts. `dz-sandbox` never invents `verified: true` fixtures. Once you capture real HTTP transcripts (using the built-in `dz-sandbox record` proxy or `scripts/redact-fixture.mjs`), validate them with `dz-sandbox fixtures validate` before opening a PR so we can add them as contract tests and promote matching entries in [`docs/SPEC_STATUS.md`](SPEC_STATUS.md) with your capture date and source.

---

## Built-in Record & Replay Workflow (`dz-sandbox record` / `replay`)

The fastest safe way to capture real sandbox transcripts is the built-in local recording proxy (`127.0.0.1` only):

```bash
# 1. Start the recording proxy against Chargily Test Mode (redaction ON by default)
npx dz-sandbox record --provider chargily --upstream https://pay.chargily.net/test/api/v2 --out ./fixtures/chargily/captured --port 4100

# 2. Point your test script or curl at http://127.0.0.1:4100 instead of the upstream URL
curl -sS -X POST http://127.0.0.1:4100/customers \
  -H "Authorization: Bearer $CHARGILY_TEST_SK" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"real@merchant.dz","phone":"+213551234567"}'

# 3. Validate all saved fixtures (fails on unredacted secrets, Bearer tokens, cards, phone numbers, or real emails)
npx dz-sandbox fixtures validate ./fixtures

# 4. Replay captured fixtures offline later (with optional scenario fault injection)
npx dz-sandbox replay --provider chargily --fixtures ./fixtures/chargily/captured --port 4101
```

### Mandatory Safety Controls
- **Redaction is ON by default.** `Authorization`, `Cookie`, `Set-Cookie`, `X-API-ID`, `X-API-TOKEN`, query/body `password`/`userName`/`secret`, bearer tokens, JWTs, Algerian mobile numbers, emails, person names, street addresses, and card-like 13–19 digit sequences are automatically replaced with deterministic `<REDACTED_*>` placeholders.
- **Response headers use a strict allowlist** (`content-type`, `retry-after`, `x-ratelimit-*`, `x-request-id`, `x-correlation-id`, `cache-control`, `signature`) — upstream `Set-Cookie` and proxy headers are never persisted.
- `--no-redact` requires an explicit `--confirm-unredacted` flag, prints a loud warning, and **refuses to write anywhere under `fixtures/`**.
- `upstream` URLs pointing to private/metadata IP ranges (e.g. `169.254.169.254`, `10.x`, `192.168.x`) are blocked by SSRF policy.

---

## Global Redaction Rules (Mandatory Before Sharing or Committing)

Never share or commit any of the following in a fixture, PR, or issue:

- Real API keys / bearer secrets (`live_sk_*`, `test_sk_*`, `Authorization` headers)
- Yalidine `X-API-ID` and `X-API-TOKEN` values
- SATIM merchant `userName` and `password`
- Real card numbers (PAN), expiry dates, CVV/CVC, Edahabia OTP codes, or RIB/RIP/CCP numbers
- Real customer names, street addresses, email addresses, or phone numbers

Always run the repository redaction script on any captured JSON before opening a PR:

```bash
node scripts/redact-fixture.mjs raw-capture.json fixtures/<provider>/captured/<name>.json
```

Inspect the resulting file manually afterwards to verify no custom header, webhook URL secret token, or note leaks PII or credentials.

---

## 1. Chargily Pay v2 (`fixtures/chargily/captured/`)

**Account required:** Free Chargily Pay Test Mode dashboard account (`https://pay.chargily.net/test/api/v2`).

### What to capture

| Scenario / Step | Method | Endpoint | Redact |
| --- | --- | --- | --- |
| Create Customer | `POST` | `/test/api/v2/customers` | `Authorization`, `email`, `phone`, real address |
| Create Product | `POST` | `/test/api/v2/products` | `Authorization` |
| Create Price | `POST` | `/test/api/v2/prices` | `Authorization` |
| Create Checkout (`edahabia` / `cib`) | `POST` | `/test/api/v2/checkouts` | `Authorization`, real `webhook_endpoint` tokens |
| Fetch Checkout (paid & failed states) | `GET` | `/test/api/v2/checkouts/:id` | `Authorization` |
| Validation error (`422`) | `POST` | `/test/api/v2/checkouts` (invalid body) | `Authorization` |
| Webhook `checkout.paid` + `checkout.failed` + `checkout.canceled` | `POST` (incoming) | Your `webhook_endpoint` | Keep `signature` format metadata only; redact raw secret key and test customer PII |

### Copy-paste capture steps (Chargily Test Mode)

```bash
export CHARGILY_TEST_SK="test_sk_YOUR_TEST_KEY"

# 1. Create product
curl -sS -X POST https://pay.chargily.net/test/api/v2/products \
  -H "Authorization: Bearer $CHARGILY_TEST_SK" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sandbox Test Product"}' | tee raw-product.json

# 2. Create price (replace prod_xxx from step 1)
curl -sS -X POST https://pay.chargily.net/test/api/v2/prices \
  -H "Authorization: Bearer $CHARGILY_TEST_SK" \
  -H "Content-Type: application/json" \
  -d '{"amount":1000,"currency":"dzd","product_id":"prod_xxx"}' | tee raw-price.json

# 3. Create checkout (replace price_xxx and your HTTPS webhook tunnel)
curl -sS -X POST https://pay.chargily.net/test/api/v2/checkouts \
  -H "Authorization: Bearer $CHARGILY_TEST_SK" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"price":"price_xxx","quantity":1}],"success_url":"https://example.com/ok","webhook_endpoint":"https://your-tunnel.example/hook"}' \
  | tee raw-checkout.json

# 4. Complete test checkout in browser, capture incoming webhook JSON as raw-webhook.json,
# then sanitize all captured transcripts:
node scripts/redact-fixture.mjs raw-checkout.json fixtures/chargily/captured/checkout-create.json
```

---

## 2. Yalidine API v1 (`fixtures/yalidine/captured/`)

**Account required:** Merchant account with Yalidine API credentials (`https://api.yalidine.app/v1`).

> [!WARNING]
> Only capture from non-production test parcels that you immediately cancel if created on a live merchant account, and NEVER commit real buyer phones, addresses, or `X-API-TOKEN`.

### What to capture

| Scenario / Step | Method | Endpoint | Redact |
| --- | --- | --- | --- |
| List Wilayas (`GET`) | `GET` | `/v1/wilayas` | `X-API-ID`, `X-API-TOKEN` |
| List Communes (`GET`) | `GET` | `/v1/communes?wilaya_id=16` | `X-API-ID`, `X-API-TOKEN` |
| Calculate Fees (`GET`) | `GET` | `/v1/fees?from_wilaya_id=16&to_wilaya_id=31` | `X-API-ID`, `X-API-TOKEN` |
| Create Parcel (`200/201`) | `POST` | `/v1/parcels` | `X-API-ID`, `X-API-TOKEN`, `firstname`, `familyname`, `contact_phone`, `address` |
| Parcel Validation Error (`invalid_wilaya` / `phone_rejected`) | `POST` | `/v1/parcels` (bad phone / bad commune) | `X-API-ID`, `X-API-TOKEN` |
| Parcel Histories (`GET`) | `GET` | `/v1/histories?tracking=...` | `X-API-ID`, `X-API-TOKEN` |
| Rate-Limit headers (`429`) | Any | Any endpoint when `X-Day-Quota-Left` exhausted | `X-API-ID`, `X-API-TOKEN` |

### Copy-paste capture steps

```bash
export YAL_ID="YOUR_API_ID"
export YAL_TOK="YOUR_API_TOKEN"

curl -sS "https://api.yalidine.app/v1/fees?from_wilaya_id=16&to_wilaya_id=31" \
  -H "X-API-ID: $YAL_ID" \
  -H "X-API-TOKEN: $YAL_TOK" | tee raw-fees.json

node scripts/redact-fixture.mjs raw-fees.json fixtures/yalidine/captured/fees-16-to-31.json
```

---

## 3. SATIM E-Payment (`fixtures/satim/captured/`)

**Account required:** Bank/SATIM merchant integration test credentials (`register.do`, `confirmOrder.do` / `ackOrder.do`, `refund.do`). Note: `docs/SPEC_STATUS.md` currently marks all SATIM paths, field types (`errorCode` int vs string, query vs form encoding, field names in `confirmOrder.do`), and error codes as **`unverified`**.

### What to capture

| Scenario / Step | Method | Endpoint | Redact |
| --- | --- | --- | --- |
| Register Order | `GET` or `POST` | `/payment/rest/register.do` | `userName`, `password` |
| Hosted Form Failure / Decline return params | `GET` | Redirect query to `returnUrl` / `failUrl` | Session/order merchant PII |
| Acknowledge / Confirm Order | `GET` or `POST` | `confirmOrder.do` / exact documented ack path | `userName`, `password`, masked cardholder/PAN metadata (`approvalCode`, `pan` masked) |
| Partial / Full Refund (`refund.do`) | `GET` or `POST` | `/payment/rest/refund.do` | `userName`, `password` |
| Duplicate Order / Invalid Amount error response | `GET` or `POST` | `/payment/rest/register.do` | `userName`, `password` |

### Copy-paste capture template

```bash
# Replace URL with the exact SATIM test gateway URL provided in your bank integration kit
curl -sS "https://SATIM_TEST_HOST/payment/rest/register.do?userName=XXX&password=YYY&orderNumber=TEST001&amount=10000&currency=012&returnUrl=https://example.com/ok&language=fr" \
  | tee raw-satim-register.json

# Strip merchant credentials, PAN fragments, and tokens BEFORE saving:
node scripts/redact-fixture.mjs raw-satim-register.json fixtures/satim/captured/register-ok.json
```

> [!IMPORTANT]
> Never record HTTP requests while entering a real debit/CIB/Edahabia card on production SATIM. Only capture using bank-issued SATIM test cards on the SATIM UAT/integration environment, and scrub any masked PAN (`****`), `approvalCode`, IP address, or merchant credential from the JSON before committing.

---

## 4. ZR Express & Maystro Delivery (`fixtures/zrexpress/captured/` & `fixtures/maystro/captured/`)

Both `@dz-sandbox/mock-zrexpress` and `@dz-sandbox/mock-maystro` are currently **honest scaffolds** returning `501 NOT_IMPLEMENTED_AWAITING_SPEC` because zero official API specs or sanitized captures exist in the repository.

When merchant credentials and official API base URLs are available:

1. Point `dz-sandbox record` at the official upstream sandbox/integration URL:
   ```bash
   npx dz-sandbox record --provider zrexpress --upstream https://YOUR_ZREXPRESS_API_URL --out ./fixtures/zrexpress/captured
   npx dz-sandbox record --provider maystro   --upstream https://YOUR_MAYSTRO_API_URL   --out ./fixtures/maystro/captured
   ```
2. Capture at minimum:
   - Authentication headers & unauthenticated `401` error response
   - Parcel creation (`POST`) + validation failure (`400`/`422`)
   - Parcel status / tracking lookup (`GET`) and cancellation/deletion
   - Shipping fees / wilaya/commune lookup (if offered)
3. Run `npx dz-sandbox fixtures validate ./fixtures`, manually confirm zero recipient phone numbers, addresses, or API tokens remain, and open a PR referencing [`docs/SPEC_STATUS.md`](SPEC_STATUS.md).
