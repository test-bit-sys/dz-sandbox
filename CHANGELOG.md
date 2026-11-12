# Changelog

All notable changes to **dz-sandbox** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Upgraded Zod to v4 (`^4.6.7`):** Upgraded `zod` from `v3.24.2` to `v4.6.7` across all 7 consuming workspace packages (`core`, `control`, `mock-chargily`, `mock-satim`, `mock-yalidine`, `mock-zrexpress`, `mock-maystro`). Resolves high-severity advisory `GHSA-mrhx-c7xc-m3w5` with `npm audit --omit=dev` reporting 0 vulnerabilities. Updated `z.record(T)` calls to the required 2-argument signature `z.record(z.string(), T)`.

### Added
- **Security Hardening & Threat Model:** `docs/THREAT_MODEL.md`, SSRF/private-range webhook target protection, open-redirect neutralization, CRLF header-injection blocking, path-traversal guards on scenario/file loaders, log redaction (`Authorization`, API keys, tokens, card-like digits), optional Control API bearer authentication beyond loopback, and `fast-check` state-machine & scenario-precedence fuzz tests.
- **Record & Replay Mode:** `dz-sandbox record`, `dz-sandbox replay`, and `dz-sandbox fixtures validate` backed by `@dz-sandbox/core` (`packages/core/src/recorder.ts`), automatic redaction, and explicit `--no-redact --confirm-unredacted` guardrails.
- **Experimental OpenAPI Generator:** `dz-sandbox generate` and `dz-sandbox serve-openapi` for OpenAPI 3.x YAML/JSON specs (marked experimental; never used to forge verified Algerian provider behavior).
- **ZR Express & Maystro Scaffolds:** Added `@dz-sandbox/mock-zrexpress` and `@dz-sandbox/mock-maystro` honest unverified scaffolds (`501 NOT_IMPLEMENTED_AWAITING_SPEC` until official docs or sanitized fixtures exist).
- **Dashboard Quality & E2E:** Added Scenario Matrix tab, ARIA roles & keyboard tab navigation, WCAG 2.1 AA theme contrast refinements, and automated Chromium Playwright E2E test (`npm run test:e2e:browser`).
- **Offline Docs Site & Guides:** Added `scripts/build-docs-site.mjs` (`npm run docs:build`, `npm run test:docs`) generating RTL-default Arabic + French/English static HTML with offline search, `docs/CONTRIBUTING-FIXTURES.md`, 9 reproducible bug guides under `docs/guides/bugs/`, and manual-only `.github/workflows/docs-pages.yml`.
- **Packaging Polish:** Added per-package `README.md` across all 9 workspace packages and verified packed tarball installation (`npm pack` -> offline temp-dir `npm install` + `npx dz-sandbox doctor` + runtime smoke test).

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
