# @dz-sandbox/mock-baridimob

Local deterministic mock server for **BaridiMob** (Algérie Poste mobile banking).

Simulates the core APIs of BaridiMob (`https://baridimob.poste.dz/mobilebank/service`) offline, allowing developers to test mobile banking integrations, payment verification, transfer flows, and SMS OTP confirmation without real banking credentials or risk of account locking.

## Features

- **Device Attach & Confirmation:** Simulates device registration with mock SMS OTP codes (`123456`).
- **Accounts & Balance:** Seeded CCP/RIP accounts with realistic DZD balances.
- **Card Lifecycle:** Regular and virtual cards with transaction histories and spending limits.
- **Transfers & OTP:** `transferCheck` & `transferExec` workflows with OTP verification.
- **Scenario Engine:** Deterministic simulation of `invalid_otp`, `expired_otp`, `account_locked`, `insufficient_funds`, and `session_expired`.

## Quick Start

```bash
# Start dz-sandbox (BaridiMob mock listens on port 4004 by default)
npx dz-sandbox start
```

Point your BaridiMob client or SDK to:
`http://127.0.0.1:4004/mobilebank/service`
