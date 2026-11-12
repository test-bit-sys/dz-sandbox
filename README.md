# dz-sandbox

**Test what fails, not just what succeeds.**

A deterministic, offline-first local sandbox simulating Algerian payment and delivery APIs (**Chargily Pay v2**, **SATIM**, and **Yalidine**) so developers can test happy paths *and* real-world failures locally without merchant accounts, live credentials, or internet access.

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
| Control API & Dashboard (RTL Arabic default) | `http://127.0.0.1:4000` | Web UI, OpenAPI (`/__control/openapi.json`), scenarios, virtual clock, webhook inspector |
| Chargily Pay v2 mock | `http://127.0.0.1:4001/api/v2` | Checkouts, customers, products, prices, payment links, signed webhooks, hosted pay page |
| SATIM e-payment mock *(unverified spec)* | `http://127.0.0.1:4002/payment/rest` | Register -> hosted fake-card form -> return -> confirm -> refund |
| Yalidine delivery mock *(partial geo subset)* | `http://127.0.0.1:4003/v1` | Parcels CRUD, validation, fees, virtual-clock lifecycle & histories |

> **Demo Walkthrough Placeholder:** Dashboard overview, toggling `duplicate_webhook`, paying via local hosted page, inspecting HMAC signatures, and advancing the virtual clock by `10m` in milliseconds *(record `docs/assets/demo.gif` after first release)*.

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

## Provider Support & Specification Status

| Provider | Package | Maturity | What Is Verified vs. Simulated | Config & Details |
| --- | --- | --- | --- | --- |
| **Chargily Pay v2** | `@dz-sandbox/mock-chargily` | **Verified / Partial** | Endpoints, shapes, and HMAC-SHA256 `signature` header verified against `@chargily/chargily-pay@2.1.0`; fee formula & exact 4xx error envelopes partial | [chargily.spec.ts](./packages/mock-chargily/src/chargily.spec.ts) |
| **SATIM** | `@dz-sandbox/mock-satim` | **Unverified** | Register -> hosted fake cards (`4000000000000001`..`05`) -> confirm/refund flow implemented cleanly; bank-specific paths, `errorCode`/`actionCode` need official PDF | [satim.spec.ts](./packages/mock-satim/src/satim.spec.ts) |
| **Yalidine Express** | `@dz-sandbox/mock-yalidine` | **Partial / Unverified** | Public v1 CRUD/lifecycle flow + minimal verified subset (8 wilayas, 19 communes, 9 stopdesk centers); full 58/69 wilayas & rate-limit headers await verified data | [yalidine.spec.ts](./packages/mock-yalidine/src/yalidine.spec.ts) |

Full honesty ledger: [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md).

---

## Using the Official `@chargily/chargily-pay` SDK

`@chargily/chargily-pay@2.1.0` sets `client.base_url` in its constructor without an env override. Override it in one line in test/dev mode using `@dz-sandbox/client`:

```ts
import { ChargilyClient } from '@chargily/chargily-pay';
import { pointChargilyClientToSandbox } from '@dz-sandbox/client';

const client = pointChargilyClientToSandbox(
  new ChargilyClient({ api_key: 'test_sk_local', mode: 'test' }),
  process.env.CHARGILY_BASE_URL ?? 'http://127.0.0.1:4001/api/v2',
);
```

---

## CLI & Control Surface

```bash
dz-sandbox doctor                         # Check Node, Docker, ports 4000-4003 & print .env snippet
dz-sandbox scenario set chargily declined # Switch global scenario
dz-sandbox logs --provider yalidine       # Inspect redacted requests
dz-sandbox export repro.json              # Save deterministic state + scenarios bundle
dz-sandbox import repro.json              # Replay an exact bug report locally
```

- **27 built-in scenarios** (`declined`, `insufficient_funds`, `timeout`, `network_drop`, `duplicate_webhook`, `delayed_webhook`, `out_of_order_webhooks`, `webhook_bad_signature`, `webhook_never_sent`, `rate_limited`, `lifecycle_fast`, `returned_to_sender`, etc.) — see [docs/scenarios.md](./docs/scenarios.md).
- **Custom YAML scenarios** hot-reloaded from `./scenarios/*.yaml`.
- **SQLite (`DZ_STORE=sqlite`) or in-memory (`DZ_STORE=memory`)** persistence.

## Documentation

- [docs/SPEC_STATUS.md](./docs/SPEC_STATUS.md) — Verified vs. unverified API surface
- [docs/scenarios.md](./docs/scenarios.md) — Complete failure & lifecycle catalog
- [docs/architecture.md](./docs/architecture.md) — System design, security defaults, and data flow
- [docs/adding-a-provider.md](./docs/adding-a-provider.md) — Add ZR Express, Maystro, or Ecotrack
- [examples/](./examples) — Express checkout, Next.js COD store, Vitest test suite
- [CONTRIBUTING.md](./CONTRIBUTING.md) & [ROADMAP.md](./ROADMAP.md) & [MIT License](./LICENSE)
