---
title: "[good first issue] Record live Chargily test-mode fixtures for error envelopes & webhooks"
labels: ["good first issue", "mock-chargily", "fixtures"]
---

## Goal
While core Chargily v2 endpoints and HMAC-SHA256 `signature` verification match `@chargily/chargily-pay@2.1.0`, exact 4xx/422 validation error payloads and webhook headers need recorded captures.

## Tasks
- Capture sanitized JSON responses from `https://pay.chargily.net/test/api/v2` (removing real keys/secrets).
- Add fixtures under `fixtures/chargily/` tagged `verified: true` with explicit `source`.
- Align `packages/mock-chargily/src/chargily.spec.ts` error shapes if any differ.
