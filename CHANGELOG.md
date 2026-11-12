# Changelog

All notable changes to **dz-sandbox** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-12

### Added
- **Core Scenario & Determinism Engine (`@dz-sandbox/core`):**
  - Declarative scenario precedence: request header (`X-DZ-Scenario`) > per-resource rule > sequence rule > global provider default > `success`.
  - 27 built-in scenarios covering card failures, gateway timeouts/500s/network drops, duplicate/delayed/out-of-order/bad-signature/missing webhooks, double charges, partial refunds, rate limits (`429`), geo validation failures, and accelerated delivery lifecycles.
  - Seeded deterministic PRNG (`DZ_SEED`), controllable virtual clock (`POST /__control/clock/advance`), custom YAML/JSON scenario loader with hot-reload, HMAC-SHA256 webhook dispatcher with backoff, and secret-redacted request/webhook inspector.
  - Storage adapters supporting in-memory (`DZ_STORE=memory`) and SQLite (`DZ_STORE=sqlite`) with `node:sqlite` and graceful fallback to `better-sqlite3` or in-memory on Node 20+.
- **Mock Providers:**
  - **Chargily Pay v2 (`@dz-sandbox/mock-chargily`):** Customers, products, prices, checkouts, payment links, local hosted payment page (`/pay/chargily/:id`), and HMAC-SHA256 webhook signing verified against official `@chargily/chargily-pay@2.1.0`.
  - **SATIM (`@dz-sandbox/mock-satim`, *unverified spec*):** `register.do`, local test-card form (`4000000000000001`..`05`), `confirmOrder.do` / `getOrderStatusExtended.do` / `acknowledgeTransaction.do`, and `refund.do` with monotonic refund bounds.
  - **Yalidine Express (`@dz-sandbox/mock-yalidine`, *partial geo / unverified envelopes*):** Parcels CRUD, delivery fee lookup, histories, virtual-clock lifecycle progression, and 69 wilayas (`era: 48|58|69`) + 1,541 communes imported from user-supplied `algeria-geo` via `scripts/import-geo.mjs` (excluding ODbL coordinates).
- **Control Plane, Dashboard, CLI & SDKs:**
  - Control API (`@dz-sandbox/control`) serving OpenAPI (`/__control/openapi.json`), state export/import bundles, and an offline RTL-ready dashboard (`AR` default, `FR`, `EN`) with dark/light theme.
  - CLI (`dz-sandbox`: `start`, `stop`, `status`, `reset`, `scenario`, `logs`, `export`, `import`, `doctor`).
  - TypeScript test client (`@dz-sandbox/client`, including `pointChargilyClientToSandbox()`) and zero-dependency Python 3 client (`packages/python-client`).
- **Examples, Tooling & Truthfulness Docs:**
  - Runnable examples (`examples/express-checkout` showing naive duplicate-webhook bug vs idempotent fix, `examples/nextjs-cod-store`, `examples/test-with-vitest`) + `npm run examples:smoke`.
  - Honest specification ledger (`docs/SPEC_STATUS.md`), capture & redaction workflow (`docs/CAPTURE_GUIDE.md`, `scripts/redact-fixture.mjs`), verification matrix (`docs/VERIFICATION.md`), demo storyboard/scripts, and multi-stage `Dockerfile` + `docker-compose.yml`.
