# Common Integration Bugs in Algerian Payments & Delivery

> **Slogan:** *Test what fails, not just what succeeds.*

Integrating Chargily Pay v2, SATIM, and Yalidine often passes manual "happy path" QA on staging, then fails silently or loses money in production under retries, browser refreshes, unit mixups, or bad wilaya data. Below are 9 recurring production bugs — each linked to an exact `dz-sandbox` scenario that reproduces it offline.

| # | Bug Guide | Symptom in Production | Reproducing Scenario(s) |
| --- | --- | --- | --- |
| 1 | [Duplicate Webhooks](./bugs/01-duplicate-webhooks.md) | Customer billed once, order fulfilled or wallet credited twice | `duplicate_webhook` |
| 2 | [Out-of-Order Webhooks](./bugs/02-out-of-order-webhooks.md) | `canceled` / older event overwrites a newer `paid` order | `out_of_order_webhooks` |
| 3 | [Missing Signature Verification](./bugs/03-missing-signature-verification.md) | Attacker forges HTTP POST `checkout.paid` directly to webhook route | `webhook_bad_signature` |
| 4 | [Non-Idempotent Fulfillment](./bugs/04-non-idempotent-fulfillment.md) | Webhook arrives late or simultaneously with redirect polling -> double parcel | `delayed_webhook`, `duplicate_webhook` |
| 5 | [Timeout Without Retry / Idempotency Key](./bugs/05-timeout-without-retry.md) | Gateway slow/500 causes hung requests or orphan checkouts | `timeout`, `network_drop`, `gateway_500` |
| 6 | [Amount Units: DZD vs Centimes](./bugs/06-amount-units-dzd-vs-centimes.md) | 2,500 DZD charged as 25 DZD on SATIM (`amount * 100`) or 250,000 DZD on Chargily | `amount_mismatch` |
| 7 | [Double Charge on Refresh / Back Button](./bugs/07-double-charge-on-refresh.md) | User hits Back/F5 and confirms the same SATIM/Chargily order twice | `double_charge_attempt` |
| 8 | [Parcel Stuck States & Virtual Timers](./bugs/08-parcel-stuck-states.md) | Polling jobs hang forever or never reconcile returned parcels | `status_stuck`, `lifecycle_fast`, `returned_to_sender` |
| 9 | [Invalid Wilaya / Commune & Phone Validation](./bugs/09-invalid-wilaya-commune.md) | COD checkout accepts bad commune, then courier API rejects 100% of labels | `invalid_wilaya`, `phone_rejected` |
