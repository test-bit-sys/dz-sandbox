# dz-sandbox

**Test what fails, not just what succeeds.**

A deterministic, offline-first local sandbox simulating Algerian payment and delivery APIs (**Chargily Pay v2**, **SATIM**, and **Yalidine**) so developers can integrate and test happy paths *and* real-world failures locally without merchant accounts, live credentials, or internet access.

**Languages:** English | [العربية (Arabic)](./README.ar.md) | [Français (French)](./README.fr.md)

> **Disclaimer:** Unofficial. Not affiliated with Chargily, SATIM or Yalidine. Behavior is simulated and may differ from production. Always test against the real sandbox before going live. See [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md) for what is verified vs. unverified.

---

## Quick Start (One Command)

```bash
docker compose up
```

Or directly with Node.js 20+:

```bash
npm install
npm run build
npx dz-sandbox start
```

| Service | Default URL | Purpose |
| --- | --- | --- |
| Control API & Dashboard (Arabic RTL default) | `http://127.0.0.1:4000` | Web UI, OpenAPI (`/__control/openapi.json`), scenarios, virtual clock, webhook inspector |
| Chargily Pay v2 mock *(verified SDK core)* | `http://127.0.0.1:4001/api/v2` | Checkouts, customers, products, prices, payment links, HMAC-SHA256 webhooks, hosted pay page |
| SATIM e-payment mock *(unverified spec)* | `http://127.0.0.1:4002/payment/rest` | Register -> hosted fake-card form -> confirm -> refund |
| Yalidine delivery mock *(partial geo / unverified envelopes)* | `http://127.0.0.1:4003/v1` | Parcels CRUD, validation, fees, 69 wilayas / 1,541 communes, virtual-clock lifecycle & histories |

> **Demo Walkthrough:** Run `./scripts/demo.ps1` (Windows) or `./scripts/demo.sh` (Linux/macOS), or follow [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md) (`docs/assets/demo.gif` recording planned post-tag).

---

## Test What Fails in 15 Lines

```ts
import { sandbox } from '@dz-sandbox/client';

await sandbox.reset();
await sandbox.scenario('chargily', 'duplicate_webhook');
// Create & complete checkout against http://127.0.0.1:4001/api/v2 ...
const hooks = await sandbox.waitForWebhook({ provider: 'chargily', count: 2, timeoutMs: 5000 });
// Assert your webhook handler is idempotent (fulfill order once, not twice!)
await sandbox.clock.advance('2h'); // Trigger delayed webhooks or Yalidine lifecycle transitions instantly
```

Prefer Python? Zero-dependency stdlib client included (`packages/python-client`):

```python
from dz_sandbox import SandboxClient
client = SandboxClient("http://127.0.0.1:4000")
client.reset()
client.scenario("chargily", "duplicate_webhook")
hooks = client.wait_for_webhook(provider="chargily", count=2)
```

---

## Provider Support & Honesty Table

| Provider | Package | Maturity | Verified vs. Simulated Scope | Config & Spec |
| --- | --- | --- | --- | --- |
| **Chargily Pay v2** | `@dz-sandbox/mock-chargily` | **Verified / Partial** | Customer/product/price/checkout flow & HMAC-SHA256 `signature` verified end-to-end against official `@chargily/chargily-pay@2.1.0`; fee formula & some 4xx envelopes simulated | [chargily.spec.ts](./packages/mock-chargily/src/chargily.spec.ts) |
| **SATIM** | `@dz-sandbox/mock-satim` | **Unverified** | Register -> hosted fake cards (`4000000000000001`..`05`) -> confirm/refund state machine; bank-specific paths, `jsonParams` & error codes require official PDF | [satim.spec.ts](./packages/mock-satim/src/satim.spec.ts) |
| **Yalidine Express** | `@dz-sandbox/mock-yalidine` | **Partial / Unverified** | 69 wilayas (`era: 48\|58\|69`) & 1,541 communes (AR/FR/EN, coordinates excluded) imported from user-supplied `algeria-geo`; CRUD/lifecycle simulated, 9 centers & rate headers await live captures | [yalidine.spec.ts](./packages/mock-yalidine/src/yalidine.spec.ts) |

Full honesty ledger: [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md).

---

## Official `@chargily/chargily-pay` SDK Integration

`@chargily/chargily-pay@2.1.0` sets `client.base_url` in its constructor without an env override. Redirect it cleanly to your local sandbox in tests:

```ts
import { ChargilyClient } from '@chargily/chargily-pay';
import { pointChargilyClientToSandbox } from '@dz-sandbox/client';

const client = pointChargilyClientToSandbox(
  new ChargilyClient({ api_key: 'test_sk_local', mode: 'test' }),
  process.env.CHARGILY_BASE_URL ?? 'http://127.0.0.1:4001/api/v2',
);
```

---

## CLI, Scenarios & Verification

```bash
npx dz-sandbox doctor                         # Check Node, Docker, ports 4000-4003 & print .env snippet
npx dz-sandbox scenario set chargily declined # Switch global scenario
npx dz-sandbox logs --provider yalidine       # Inspect redacted requests
npx dz-sandbox export repro.json              # Save deterministic state + scenarios bundle
npx dz-sandbox import repro.json              # Replay an exact bug report locally
```

- **27 built-in scenarios** (`declined`, `insufficient_funds`, `timeout`, `network_drop`, `duplicate_webhook`, `delayed_webhook`, `out_of_order_webhooks`, `webhook_bad_signature`, `webhook_never_sent`, `rate_limited`, `lifecycle_fast`, `returned_to_sender`, etc.) — see [docs/scenarios.md](./docs/scenarios.md).
- **Custom YAML scenarios** hot-reloaded from `./scenarios/*.yaml`.
- **SQLite (`DZ_STORE=sqlite`) or in-memory (`DZ_STORE=memory`)** storage (supports Node 20+ with automatic `node:sqlite` / fallback handling).

## Documentation

- [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md) — Verified vs. unverified API surface
- [docs/VERIFICATION.md](./docs/VERIFICATION.md) — Real command outputs vs. `NOT RUN` checks
- [docs/CAPTURE_GUIDE.md](./docs/CAPTURE_GUIDE.md) — How to capture & sanitize real sandbox fixtures (`scripts/redact-fixture.mjs`)
- [docs/scenarios.md](./docs/scenarios.md) — Complete failure & lifecycle catalog
- [docs/architecture.md](./docs/architecture.md) — System design, security defaults, and data flow
- [docs/adding-a-provider.md](./docs/adding-a-provider.md) — Add ZR Express, Maystro, or Ecotrack
- [examples/](./examples) — Express checkout (naive duplicate bug vs. idempotent fix), Next.js COD store, Vitest test suite (`npm run examples:smoke`)
- [CHANGELOG.md](./CHANGELOG.md) · [CONTRIBUTING.md](./CONTRIBUTING.md) · [SECURITY.md](./SECURITY.md) · [MIT License](./LICENSE)
