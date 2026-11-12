# dz-sandbox Documentation (English)

**Test what fails, not just what succeeds.**

A deterministic, **100% offline** local sandbox simulating Algerian payment and delivery APIs (**Chargily Pay v2**, **SATIM**, **Yalidine**) so engineers can test failure modes, webhooks, timeouts, and virtual-clock lifecycles safely without merchant accounts.

## Key Sections
- [API Spec Status & Honesty Ledger](./SPEC_STATUS.md) — What is verified vs. unverified.
- [Record & Capture Guide](./CAPTURE_GUIDE.md) — Using `dz-sandbox record`, `fixtures validate`, and `replay`.
- [Contributing Fixtures](./CONTRIBUTING-FIXTURES.md) — Mandatory secret/PII redaction checklist.
- [Common Integration Bugs (9 Guides)](./guides/common-integration-bugs.md) — Reproducible real-world bugs & fixes.
- [Scenario Catalog](./scenarios.md) — All 27 built-in payment, webhook, network, and delivery scenarios.
- [Security Threat Model](./THREAT_MODEL.md) — Webhook SSRF policy, path traversal guards, and control auth.
- [Adding a Provider & Experimental OpenAPI Generator](./adding-a-provider.md)
