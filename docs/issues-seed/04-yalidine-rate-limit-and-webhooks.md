---
title: "[good first issue] Verify Yalidine API v1 rate-limit headers & webhook support"
labels: ["good first issue", "mock-yalidine", "verification"]
---

## Goal
Confirm how `https://api.yalidine.app/v1/` reports rate limits (`Retry-After` vs `X-RateLimit-*`), `GET /v1/histories` filters, and whether Yalidine pushes webhooks natively in v1.

## Tasks
- Check official Yalidine merchant developer docs or test captures.
- Update `packages/mock-yalidine/src/yalidine.spec.ts` and `fixtures/yalidine/` accordingly.
- Update `docs/SPEC_STATUS.md` row entries from `Unverified`/`Partial` to `Verified`.
