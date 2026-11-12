# Known Limitations & Verification Scope (`docs/KNOWN_LIMITATIONS.md`)

This document lists known scope boundaries, environment dependencies, and items awaiting live sandbox verification or community contribution.

## 1. Provider Sandboxes & Official Specs Awaiting Capture
- **Chargily Pay v2:** Core customer/product/price/checkout lifecycle and webhook signature verification are confirmed against official `@chargily/chargily-pay@2.1.0`. Edge 4xx error payloads, fee calculation rounding nuances, and `payment-links` parameters are simulated based on public docs and await live sandbox fixtures (`fixtures/chargily/captured/`).
- **SATIM E-Payment:** Based on SmartVista/SATIM common public integration patterns. Bank-specific paths (`register.do` vs `registerPreAuth.do`, `confirmOrder.do` vs `acknowledgeTransaction.do`), mandatory `jsonParams`, and bank-specific `actionCode` / `respCode` mappings require the official bank technical PDF.
- **Yalidine Express v1:** 69 wilayas and 1,541 communes (AR/FR/EN) are imported from administrative datasets (`scripts/import-geo.mjs`). Field envelopes and pagination formats are simulated and await live API v1 captures.
- **ZR Express & Maystro Delivery:** Packages `@dz-sandbox/mock-zrexpress` and `@dz-sandbox/mock-maystro` are honest structural scaffolds returning `501 NOT_IMPLEMENTED_AWAITING_SPEC` to prevent guessing unverified API paths.

To contribute real sanitized captures, see [docs/CAPTURE_GUIDE.md](./CAPTURE_GUIDE.md) and [docs/CONTRIBUTING-FIXTURES.md](./CONTRIBUTING-FIXTURES.md).

## 2. Docker & Multi-Platform Verification
- Local testing was performed directly on Windows with Node.js 26. Multi-stage Docker builds (`docker compose up --build`) and Linux container execution are verified in GitHub Actions CI via `.github/workflows/ci.yml`.

## 3. Node.js Version Support
- Supported runtime is Node.js `>=20.0.0`. On Node versions where `node:sqlite` is unavailable, the core store falls back to `better-sqlite3` or in-memory mode (`DZ_STORE=memory`).

## 4. Upstream Dependency Audit Notes
- `zod@^3.24.2` has an upstream advisory (`GHSA-mrhx-c7xc-m3w5`) concerning collection parsing. `dz-sandbox` mitigates this at the HTTP layer via strict Fastify `bodyLimit` (256 KB) and bounded Zod schemas (e.g. `items.max(100)`). A migration to `zod@4` is planned for a future major release.
