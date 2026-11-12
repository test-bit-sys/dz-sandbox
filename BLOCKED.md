# Blocked Items Log (`phase2/hardening-and-recorder`)

Items listed here cannot be verified or completed autonomously because they require external credentials, proprietary/official documentation, live sandboxes, or environment capabilities unavailable on this machine.

## B-01: Live Provider Sandboxes, Official Specs & Captured Fixtures
- **Affected:**
  - **Chargily Pay v2:** Real `pay.chargily.net/test/api/v2` request/response transcripts (especially 4xx error envelopes, pagination headers, fee calculation rounding, `payment-links`, `balance`).
  - **SATIM:** Official Acquiring Bank Integration Guide PDF (exact endpoint paths, `register.do` vs `confirmOrder.do` vs `acknowledgeTransaction.do`, `jsonParams`, `errorCode`/`actionCode`/`respCode` tables, SATIM UAT test cards).
  - **Yalidine Express v1:** Live API v1 transcripts (`/v1/parcels`, `/v1/histories`, `/v1/centers`, `/v1/deliveryfees`, quota/rate-limit headers, stop-desk & tier attributes).
  - **ZR Express & Maystro Delivery:** Official API documentation or sanitized captured transcripts (endpoints, auth headers, status codes, field schemas). No endpoints or fields were invented for `packages/mock-zrexpress` or `packages/mock-maystro`; both remain honest scaffolds returning `501 NOT_IMPLEMENTED_AWAITING_SPEC`.
- **Suggested unblock:** Obtain test-mode/sandbox credentials or official API guides and capture sanitized fixtures via `npx dz-sandbox record --provider <name> --upstream <url> --out ./fixtures/<provider>/captured` followed by `npx dz-sandbox fixtures validate ./fixtures`.

## B-02: Docker Compose Runtime Verification (`docker compose up --build`)
- **Reason:** Docker Desktop / `docker` CLI is not installed on the local Windows build host.
- **Mitigation:** Static Dockerfile/Compose audit performed and `docker-smoke` job is defined in `.github/workflows/ci.yml` (`ubuntu-latest`). Marked `NOT RUN` in `docs/VERIFICATION.md`.

## B-03: Node.js 20 Runtime Execution Without Built-in `node:sqlite`
- **Reason:** Local Windows host runs Node `v26.7.0`.
- **Mitigation:** `packages/core/src/core.test.ts` tests the `node:sqlite` unavailability fallback path with a mocked driver loader, and `.github/workflows/ci.yml` defines Node `[20, 22]` matrix verification.

## B-04: GitHub Push, Release Tagging, GitHub Pages Deployment, and `npm publish`
- **Reason:** Explicitly prohibited during unattended Phase 2 execution.
- **Suggested unblock:** Maintainer reviews `phase2/hardening-and-recorder`, runs release checklist steps, enables GitHub Pages (`workflow_dispatch` / tag workflow) if desired, and publishes manually.
