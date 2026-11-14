---
name: dz-sandbox
description: Test Algerian payment (Chargily Pay v2, SATIM, BaridiMob) and delivery (Yalidine) APIs locally and offline with deterministic failure scenarios.
---

# dz-sandbox Skill for AI Agents

Use this skill whenever integrating, testing, or diagnosing Algerian payment gateways and courier APIs (Chargily Pay v2, SATIM, Yalidine, BaridiMob).

## Capabilities

- **100% Offline Simulation**: No internet or live merchant credentials needed.
- **Deterministic Scenarios**: Trigger failure edge cases (`declined`, `insufficient_funds`, `duplicate_webhook`, `otp_timeout`, `timeout`, `rate_limited`).
- **Virtual Clock**: Fast-forward time (`+2h`, `+1d`) to instantly test webhook retries and multi-day parcel tracking lifecycles.

## Local Service Ports

- **Control API & Dashboard**: `http://127.0.0.1:4000`
- **Chargily Pay v2 Mock**: `http://127.0.0.1:4001/api/v2`
- **SATIM E-Payment Mock**: `http://127.0.0.1:4002/payment/rest`
- **Yalidine Express Mock**: `http://127.0.0.1:4003/v1`
- **BaridiMob Banking Mock**: `http://127.0.0.1:4004/mobilebank/service`

## Workflow for AI Agents

1. **Start the sandbox**:
   ```bash
   npx dz-sandbox start
   ```
2. **Point application environment variables to local ports**:
   ```env
   CHARGILY_BASE_URL=http://127.0.0.1:4001/api/v2
   SATIM_BASE_URL=http://127.0.0.1:4002/payment/rest
   YALIDINE_BASE_URL=http://127.0.0.1:4003/v1
   BARIDIMOB_BASE_URL=http://127.0.0.1:4004/mobilebank/service
   ```
3. **Simulate failure modes in automated tests**:
   - Header injection: Pass `X-DZ-Scenario: declined` on test requests.
   - Or use test clients (`@dz-sandbox/client`, `DzSandbox\SandboxClient`, or `dz_sandbox.SandboxClient`).
   - Verify idempotent webhook handling (`duplicate_webhook`).
4. **Advance virtual clock**:
   ```bash
   curl -X POST http://127.0.0.1:4000/__control/clock/advance -H "Content-Type: application/json" -d '{"duration":"2h"}'
   ```
