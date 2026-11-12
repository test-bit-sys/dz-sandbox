# Architecture & Engineering Decisions (`docs/DECISIONS.md`)

This document records the key architectural choices and design rationale for `dz-sandbox`.

## D-01: Pre-existing `zod <4.6.6` npm audit finding (`GHSA-mrhx-c7xc-m3w5`)
- **Decision:** Keep `zod@^3.24.2` for v0.1.0, document `GHSA-mrhx-c7xc-m3w5` and dev-only `vitest@3`/`tinypool` advisories in `docs/THREAT_MODEL.md`, and mitigate oversized-collection DoS by enforcing strict Fastify `bodyLimit` + bounded Zod schema limits before validation runs.
- **Alternatives:** `npm audit fix --force` would jump to `zod@4.6.7` and `vitest@5.1.0` (breaking major upgrades across packages).
- **Why:** Prevents breaking APIs and schemas mid-hardening while directly bounding payload sizes at the HTTP ingress layer.

## D-02: Control API bearer token & host exposure defaults
- **Decision:** Keep all mock servers and Control API bound to `127.0.0.1` by default (`resolveBindHost()`). If `DZ_SANDBOX_HOST` is non-loopback (`0.0.0.0`, LAN IP) or `DZ_CONTROL_TOKEN` is set, enforce `Authorization: Bearer <DZ_CONTROL_TOKEN>` on mutating/sensitive `/__control/*` routes (leaving `/__control/health` unauthenticated for Docker/K8s probes; dashboard UI prompts/stores token in memory/sessionStorage only when server requires it). If `DZ_SANDBOX_HOST` is non-loopback without `DZ_CONTROL_TOKEN`, refuse mutating control calls (or refuse boot unless `DZ_ALLOW_UNAUTH_CONTROL=true`) with a clear diagnostic message.
- **Alternatives:** Generating a random token on every boot (breaks unattended scripts and Docker Compose defaults unless printed/configured) vs leaving non-loopback control completely unauthenticated (risks SSRF/RCE-by-webhook if exposed on LAN).
- **Why:** Zero friction on `127.0.0.1` local dev (and Docker localhost port-forwarding), while blocking unauthenticated non-loopback control calls when `DZ_CONTROL_TOKEN` is set or remote IP access occurs without explicit opt-in.

## D-03: Webhook SSRF allowlist & localhost dev ergonomics
- **Decision:** Restrict outbound webhook URLs in `WebhookDispatcher` using `isSafeWebhookUrl()`:
  - Require `http:` or `https:` scheme only and reject embedded credentials (`user:pass@host`) and obfuscated IP notations (decimal/octal/hex IPv4).
  - Block private, link-local, metadata (`169.254.169.254`), and non-loopback reserved IPs (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`, `fe80::/10`, `0.0.0.0`) unless explicitly allowed via `DZ_WEBHOOK_ALLOWLIST`.
  - Allow loopback targets (`127.0.0.1`, `::1`, `localhost`) only when `DZ_ALLOW_LOCALHOST_WEBHOOKS !== 'false'`.
- **Alternatives:** Blocking loopback unconditionally unless an env flag is set (breaks zero-config local DX, `examples:smoke`, and tests out of the box) vs leaving webhooks unvalidated (allows cloud metadata SSRF).
- **Why:** Protects cloud/LAN targets unconditionally while keeping `127.0.0.1` test webhooks seamless and easy to lock down via `DZ_ALLOW_LOCALHOST_WEBHOOKS=false`.

## D-04: Honest Scaffolds for ZR Express (`@dz-sandbox/mock-zrexpress`) and Maystro (`@dz-sandbox/mock-maystro`)
- **Decision:** Since zero official API documentation or sanitized captured fixtures exist in the repository for ZR Express or Maystro Delivery, implement both workspaces as honest structural scaffolds (`verified: false`, `status: 'scaffold'`, scenario middleware wired for fault testing, `/health` online, and all provider API paths returning `501 NOT_IMPLEMENTED_AWAITING_SPEC`) rather than guessing endpoints or parcel schemas.
- **Alternatives:** Guessing typical REST paths like `/api/v1/parcels` from community hearsay.
- **Why:** Strictly upholds the project rule of "never invent API details"; contributors can drop verified captures and specs directly into `<provider>.spec.ts` and `server.ts` cleanly when docs or captures arrive.

## D-05: Offline Browser E2E & Accessibility Audit (`playwright-core@1.58.2`)
- **Decision:** Install `playwright-core@1.58.2` directly from the local offline npm cache (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) pointing at the cached Chromium browser, and implement an in-Chromium accessibility + WCAG 2.1 AA contrast + keyboard navigation + ARIA landmark audit in `scripts/browser-e2e.mjs` (`npm run test:e2e:browser`), with optional `@axe-core/playwright` execution if present in online CI.
- **Alternatives:** Skipping browser E2E tests because `axe-core` / `@axe-core/playwright` npm package was absent from offline cache.
- **Why:** Exercises every live dashboard workflow (AR RTL, FR/EN toggle, live request log, scenarios, webhook redeliver, clock advance, hosted payment preview iframe, scenario matrix, offline zero-external-requests guarantee, and live WCAG contrast/ARIA/keyboard focus checks) in real headless Chromium offline.
