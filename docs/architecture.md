# dz-sandbox Architecture

> **Slogan:** "Test what fails, not just what succeeds."
>
> **Disclaimer:** Unofficial. Not affiliated with Chargily, SATIM, or Yalidine. Behavior is simulated and may differ from production. Always test against the real sandbox before going live.

## 1. System Overview

`dz-sandbox` is a local, offline-first monorepo of Fastify mock servers, a shared deterministic scenario engine, a virtual clock, a webhook dispatcher, a control plane + RTL-ready dashboard, a CLI, and test helper clients (TypeScript + Python).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Developer App / Test Suite                      │
│   (@chargily/chargily-pay, fetch/axios, @dz-sandbox/client, Python)     │
└───────┬──────────────────┬──────────────────┬──────────────────┬────────┘
        │ :4001            │ :4002            │ :4003            │ :4000
        ▼                  ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ mock-chargily │  │  mock-satim   │  │ mock-yalidine │  │    control    │
│ Chargily v2   │  │ SATIM Gateway │  │ Yalidine v1   │  │ /__control/*  │
│ + Hosted Page │  │ + Hosted Form │  │ + Geo/Fees    │  │ + Dashboard   │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │                  │
        └──────────────────┴──────────────────┴──────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │        @dz-sandbox/core         │
                    │  - Scenario Engine (YAML/Zod)   │
                    │  - VirtualClock & SeededRNG     │
                    │  - Store (Memory | SQLite)      │
                    │  - WebhookDispatcher (HMAC)     │
                    │  - Request/Response Logger      │
                    └─────────────────────────────────┘
```

## 2. Default Ports & Networking

All servers bind to `127.0.0.1` by default (security-by-default). Exposing on `0.0.0.0` requires an explicit flag (`--host 0.0.0.0` or `DZ_SANDBOX_HOST=0.0.0.0` in Docker).

| Service | Default Port | Env Variable | Base Path |
| --- | --- | --- | --- |
| Control API + Dashboard | `4000` | `DZ_CONTROL_PORT` | `/__control` (API), `/` (UI) |
| Chargily Pay v2 Mock | `4001` | `DZ_CHARGILY_PORT` | `/api/v2` (and `/test/api/v2` alias) |
| SATIM Mock | `4002` | `DZ_SATIM_PORT` | `/payment/rest` (and root `.do` aliases) |
| Yalidine v1 Mock | `4003` | `DZ_YALIDINE_PORT` | `/v1` |

## 3. Monorepo Layout

- `packages/core`: Scenario Engine (precedence: per-request header `X-DZ-Scenario` > per-resource rule > sequence rule > provider global default > `success`), `VirtualClock`, `SeededRNG`, `Store` interface (`MemoryStore` + `SqliteStore` via `better-sqlite3`), `WebhookDispatcher` (retries, backoff, duplicate/out-of-order/bad-signature/never-sent), secret redaction, YAML/JSON custom scenario loader with hot-reload.
- `packages/mock-chargily`: Chargily Pay v2 endpoints, hosted payment page (Edahabia / CIB), HMAC-SHA256 webhook signing.
- `packages/mock-satim`: SATIM order registration, hosted card entry page with fake test cards, status acknowledgment, refund, strict order state machine, configurable `satim.spec.ts`.
- `packages/mock-yalidine`: Yalidine v1 endpoints, wilaya/commune/center dataset behind a clean `GeoDataset` interface, delivery fee calculation, virtual-clock-driven parcel lifecycle simulator.
- `packages/control`: `/__control/*` REST API with OpenAPI 3.1 spec + static RTL-first AR/FR/EN dashboard.
- `packages/cli`: `dz-sandbox` binary (`start`, `stop`, `reset`, `status`, `scenario`, `logs`, `export`, `import`, `doctor`).
- `packages/client`: `@dz-sandbox/client` TypeScript SDK for automated tests (`reset`, `scenario`, `waitForWebhook`, `clock.advance`).
- `packages/python-client`: Minimal `dz-sandbox` Python package (`reset`, `scenario`, `wait_for_webhook`, `clock_advance`).
- `fixtures/`: Contract test fixtures per provider, each tagged `verified: boolean` and `source`.
- `examples/`: Runnable `express-checkout`, `nextjs-cod-store`, and `test-with-vitest`.

## 4. Core Design Principles

1. **Scenario Resolution Precedence:**
   1. `X-DZ-Scenario` HTTP request header (highest precedence).
   2. Per-resource scenario binding (`provider` + `resourceId`, e.g. checkout ID, order ID, or tracking code).
   3. Sequence rule (call `N` returns scenario `A`, call `N+1` returns `B`).
   4. Provider-wide default scenario.
   5. Fallback `success` / `created_ok`.
2. **Determinism:** Every ID generator, fee/RNG helper, and delayed/lifecycle event uses `SeededRNG` and `VirtualClock` so Vitest suites never sleep for real hours.
3. **Configurable Spec Isolation:** Any unverified provider field/code sits in a dedicated spec config module (`*.spec.ts`) so updating against official merchant PDFs takes minutes without rewriting business logic.
4. **Security Boundaries:**
   - Default bind host `127.0.0.1`.
   - Secret redaction on `Authorization`, `X-API-TOKEN`, `password` in request logs.
   - Strict Zod input validation and body size limits (1 MiB default).
   - No outbound HTTP requests except to developer-configured webhook URLs (with optional `DZ_WEBHOOK_ALLOWLIST`).
