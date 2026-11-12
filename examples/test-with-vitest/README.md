# Vitest Integration Example (`@dz-sandbox/client`)

Shows a 15-40 line deterministic Vitest test driving Chargily failure scenarios (`duplicate_webhook`) and webhook assertions via `@dz-sandbox/client`.

## Prerequisites

- Node.js 20+
- Built workspace (`npm run build` at repo root) so `packages/client/dist` exists for local linking
- Running `dz-sandbox` (`npx dz-sandbox start` or `node packages/cli/dist/cli.js start`)

## Run

```bash
# Terminal 1 (from repo root)
node packages/cli/dist/cli.js start

# Terminal 2
cd examples/test-with-vitest
npm install
npm test
```

Expected output:

```text
 ✓ checkout.test.ts (1 test)
   ✓ catches duplicate Chargily webhooks and verifies virtual clock delay
```

## Try Failure Scenarios

Swap `'duplicate_webhook'` in `checkout.test.ts` for `'delayed_webhook'` (plus `await sandbox.advanceClock('30s')`), `'webhook_bad_signature'`, or `'declined'` to verify every failure branch in your integration suite.
