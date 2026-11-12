# Verification Ledger (`dz-sandbox` v0.1.0)

This document records **real verification runs** performed for `v0.1.0`, separating checks executed directly from checks that remain **NOT RUN** locally (and why).

> **Principle:** Only checks actually executed against the current codebase with captured outputs are marked as **PASSED**. Anything unexecuted locally or deferred to CI/live sandboxes is marked **NOT RUN**.

---

## 1. Local Verified Checks (Node `v26.7.0`, Windows host)

| Check | Command | Scope & Key Observed Result | Status |
| --- | --- | --- | --- |
| Workspace build | `npm run build` | Builds all 7 TypeScript packages (`core`, `control`, `mock-chargily`, `mock-satim`, `mock-yalidine`, `client`, `dz-sandbox`) with ESM + `.d.ts` output via `tsup` | PASSED |
| Strict typecheck | `npm run typecheck` | Zero `tsc --noEmit` errors across all 7 workspace packages | PASSED |
| Linter | `npm run lint` | `eslint "packages/*/src/**/*.ts"` passes with 0 errors/warnings | PASSED |
| Unit + integration coverage | `npm run test:coverage` | `9 passed (9)` files, `42 passed (42)` tests; `core/src` (96.31% stmts / 86.46% br / 97.14% funcs / 96.31% lines), `mock-chargily/src` (99.76% / 89.58% / 100% / 99.76%), `mock-satim/src` (96.44% / 85.43% / 100% / 96.44%), `mock-yalidine/src` (99.72% / 90.38% / 96.96% / 99.72%) | PASSED |
| Official Chargily SDK fidelity | `npx vitest run packages/cli/src/cli.test.ts packages/cli/src/chargily-fidelity.test.ts` | Official `@chargily/chargily-pay@2.1.0` `ChargilyClient` pointed via `pointChargilyClientToSandbox()` creates customer, product, price, checkout, completes hosted payment, and validates webhook with official `verifySignature() === true` | PASSED |
| Python stdlib client tests | `npm run test:python` | Zero-dependency Python 3 client verified (`Ran 1 test in 0.729s`, `OK`) against live control API | PASSED |
| Runnable examples smoke check | `npm run examples:smoke` | Starts sandbox and runs `express-checkout` (`naive=2`, `idempotent=1`, `satim=1`), `nextjs-cod-store` (`201`, `422`, `503`), and `test-with-vitest` (`1 passed (1)`) | PASSED |
| Terminal demo walkthrough | `powershell -ExecutionPolicy Bypass -File scripts/demo.ps1` | Starts built `packages/cli/dist/cli.js start` cleanly, runs `express-checkout`, creates Yalidine parcel (`yal-340399`), advances clock by `2h` (`Livré`) | PASSED |
| Package tarball dry-run | `npm pack --workspaces --dry-run` | Verified all 7 publishable tarballs ship only `LICENSE`, `dist/*`, and `package.json` with zero `.ts` or test leaks | PASSED |
| Geo dataset validation/import | `node scripts/import-geo.mjs` | Validated 69 wilayas (`era: 48\|58\|69`) and 1,541 communes from user-supplied `algeria-geo` into `packages/mock-yalidine/src/algeria-geo.generated.ts`, excluding ODbL coordinates | PASSED |
| CLI diagnostics (`doctor`) | `node packages/cli/dist/cli.js doctor` + `cli.test.ts` | Reports Node version, free/running port status, `.env` snippet, and handles missing Docker CLI cleanly (`dockerVersion: null`, exit 0 when Node >= 20) | PASSED |
| Dependency audit (`npm audit`) | `npm audit --omit=dev --audit-level=high` | **Exits 1:** `zod <4.6.6` (`GHSA-mrhx-c7xc-m3w5`, high; fix requires breaking major `zod@4.6.7`). Full audit also flags dev-only `vitest@3` -> `tinypool <=2.1.1`. Marked `continue-on-error: true` in `.github/workflows/ci.yml` | KNOWN ISSUE |

---

## 2. Phase 2 Step Verification Output Snippets

### STEP 2: Record & Replay (`dz-sandbox record`, `fixtures validate`, `replay`)

Command:
```bash
npm run build && npm run typecheck && npm run lint && npm run test:coverage
```
Last ~15 lines of real output:
```text
 mock-satim/src    |   98.04 |    87.61 |     100 |   98.04 |                   
  hosted-page.ts   |     100 |       75 |     100 |     100 | 46                
  satim.spec.ts    |     100 |      100 |     100 |     100 |                   
  server.ts        |   96.67 |       85 |     100 |   96.67 | ...52-353,372-373 
  state-machine.ts |     100 |      100 |     100 |     100 |                   
 mock-yalidine/src |   99.72 |    90.38 |   96.96 |   99.72 |                   
  ....generated.ts |     100 |      100 |     100 |     100 |                   
  geo-dataset.ts   |   98.72 |    93.75 |   96.29 |   98.72 | 155-156           
  lifecycle.ts     |     100 |    94.44 |     100 |     100 | 174               
  server.ts        |     100 |    88.09 |     100 |     100 | ...02,431,447,450 
  yalidine.spec.ts |     100 |      100 |     100 |     100 |                   
-------------------|---------|----------|---------|---------|-------------------
```
Result: Exit 0 (`Test Files 10 passed (10)`, `Tests 45 passed (45)`; `core/src` 96.67% stmts / 86.86% br / 97.41% funcs / 96.67% lines; `recorder.ts` 97.97% stmts / 87.43% br / 100% funcs / 97.97% lines).

---

## 2. Checks Marked `NOT RUN` Locally (and Why)

| Check | Reason Not Run Locally | Mitigation / Where Tested |
| --- | --- | --- |
| `docker compose up --build` | Docker Desktop / `docker` CLI is not installed on the local Windows build machine | Static audit of `Dockerfile` (copies all `packages/*` AND `examples/*` workspace `package.json` files before `npm ci`) and `docker-compose.yml` (`127.0.0.1` host port binding); automated in `.github/workflows/ci.yml` `docker-smoke` job on `ubuntu-latest` |
| Node 20 runtime without `node:sqlite` | Local host runs Node `v26.7.0` | `packages/core/src/core.test.ts` tests the SQLite fallback path when `node:sqlite` is unavailable; `.github/workflows/ci.yml` runs `verify` matrix on `[20, 22]` |
| Full `next build` on `examples/nextjs-cod-store` | Installing `next@^15` separately hit TLS failure (`ERR_SSL_CIPHER_OPERATION_FAILED`) offline, so `next` is declared as an optional `peerDependency` | `examples/nextjs-cod-store/demo.mjs` transpiles `app/api/orders/cod/route.ts` with `typescript` offline and asserts `created_ok -> 201`, `phone_rejected -> 422`, `rate_limited -> 503` |
| Live provider sandbox contract verification (Chargily test mode, SATIM bank PDF, Yalidine API v1) | No live merchant keys, bank documentation PDF, or internet sandbox credentials are bundled or committed | All unverified endpoints/fields remain tagged `Unverified` or `Partial` in [docs/SPEC_STATUS.md](./SPEC_STATUS.md); contributors can capture sanitized fixtures via [docs/CAPTURE_GUIDE.md](./docs/CAPTURE_GUIDE.md) and `scripts/redact-fixture.mjs` |
