# dz-sandbox Official Documentation (English)

**Test what fails, not just what succeeds.**

A deterministic, **100% offline-first** local sandbox simulating Algerian payment gateways, mobile banking services, and courier APIs:
- **Chargily Pay v2** (Edahabia & CIB cards, checkouts, HMAC-SHA256 webhooks)
- **SATIM E-Payment** (National interbank SmartVista payment gateway)
- **Yalidine Express** (69 wilayas & 1,541 communes parcel delivery and COD lifecycle)
- **BaridiMob Banking** (Algérie Poste mobile banking: login, device pairing, SMS OTP, RIP transfers, and card balance)

---

## Service URLs & Default Ports

| Service | Default URL | Purpose |
| --- | --- | --- |
| **Control API & Dashboard** | `http://127.0.0.1:4000` | Web dashboard (Arabic RTL default, FR/EN) with Live Stream auto-refresh, virtual clock, and scenario switcher |
| **Chargily Pay v2 Mock** | `http://127.0.0.1:4001/api/v2` | Checkouts, customers, products, prices, local hosted checkout page, and signed webhooks |
| **SATIM E-Payment Mock** | `http://127.0.0.1:4002/payment/rest` | Registration (`register.do`), hosted test cards (`4000000000000001`..`05`), confirmation, and refunds |
| **Yalidine Express Mock** | `http://127.0.0.1:4003/v1` | Parcel CRUD, fee calculator, tracking, and virtual-clock delivery lifecycles |
| **BaridiMob Banking Mock** | `http://127.0.0.1:4004/mobilebank/service` | Authentication, device attachment, SMS OTP confirmation, RIP transfers, and bill payments |

---

## Quick Start in 3 Commands

```bash
# Option 1: Via npx directly
npx dz-sandbox start

# Option 2: Via Docker Compose
docker compose up
```

Once started, open the web dashboard:
`http://127.0.0.1:4000`

---

## Test Failure Modes in Your Code

### 1) With TypeScript / JavaScript
```ts
import { createSandboxClient } from '@dz-sandbox/client';

const sandbox = createSandboxClient({ controlUrl: 'http://127.0.0.1:4000' });

// 1. Reset state
await sandbox.reset();

// 2. Set scenario to deliver duplicate webhooks
await sandbox.scenario('chargily', 'duplicate_webhook');

// 3. Await 2 webhooks and verify idempotent order fulfillment
const hooks = await sandbox.waitForWebhook({ provider: 'chargily', count: 2 });
```

### 2) With PHP / Laravel / Pest
```php
use DzSandbox\SandboxClient;

$sandbox = new SandboxClient('http://127.0.0.1:4000');
$sandbox->reset();

// Simulate BaridiMob SMS OTP expiration
$sandbox->scenario('baridimob', 'otp_timeout');
```

### 3) With Python
```python
from dz_sandbox import SandboxClient

sandbox = SandboxClient("http://127.0.0.1:4000")
sandbox.reset()
sandbox.scenario("satim", "declined")
```

---

## For AI Coding Agents (Cursor / Windsurf / Claude Code)

Using an AI coding assistant? The repository includes drop-in context files:
- **`llms.txt`**: Standard machine-readable summary for LLMs and autonomous agents.
- **`.cursorrules`**: Configuration for Cursor AI directing it to use local mocks.
- **`skills/dz-sandbox/SKILL.md`**: Agent skill definition for tool-using agents.

---

## Key Guides & Sections

- [API Spec Status & Honesty Ledger](./SPEC_STATUS.md) — What is verified vs. simulated.
- [Scenario Catalog (33 Scenarios)](./scenarios.md) — Complete failure scenarios (card declines, network drops, OTP timeouts, parcel returns).
- [Common Integration Bugs (9 Guides)](./guides/common-integration-bugs.md) — Reproducible guides for double fulfillment, centimes mixups, and timeouts.
- [Record & Capture Guide](./CAPTURE_GUIDE.md) — How to record real sandbox exchanges using `dz-sandbox record`.
- [Contributing Fixtures](./CONTRIBUTING-FIXTURES.md) — Mandatory PII/secret redaction checklist.
- [Security Threat Model](./THREAT_MODEL.md) — Webhook SSRF policy and control authentication.
- [Adding a Provider](./adding-a-provider.md) — Scaffold new courier and gateway mocks.
