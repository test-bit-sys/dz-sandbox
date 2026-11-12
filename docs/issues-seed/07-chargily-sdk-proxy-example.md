---
title: "[good first issue] Add Chargily official SDK proxy helper example for TypeScript & CommonJS"
labels: ["good first issue", "examples", "docs"]
---

## Goal
`@chargily/chargily-pay@2.1.0` hardcodes `this.base_url` in its constructor. While `@dz-sandbox/client` exposes `pointChargilyClientToSandbox()`, developers using older versions or CJS also benefit from clear examples.

## Tasks
- Add a clean TypeScript + CommonJS snippet under `examples/` showing `pointChargilyClientToSandbox(client, 'http://127.0.0.1:4001/api/v2')`.
- Add an automated test verifying the helper on `createCheckout` + `verifySignature`.
