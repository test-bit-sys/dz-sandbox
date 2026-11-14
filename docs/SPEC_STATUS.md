# Specification Status & Honesty Ledger (`SPEC_STATUS.md`)

This document is the single source of truth for what is **verified** against official provider documentation/fixtures versus what is **partial** or **unverified** (implemented from public developer references or reasonable structure pending official merchant documentation/fixtures).

> **Rule:** Never treat an `unverified` entry as guaranteed production behavior. Always test against each provider's official sandbox before going live.

## Status Legend

- **Verified**: Confirmed against official documentation or user-supplied recorded fixtures.
- **Partial**: Core flow/endpoints confirmed via public docs/SDKs, while exact optional fields, edge error payloads, or response codes require official fixture verification.
- **Unverified**: Structure implemented behind a configurable spec file (`*.spec.ts`) based on common industry patterns; requires official merchant documentation or live sandbox captures.

---

## 1. Chargily Pay v2 (`mock-chargily`)

Config file: `packages/mock-chargily/src/chargily.spec.ts`  
Official reference: `https://dev.chargily.com/pay-v2/` and `@chargily/chargily-pay@2.1.0` npm package (`lib/classes/client.js`, `lib/types/data.d.ts`, `lib/utils/index.js`).

| Endpoint / Feature | Implemented | Status | Source / Notes |
| --- | --- | --- | --- |
| Auth (`Authorization: Bearer <secret>`) | Yes | Verified | Confirmed in `@chargily/chargily-pay@2.1.0` (`Authorization: Bearer ...`) |
| `GET /api/v2/balance` | Yes | Verified | `Balance` / `Wallet` shape verified in `lib/types/data.d.ts`; exact 401/error JSON envelope unverified |
| `POST/GET/PATCH/DELETE /api/v2/customers` | Yes | Verified | Endpoints & `Customer` / `ListResponse` / `DeleteItemResponse` verified in `@chargily/chargily-pay@2.1.0` |
| `POST/GET/POST(update)/DELETE /api/v2/products` & `/prices` | Yes | Verified | Endpoints & `Product` / `ProductPrice` shapes verified in `@chargily/chargily-pay@2.1.0` |
| `POST/GET/POST(update) /api/v2/prices` | Yes | Verified | Endpoints & `Price` shape verified in `@chargily/chargily-pay@2.1.0` |
| `POST/GET/POST(expire) /api/v2/checkouts` & `/items` | Yes | Verified | Endpoints & `Checkout` / `CheckoutItem` shapes verified in `@chargily/chargily-pay@2.1.0`; fee formula simulated in `chargily.spec.ts` |
| `POST/GET/POST(update) /api/v2/payment-links` & `/items` | Yes | Verified | Endpoints & `PaymentLink` / `PaymentLinkItem` shapes verified in `@chargily/chargily-pay@2.1.0` |
| Webhook signature (`signature` header, HMAC-SHA256 hex of raw JSON body using secret key) | Yes | Verified | Exact `verifySignature()` algorithm confirmed in `@chargily/chargily-pay@2.1.0` `lib/utils/index.js`; webhook event names (`checkout.paid`, `checkout.failed`, `checkout.canceled`) partial/configurable in `chargily.spec.ts` |

## 2. SATIM E-Payment (`mock-satim`)

Config file: `packages/mock-satim/src/satim.spec.ts`  
Official reference: SATIM / GIE Monétique Merchant Technical Integration Guide (distributed privately by acquiring banks).

| Endpoint / Feature | Implemented | Status | Source / Notes |
| --- | --- | --- | --- |
| `GET/POST register.do` | Yes | Unverified | Public references cite `userName`, `password`, `orderNumber`, `amount` (centimes), `currency` (`012`), `returnUrl`, `failUrl`, `language`, `jsonParams`. Exact bank-specific path prefix and required `jsonParams` must be checked against SATIM guide |
| Hosted payment page (`formUrl` redirect) | Yes | Unverified | Simulated local HTML form with fake test card numbers (`4000000000000001`..`05`); real SATIM/3DS UI differs |
| `GET/POST confirmOrder.do` / `getOrderStatusExtended.do` / `acknowledgeTransaction.do` | Yes | Unverified | Endpoint name varies by SATIM integration version (`acknowledgeTransaction.do` vs `confirmOrder.do` vs `getOrderStatusExtended.do`). Configurable in `satim.spec.ts` |
| `GET/POST refund.do` | Yes | Unverified | Parameters `userName`, `password`, `orderId`, `amount`; exact partial refund rules & error codes need official SATIM guide |
| `errorCode`, `actionCode`, `orderStatus`, `respCode` tables | Yes | Unverified | Common SmartVista/SATIM codes (`orderStatus`: 0,1,2,3,4,6; `errorCode`: 0,1,3,4,5,6,7; `actionCode`: 0). Full bank-specific `actionCode` & `respCode` mappings must be verified from official SATIM PDF |

## 3. Yalidine Express (`mock-yalidine`)

Config file: `packages/mock-yalidine/src/yalidine.spec.ts`  
Official reference: `https://api.yalidine.app/v1/` (Yalidine Merchant Developer Docs).

| Endpoint / Feature | Implemented | Status | Source / Notes |
| --- | --- | --- | --- |
| Auth (`X-API-ID`, `X-API-TOKEN`) | Yes | Partial | Public docs; exact 401/403 & 429 rate-limit headers (`Retry-After` / `X-RateLimit-*`) unverified |
| `GET /v1/wilayas` | Yes | Partial | All 69 wilayas (eras 48/58/69) with AR/FR/EN names imported via `scripts/import-geo.mjs` from user-supplied `algeria-geo`; exact Yalidine pagination/field envelope remains partial until live capture |
| `GET /v1/communes` | Yes | Partial | All 1,541 communes with AR/FR/EN names & post codes imported via `scripts/import-geo.mjs` from user-supplied `algeria-geo` (coordinates excluded); exact Yalidine field envelope remains partial until live capture |
| `GET /v1/centers` | Yes | Unverified | 9 stopdesk centers mapped to the 8 core wilayas; exact center IDs & fields need official response fixture |
| `GET /v1/deliveryfees` | Yes | Partial | Query `from_wilaya_id`, `to_wilaya_id`, `wilaya_id`; exact per-commune fee breakdown (`retour_fee`, `cod_percentage`, `oversize_fee`) unverified |
| `POST/GET/PATCH/DELETE /v1/parcels` | Yes | Partial | Public docs (bulk array or object create, tracking IDs `yal-XXXXXX`, `is_stopdesk`, `stopdesk_id`, `price`, `freeshipping`); exact validation errors & PATCH rules unverified |
| `GET /v1/histories` | Yes | Unverified | Virtual-clock driven history log (`tracking`, `status`, `status_id`, `reason`, `center_name`, `date`); exact query filters & response envelope unverified |
| Webhooks (parcel status updates) | Yes | Unverified | Unconfirmed whether Yalidine v1 pushes webhooks natively or relies on polling `histories`; simulated behind opt-in `webhook_url` / `DZ_YALIDINE_WEBHOOK_URL` |

---

## 3b. ZR Express & Maystro Delivery (Scaffolds — Unverified)

Config files:
- `packages/mock-zrexpress/src/zrexpress.spec.ts`
- `packages/mock-maystro/src/maystro.spec.ts`

| Endpoint / Feature | Implemented | Status | Source / Notes |
| --- | --- | --- | --- |
| `GET /health` + scenario fault middleware | Yes | Verified (internal) | Returns `{ status: 'ok', scaffold: true, verified: false }` |
| Provider parcel/pickup/tracking endpoints | **No** (returns `501 NOT_IMPLEMENTED_AWAITING_SPEC`) | Unverified (Scaffold) | Intentionally unimplemented until official API docs or sanitized captures (`fixtures/{zrexpress,maystro}/captured/`) are provided. Zero endpoints or field names were fabricated |

---

## 3c. BaridiMob Mobile Banking (`mock-baridimob`)

Config file: `packages/mock-baridimob/src/baridimob.spec.ts`  
Official reference: Algérie Poste BaridiMob Mobile Banking reverse-engineered / open-source SDK contract (`baridimob` client library). Default port: `4004`. Base path: `/mobilebank/service` (also mounted at root `/` for convenience).

> **Architectural Note:** BaridiMob is an **Account-Holder Mobile Banking API** (personal account access, RIP transfers, bill payments), **not** a Merchant Payment Gateway (like Chargily Pay or SATIM). It should never be integrated as a direct checkout payment method on an e-commerce store.

| Endpoint / Feature | Implemented | Status | Source / Notes |
| --- | --- | --- | --- |
| Device Auth & Signature (`devid`, `sign`, `timestamp`) | Yes | Partial | Client signatures validated; simulation accepts standard sha256 or test signatures |
| `POST /login` | Yes | Partial | Supports standard credentials (`username`, `password`), returning numeric `result` code (0 = success, 103 = invalid, 104 = locked, 107 = device confirm required) |
| `POST /deviceConfirm` | Yes | Partial | Validates SMS OTP code (`123456` by default) with result codes (109 = invalid, 110 = expired, 111 = max attempts) |
| `POST /accounts` | Yes | Partial | Returns seed accounts (`00799999000000000001`) with balance, currency (`DZD`), and status |
| `POST /cards` | Yes | Partial | Returns seed Edahabia card details (`card_edahabia_01`, masked number, status) |
| `POST /transferCheck` & `POST /transferExec` | Yes | Partial | RIP-to-RIP internal funds transfers with balance check and transaction history updates |
| `POST /history` | Yes | Partial | Virtual-clock driven transaction history of transfers and payments |
| `POST /paymentCategories`, `/paymentProviders`, `/paymentPerform` | Yes | Partial | Utility/bill payments (Sonelgaz, ADE, Mobilis, Djezzy, Ooredoo) |

---

## 4. Docs & Fixtures Needed From Maintainer

To upgrade entries from `Unverified` / `Partial` to `Verified`, please provide:

1. **Chargily Pay v2:**
   - Recorded JSON request/response fixtures from `https://pay.chargily.net/test/api/v2` for `checkouts`, `customers`, `products`, `prices`, `payment-links`, `balance`, and a real `checkout.paid` / `checkout.failed` webhook payload + headers.
2. **SATIM:**
   - Official SATIM / Acquiring Bank Technical Integration Guide (PDF or endpoint/parameter summary): exact endpoint path (`/register.do` vs `/registerPreAuth.do`, `confirmOrder.do` vs `acknowledgeTransaction.do`), mandatory `jsonParams` (`force_terminal_id`, `udf1`), full `errorCode` / `actionCode` / `respCode` tables, and test card numbers.
3. **Yalidine:**
   - Official Yalidine API v1 docs or recorded JSON responses for `/v1/parcels` (create, get, patch, delete), `/v1/histories`, `/v1/centers`, `/v1/deliveryfees`, and rate-limit headers.
   - Clarification on whether Yalidine provides webhook callbacks in v1.
4. **Algeria Geo Dataset (`algeria-geo`):**
   - Administrative wilayas (69) and communes (1,541) from user-supplied `algeria-geo` are now integrated via `scripts/import-geo.mjs`. Official Yalidine per-commune `has_stop_desk`, delivery zone tiers, and `/v1/centers` IDs still require captured Yalidine API v1 responses.
5. **ZR Express & Maystro Delivery:**
   - Official merchant API documentation or sanitized captured exchanges (`fixtures/zrexpress/captured/`, `fixtures/maystro/captured/`) showing auth headers, base URL/endpoints, parcel creation fields, status enums, and error envelopes before implementing routes beyond `501 NOT_IMPLEMENTED_AWAITING_SPEC`.
