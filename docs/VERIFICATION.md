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
| Dependency audit (`npm audit`) | `npm audit --omit=dev --audit-level=high` | **Exit 0:** `found 0 vulnerabilities` (production dependencies clean after upgrading `zod` to `v4.6.7`, resolving `GHSA-mrhx-c7xc-m3w5`). Full audit flags only dev-only `vitest@3` -> `tinypool <=2.1.1` | PASSED |

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

### STEP 3: Experimental OpenAPI 3.x Mock Generator (`dz-sandbox generate` / `serve-openapi`)

Command:
```bash
npm run lint && npm run test:coverage
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
Result: Exit 0 (`Test Files 11 passed (11)`, `Tests 47 passed (47)`; `core/src` 96.53% / 86.38% / 97.56% / 96.53%; `openapi-mock.ts` 95.72% / 84.45% / 100% / 95.72%).

### STEP 4: Honest Scaffolds (`@dz-sandbox/mock-zrexpress` & `@dz-sandbox/mock-maystro`)

Command:
```bash
npm run typecheck && npm run lint && npm run test:coverage
```
Last ~15 lines of real output:
```text
 mock-yalidine/src |   99.72 |    90.38 |   96.96 |   99.72 |                   
  ....generated.ts |     100 |      100 |     100 |     100 |                   
  geo-dataset.ts   |   98.72 |    93.75 |   96.29 |   98.72 | 155-156           
  lifecycle.ts     |     100 |    94.44 |     100 |     100 | 174               
  server.ts        |     100 |    88.09 |     100 |     100 | ...02,431,447,450 
  yalidine.spec.ts |     100 |      100 |     100 |     100 |                   
 ...-zrexpress/src |     100 |      100 |     100 |     100 |                   
  server.ts        |     100 |      100 |     100 |     100 |                   
  ...press.spec.ts |     100 |      100 |     100 |     100 |                   
-------------------|---------|----------|---------|---------|-------------------
```
Result: Exit 0 (`Test Files 13 passed (13)`, `Tests 49 passed (49)`; both scaffolds at 100% / 100% / 100% / 100%).

### STEP 5: Dashboard Quality (Playwright Chromium E2E, Accessibility Audit & Scenario Matrix)

Command:
```bash
npm run test:e2e:browser
```
Last ~15 lines of real output:
```text
> dz-sandbox-monorepo@0.1.0 test:e2e:browser
> node scripts/browser-e2e.mjs

{"browserE2E":"OK","executable":"chrome.exe","externalRequests":0,"pageErrors":0,"webhooksReceived":2,"clockBefore":"2026-01-01T09:00:00.000Z","clockAfter":"2026-01-01T10:00:00.000Z"}
```
Result: Exit 0 (Verified AR RTL default, FR/EN toggle, keyboard ArrowRight tab navigation, live Request Log, hosted checkout Payment Preview iframe completion, Webhooks redelivery, Scenario Matrix coverage tracking + `rate_limited` -> HTTP `429`, Clock `+1h` advance, zero external requests, zero page errors, WCAG 2.1 AA computed contrast >= 4.5:1 & ARIA checks across dark and light themes). Note: `@axe-core/playwright` npm package is absent from local offline cache (see `BLOCKED.md` `B-05`); `scripts/browser-e2e.mjs` invokes it automatically when installed in online CI.

### STEP 6: Static Offline Docs Site, Search Index & 9 Common Integration Bug Guides

Command:
```bash
npm run docs:build && npm run test:docs
```
Last ~15 lines of real output:
```text
> dz-sandbox-monorepo@0.1.0 docs:build
> node scripts/build-docs-site.mjs

Built 34 HTML docs pages into dist-docs/

> dz-sandbox-monorepo@0.1.0 test:docs
> node scripts/build-docs-site.mjs --verify

{"docsSite":"OK","pagesBuilt":34,"internalLinksVerified":348,"searchEntries":33,"externalAssetRequests":0,"defaultLocale":"ar-rtl"}
```
Result: Exit 0 (Generated 34 static HTML pages with Arabic RTL default `index.html`, French/English landing pages, zero external CDN/script/font requests, inline offline search index validated against `duplicate_webhook`, `contributing-fixtures`, and `THREAT_MODEL`, all 348 internal links verified, and `.github/workflows/docs-pages.yml` configured for manual `workflow_dispatch` only).

### STEP 7: Packaging Polish (`npm pack --dry-run` & Clean Temp-Dir Packed Tarball Install)

Command:
```bash
npm pack -w packages/core -w packages/control -w packages/mock-chargily -w packages/mock-satim -w packages/mock-yalidine -w packages/mock-zrexpress -w packages/mock-maystro -w packages/client -w packages/cli --pack-destination <tmp>/packs && cd <tmp>/install && npm install --offline --no-audit --no-fund --omit=optional <tmp>/packs/*.tgz && npx --no-install dz-sandbox doctor && node smoke.mjs
```
Last ~15 lines of real output:
```text
Paste into your .env:

# dz-sandbox local URLs
DZ_CONTROL_URL=http://127.0.0.1:4000
CHARGILY_BASE_URL=http://127.0.0.1:4001/api/v2
CHARGILY_SECRET_KEY=test_sk_dz_sandbox_chargily_secret
SATIM_BASE_URL=http://127.0.0.1:4002/payment/rest
SATIM_USERNAME=test_merchant
SATIM_PASSWORD=test_password
YALIDINE_BASE_URL=http://127.0.0.1:4003/v1
YALIDINE_API_ID=test_api_id
YALIDINE_API_TOKEN=test_api_token
=== @dz-sandbox/client + runtime ESM smoke ===
{"packedSmoke":"OK","scenarioStatus":429,"chargilyUrl":"http://127.0.0.1:30597/api/v2","yalidinePort":30599,"scaffoldsLoaded":true}
```
Result: Exit 0 (All 9 tarballs contain `dist/`, `LICENSE`, `README.md`, `package.json` with zero `.ts` sources; offline clean install added 61 packages, `npx dz-sandbox doctor` succeeded, `startSandboxRuntime` + `createSandboxClient` enforced `rate_limited` -> `429`, and both scaffold packages imported cleanly).

### STEP 8: Final Clean Full-Suite Verification (`dist` wiped & rebuilt from scratch)

Commands run sequentially after wiping `packages/*/dist` and `dist-docs/`:
1. `npm run build` (Exit 0)
2. `npm run typecheck` (Exit 0)
3. `npm run lint` (Exit 0)
4. `npm run test:coverage` (Exit 0)
5. `npm run test:python` (Exit 0)
6. `npm run examples:smoke` (Exit 0)
7. `npm run test:e2e:browser` (Exit 0)
8. `npm run docs:build` (Exit 0)
9. `npm run test:docs` (Exit 0)
10. `node packages/cli/dist/cli.js fixtures validate fixtures` (Exit 0)

Last ~15 lines of real outputs (coverage summary + integration/docs checks):
```text
All files          |   95.58 |     85.5 |   95.25 |   95.58 |
(Test Files 13 passed (13), Tests 49 passed (49); core 96.53/86.41/97.56/96.53,
 mock-chargily 99.76/89.58/100/99.76, mock-satim 98.04/87.61/100/98.04,
 mock-yalidine 99.72/90.38/96.96/99.72, mock-zrexpress & mock-maystro 100/100/100/100)

Ran 1 test in 0.283s (OK)
All 3 examples passed smoke verification!
{"browserE2E":"OK","executable":"chrome.exe","externalRequests":0,"pageErrors":0,"webhooksReceived":2,"clockBefore":"2026-01-01T09:00:00.000Z","clockAfter":"2026-01-01T10:00:00.000Z"}
Built 34 HTML docs pages into dist-docs/
{"docsSite":"OK","pagesBuilt":34,"internalLinksVerified":348,"searchEntries":33,"externalAssetRequests":0,"defaultLocale":"ar-rtl"}
Validated 5 fixture file(s) in fixtures (captured: 0, seed: 5)
```
Note on `npm ci` & `npm audit`:
- `npm ci --offline --no-audit --no-fund --dry-run` exited 0 (`added 34 packages in 7s`); existing offline `node_modules` was preserved because `better-sqlite3`'s install script requires network access if `prebuild-install` needs downloading binaries without local C++ build tools.
- `npm audit --omit=dev --audit-level=high --offline` returns exit 0 (`found 0 vulnerabilities`) only because `--offline` skips online registry advisory lookup; online `npm audit` on `zod@^3.24.2` still flags `GHSA-mrhx-c7xc-m3w5` (`zod <4.6.6`, documented in `DECISIONS.md` `D-01` and mitigated via Fastify `bodyLimit` + bounded Zod schemas).

### STEP 9: Zod v4 Upgrade (`chore/zod-4`, resolves `GHSA-mrhx-c7xc-m3w5`)

All workspace packages consuming `zod` (`core`, `control`, `mock-chargily`, `mock-satim`, `mock-yalidine`, `mock-zrexpress`, `mock-maystro`) upgraded to `zod@^4.6.7`.

#### 1. Clean `npm ci --offline`
Command: `npm ci --offline`
```text
added 372 packages, and audited 385 packages in 2m
124 packages are looking for funding
  run `npm fund` for details
found 0 vulnerabilities
```

#### 2. Workspace Build (`npm run build`)
Command: `npm run build`
```text
> @dz-sandbox/core@0.1.0 build
DTS ⚡️ Build success in 2941ms (dist\index.d.ts 25.54 KB)
> @dz-sandbox/control@0.1.0 build
DTS ⚡️ Build success in 2459ms (dist\index.d.ts 6.99 KB)
> @dz-sandbox/mock-chargily@0.1.0 build
DTS ⚡️ Build success in 2391ms (dist\index.d.ts 4.64 KB)
> @dz-sandbox/mock-satim@0.1.0 build
DTS ⚡️ Build success in 5690ms (dist\index.d.ts 4.15 KB)
> @dz-sandbox/mock-yalidine@0.1.0 build
DTS ⚡️ Build success in 4404ms (dist\index.d.ts 6.29 KB)
> @dz-sandbox/mock-zrexpress@0.1.0 build
DTS ⚡️ Build success in 2830ms (dist\index.d.ts 892.00 B)
> @dz-sandbox/mock-maystro@0.1.0 build
DTS ⚡️ Build success in 2843ms (dist\index.d.ts 871.00 B)
> @dz-sandbox/client@0.1.0 build
DTS ⚡️ Build success in 2316ms (dist\index.d.ts 2.66 KB)
> dz-sandbox@0.1.0 build
DTS ⚡️ Build success in 3999ms (dist\index.d.ts 1.66 KB)
```

#### 3. Strict Typecheck (`npm run typecheck`)
Command: `npm run typecheck`
```text
> @dz-sandbox/core@0.1.0 typecheck > tsc --noEmit
> @dz-sandbox/control@0.1.0 typecheck > tsc --noEmit
> @dz-sandbox/mock-chargily@0.1.0 typecheck > tsc --noEmit
> @dz-sandbox/mock-satim@0.1.0 typecheck > tsc --noEmit
> @dz-sandbox/mock-yalidine@0.1.0 typecheck > tsc --noEmit
> @dz-sandbox/mock-zrexpress@0.1.0 typecheck > tsc --noEmit
> @dz-sandbox/mock-maystro@0.1.0 typecheck > tsc --noEmit
> @dz-sandbox/client@0.1.0 typecheck > tsc --noEmit
> dz-sandbox@0.1.0 typecheck > tsc --noEmit
```

#### 4. Lint (`npm run lint`)
Command: `npm run lint`
```text
> dz-sandbox-monorepo@0.1.0 lint
> eslint "packages/*/src/**/*.ts"
```
(Exit 0, 0 errors, 0 warnings)

#### 5. Test Coverage (`npm run test:coverage`)
Command: `npm run test:coverage`
```text
 Test Files  13 passed (13)
      Tests  49 passed (49)
   Duration  28.18s

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   95.58 |    85.33 |   95.25 |   95.58 |                   
 control/src       |   92.94 |    73.68 |     100 |   92.94 |                   
 core/src          |   96.53 |    86.41 |   97.56 |   96.53 |                   
 mock-chargily/src |   99.76 |    88.33 |     100 |   99.76 |                   
 mock-maystro/src  |     100 |      100 |     100 |     100 |                   
 mock-satim/src    |   98.04 |    87.61 |     100 |   98.04 |                   
 mock-yalidine/src |   99.72 |    90.38 |   96.96 |   99.72 |                   
 ...-zrexpress/src |     100 |      100 |     100 |     100 |                   
-------------------|---------|----------|---------|---------|-------------------
```

#### 6. Python Client Test (`npm run test:python`)
Command: `npm run test:python`
```text
test_reset_scenario_and_wait_for_webhook (test_client.TestPythonClient.test_reset_scenario_and_wait_for_webhook) ... ok

----------------------------------------------------------------------
Ran 1 test in 0.211s

OK
```

#### 7. Runnable Examples Smoke (`npm run examples:smoke`)
Command: `npm run examples:smoke`
```text
=== Running example smoke: examples/express-checkout ===
express-checkout demo OK: naive=2 fulfillments (bug caught), idempotent=1 (fixed), satim=1

=== Running example smoke: examples/nextjs-cod-store ===
nextjs-cod-store demo OK: happy path 201, phone_rejected->422, rate_limited->503

=== Running example smoke: examples/test-with-vitest ===
 ✓ checkout.test.ts (1 test) 86ms
 Test Files  1 passed (1)
      Tests  1 passed (1)

All 3 examples passed smoke verification!
```

#### 8. Docs Generation & Internal Link Audit (`npm run docs:build` & `npm run test:docs`)
Command: `npm run docs:build && npm run test:docs`
```text
> dz-sandbox-monorepo@0.1.0 docs:build
> node scripts/build-docs-site.mjs
Built 38 HTML docs pages into dist-docs/

> dz-sandbox-monorepo@0.1.0 test:docs
> node scripts/build-docs-site.mjs --verify
{"docsSite":"OK","pagesBuilt":38,"internalLinksVerified":390,"searchEntries":37,"externalAssetRequests":0,"defaultLocale":"ar-rtl"}
```

#### 9. Production Dependency Audit (`npm audit --omit=dev`)
Command: `npm audit --omit=dev`
```text
found 0 vulnerabilities
```
Result: 0 high/critical vulnerabilities in production dependencies. `GHSA-mrhx-c7xc-m3w5` is completely resolved.

---

## 2. Checks Marked `NOT RUN` Locally (and Why)

| Check | Reason Not Run Locally | Mitigation / Where Tested |
| --- | --- | --- |
| `docker compose up --build` | Docker Desktop / `docker` CLI is not installed on the local Windows build machine | Static audit of `Dockerfile` (copies all `packages/*` AND `examples/*` workspace `package.json` files before `npm ci`) and `docker-compose.yml` (`127.0.0.1` host port binding); automated in `.github/workflows/ci.yml` `docker-smoke` job on `ubuntu-latest` |
| Node 20 runtime without `node:sqlite` | Local host runs Node `v26.7.0` | `packages/core/src/core.test.ts` tests the SQLite fallback path when `node:sqlite` is unavailable; `.github/workflows/ci.yml` runs `verify` matrix on `[20, 22]` |
| Full `next build` on `examples/nextjs-cod-store` | Installing `next@^15` separately hit TLS failure (`ERR_SSL_CIPHER_OPERATION_FAILED`) offline, so `next` is declared as an optional `peerDependency` | `examples/nextjs-cod-store/demo.mjs` transpiles `app/api/orders/cod/route.ts` with `typescript` offline and asserts `created_ok -> 201`, `phone_rejected -> 422`, `rate_limited -> 503` |
| Live provider sandbox contract verification (Chargily test mode, SATIM bank PDF, Yalidine API v1) | No live merchant keys, bank documentation PDF, or internet sandbox credentials are bundled or committed | All unverified endpoints/fields remain tagged `Unverified` or `Partial` in [docs/SPEC_STATUS.md](./SPEC_STATUS.md); contributors can capture sanitized fixtures via [docs/CAPTURE_GUIDE.md](./CAPTURE_GUIDE.md) and `scripts/redact-fixture.mjs` |
