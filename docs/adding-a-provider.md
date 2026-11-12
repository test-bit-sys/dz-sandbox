# Adding a New Provider (e.g., ZR Express, Maystro Delivery, Ecotrack)

`dz-sandbox` separates deterministic simulation infrastructure (`@dz-sandbox/core`) from each provider adapter (`packages/mock-<name>`). Adding another Algerian payment or courier API takes ~4 small files.

## 1. Collect Honest Evidence First

Before coding endpoints:
1. Read the provider's official documentation or record sanitized responses from their real sandbox/production account.
2. Add a fixture file under `fixtures/<provider>/` tagged:
   - `"verified": true` + exact `"source": "<url or capture note>"` if confirmed from official docs/captures, or
   - `"verified": false` if still awaiting merchant confirmation.
3. Add a section in `docs/SPEC_STATUS.md` listing every endpoint/field and its status (`Verified` / `Partial` / `Unverified`).

## 2. Create `packages/mock-<provider>`

Scaffold an npm workspace package depending on `@dz-sandbox/core`, `fastify`, and `zod`:

- `src/<provider>.spec.ts`: Keep all route paths, header names, status tables, and response code constants in one configurable file (explicitly annotate `verified: true | false`).
- `src/server.ts`: Export `create<Provider>Server({ ctx, webhooks })`:
  1. Call `registerRequestAuditHook(app, ctx, '<provider>')` so all requests appear in `/__control/requests` and the dashboard.
  2. Call `resolveScenario` + `applyNetworkScenario(ctx, '<provider>', request, reply, resolved)` before route logic so `timeout`, `slow`, `gateway_500`, `network_drop`, `rate_limited`, and `auth_failed` work automatically.
  3. Persist resources in `ctx.store` namespaces (e.g. `<provider>:parcels`) so `GET /__control/export`, `POST /__control/import`, and `POST /__control/reset` support your provider for free.
  4. Schedule lifecycle transitions or webhooks through `ctx.clock.schedule(...)` and `webhooks.dispatch(...)` so `clock/advance` makes every async flow instant in tests.
- `src/<provider>.test.ts`: Add contract replay tests against `fixtures/<provider>/*.json`, validation tests, and scenario tests.

## 3. Wire into CLI & Control

1. Update `packages/cli/src/runtime.ts` and `doctor.ts` to assign a default port (`4004`, `DZ_<PROVIDER>_PORT`) and expose URLs in `.env` snippets.
2. Add built-in scenarios if provider-specific in `packages/core/src/scenarios.ts`.
3. Update `Dockerfile`, `docker-compose.yml`, and `README*.md`.

---

## Experimental: Generate a Stateless Mock from OpenAPI 3.x

If you already have an OpenAPI 3.x specification (`YAML` or `JSON`), you can generate a starter **experimental** provider mock immediately:

```bash
npx dz-sandbox generate --openapi ./fixtures/openapi-demo/courier-demo.openapi.yaml --name courier-demo --out ./generated-providers/courier-demo
node ./generated-providers/courier-demo/server.mjs
```

Or boot it directly without writing files:

```bash
npx dz-sandbox serve-openapi --openapi ./fixtures/openapi-demo/courier-demo.openapi.yaml --name courier-demo --port 4200
```

> [!WARNING]
> **Experimental Limitations:** OpenAPI-generated mocks are stateless request/response validators (`example` / schema synthesis) with scenario fault injection (`gateway_500`, `slow`, `rate_limited`, `timeout`, `network_drop`). They do not implement stateful payment/delivery state machines, external `$ref` URLs, polymorphic discriminators, or automatic webhook dispatch. Generated providers must keep their `experimental` label until backed by hand-authored behavior and real fixtures.
