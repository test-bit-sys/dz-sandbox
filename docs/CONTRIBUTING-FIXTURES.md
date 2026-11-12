# Contributing Verified Provider Fixtures (`docs/CONTRIBUTING-FIXTURES.md`)

`dz-sandbox` refuses to fabricate API specifications. Whenever an endpoint or error code lacks a real source, it stays tagged `unverified` in [`SPEC_STATUS.md`](./SPEC_STATUS.md). Contributing sanitized captures from real sandbox/test accounts is the single highest-impact way to help upgrade `dz-sandbox` fidelity.

## 1. Fixture Types & Directory Layout

```text
fixtures/
  chargily/captured/   # Contributed HTTP request/response JSON captures (verified: true)
  satim/captured/
  yalidine/captured/
  zrexpress/captured/
  maystro/captured/
  openapi-demo/        # Experimental handwritten OpenAPI 3.x samples
```

Every contributed capture JSON **must** validate against `CapturedExchangeSchema` and include:

- `provider`: `"chargily" | "satim" | "yalidine" | "zrexpress" | "maystro"`
- `verified`: `true` (only for real provider test/sandbox HTTP captures)
- `source`: `"captured YYYY-MM-DD"` (plus ticket/doc reference if public)
- `captureDate`: ISO `YYYY-MM-DD`
- `upstreamHost`: upstream hostname (no credentials)
- `request`: `{ method, path, query, headers, body }`
- `response`: `{ status, headers, body }`

## 2. Capture Safely Using `dz-sandbox record`

1. Start the local recording proxy with **mandatory default redaction**:
   ```bash
   npx dz-sandbox record --provider chargily --upstream https://pay.chargily.net/test/api/v2 --out ./fixtures/chargily/captured
   ```
2. Point your integration script at `http://127.0.0.1:4100` instead of the live URL, execute the flow (success + validation/failure cases), then press `Ctrl+C`.
3. Never pass `--no-redact` for PR submissions — `dz-sandbox` refuses to write unredacted captures inside `fixtures/`.

## 3. Mandatory Privacy & Secret Hygiene Checklist

Before opening your PR, verify **all** items below and run the automated validator:

```bash
npx dz-sandbox fixtures validate ./fixtures
```

- [ ] No live or test secret keys (`sk_live_*`, `test_sk_*`, `Bearer ...`, `X-API-TOKEN`, SATIM `userName`/`password`) appear anywhere.
- [ ] No real customer emails, real Algerian phone numbers (`05`/`06`/`07`/`+213`), real full names, or street addresses appear (use `<REDACTED_EMAIL_*>`, `<REDACTED_PHONE_*>`, or RFC example domains `example.com`).
- [ ] No PAN / card numbers (`13–19` digits), CVV, OTP, or bank RIB/RIP/CCP numbers appear.
- [ ] Sensitive request/response headers (`Authorization`, `Cookie`, `Set-Cookie`) are stripped by the header allowlist.
- [ ] Update [`SPEC_STATUS.md`](./SPEC_STATUS.md) **in the same PR**, citing your `source` capture filename and date for each upgraded endpoint.
