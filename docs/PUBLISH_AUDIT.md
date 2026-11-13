# Pre-Publish Security, Hygiene & Release Readiness Audit

This audit document records the pre-release verification performed on `dz-sandbox` prior to initial GitHub publication.

---

## 1. Verification Matrix

| Check | Command | Result | Evidence / Last ~15 lines |
| --- | --- | --- | --- |
| **Clean Build** | `npm run build` | **Passed** (Exit 0) | All 9 workspace packages built cleanly via tsup with ESM and DTS bundles (`core`, `control`, `mock-chargily`, `mock-satim`, `mock-yalidine`, `mock-zrexpress`, `mock-maystro`, `client`, `dz-sandbox`). |
| **Typecheck** | `npm run typecheck` | **Passed** (Exit 0) | `tsc --noEmit` passed with zero errors across all 9 workspaces. |
| **Lint** | `npm run lint` | **Passed** (Exit 0) | `eslint "packages/*/src/**/*.ts"` passed with zero warnings or errors. |
| **Test & Coverage Thresholds** | `npm run test:coverage` | **Passed** (Exit 0) | 13 test files / 49 tests passed. Global: `95.58%` stmts, `85.48%` branches, `95.25%` funcs, `95.58%` lines. Strict `85%` threshold enforced on `core`, `mock-chargily`, `mock-satim`, and `mock-yalidine`; scaffolds at `100%`. |
| **Python Client Test** | `npm run test:python` | **Passed** (Exit 0) | `Ran 1 test in 0.805s ... OK` (`packages/python-client`). |
| **Example Smoke Suite** | `npm run examples:smoke` | **Passed** (Exit 0) | `express-checkout` (naive duplicate-bug vs idempotent fix), `nextjs-cod-store` (happy path 201, phone 422, rate limit 503), and `test-with-vitest` all passed. |
| **Browser E2E & A11y** | `npm run test:e2e:browser` | **Passed** (Exit 0) | `{"browserE2E":"OK","executable":"chrome.exe","externalRequests":0,"pageErrors":0,"webhooksReceived":2,"clockBefore":"2026-01-01T09:00:00.000Z","clockAfter":"2026-01-01T10:00:00.000Z"}`. |
| **Offline Docs Build** | `npm run docs:build` | **Passed** (Exit 0) | `Built 38 HTML docs pages into dist-docs/`. |
| **Docs Link & Purity Check** | `npm run test:docs` | **Passed** (Exit 0) | `{"docsSite":"OK","pagesBuilt":38,"internalLinksVerified":390,"searchEntries":37,"externalAssetRequests":0,"defaultLocale":"ar-rtl"}`. |
| **Package Tarball Dry-Run** | `npm pack --workspaces --dry-run` | **Passed** (Exit 0) | Verified all 9 workspace tarballs contain only `dist/`, `LICENSE`, `README.md`, `package.json` (zero `.ts` sources or tests leak). |
| **Fixtures Validation** | `npx dz-sandbox fixtures validate ./fixtures` | **Passed** (Exit 0) | `Validated 5 fixture file(s) in fixtures (captured: 0, seed: 5)`. Zero unredacted secrets or PII. |
| **Secrets Scan** | Automated regex scan on git log & tree | **Passed** (Exit 0) | 0 private keys, 0 real AWS/GitHub/Slack tokens, 0 live Stripe/Chargily keys, 0 real PANs, 0 real PII. |
| **Docker Compose** | `docker compose up --build` | **NOT RUN** | Docker CLI unavailable on local Windows host; tested automatically in `.github/workflows/ci.yml` `docker-smoke` job on Linux. |
| **axe-core Playwright** | `@axe-core/playwright` package | **NOT RUN** | Absent from local offline npm cache; local Chromium script audits ARIA/WCAG AA contrast directly; `@axe-core/playwright` runs in online CI. |

---

## 2. Secrets Scan Summary & Tree Hygiene

An automated scanner was run across the working tree and the full `git log -p` history using strict regexes:
- **Private Keys (`-----BEGIN ... PRIVATE KEY`):** `0`
- **Live Stripe/Chargily Keys (`live_sk_`, `sk_live_`, `live_pk_`):** `0` real (only 2 mock strings in `redact.ts` and `recorder.test.ts` testing redaction).
- **JWTs:** `0` real (1 dummy test token in `recorder.test.ts`).
- **Credit Card Numbers:** `0` real card numbers. 7 unique fake test card numbers found (`4000000000000001`..`05` for SATIM fake cards, `4111111111111234` in `recorder.test.ts`).
- **Emails & Phones:** `0` real personal emails or phone numbers. All emails are synthetics (`dev@dz-sandbox.local`, `karim@example.dz`, etc.) or Isaac's email in `package-lock.json` metadata; all phone numbers are dummy test values (`0555123456`).
- **Absolute Local Paths:** Removed local machine drive paths from `docs/VERIFICATION.md`. All docs, scripts, and code references use relative paths or portable standard system candidates.
- **Removed / Ignored Files:** Root internal run trackers (`PROGRESS.md`, `FINAL_REPORT.md`, `BLOCKED.md`, `DECISIONS.md`) were removed from git tracking and ignored in `.gitignore`. Useful long-term decisions and limitations were moved to [docs/DECISIONS.md](./DECISIONS.md) and [docs/KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).

---

## 3. Placeholders to Replace Manually Before / After Publishing

Search for the following placeholders in your editor and replace them with your actual values:

| Placeholder | Meaning | Files Affected |
| --- | --- | --- |
| `test-bit-sys` | Your GitHub username or organization name | Root `package.json`, 9 `packages/*/package.json`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/*.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `SUPPORT.md`, `README.md`, `README.fr.md`, `README.ar.md`, `packages/python-client/pyproject.toml` |
| `test-bit-sys` | Your name or organization for the MIT copyright notice | Root `LICENSE`, 10 package `LICENSE` files, `README.md`, `README.fr.md`, `README.ar.md` |
| `docs/assets/demo.gif` | Visual demonstration walkthrough | Follow [docs/DEMO_SCRIPT.md](./DEMO_SCRIPT.md) to record the GIF and uncomment the demo image tag in `README.md`, `README.fr.md`, `README.ar.md` |
| `docs/assets/dashboard.png` | Dashboard screenshot | Capture the dashboard running on `http://127.0.0.1:4000` and uncomment the screenshot tag in the README files |

---

## 4. GitHub Settings to Enable Manually

Once the repository is created and pushed on GitHub:
1. **Repository Description & Topics:**
   - Description: *Local deterministic sandbox simulating Algerian payment and delivery APIs (Chargily Pay v2, SATIM, Yalidine)*
   - Topics: `algeria`, `mock-server`, `sandbox`, `payments`, `webhooks`, `delivery`, `chargily`, `satim`, `yalidine`, `typescript`, `testing`, `rtl`
2. **Private Vulnerability Reporting:**
   - Navigate to `Settings -> Security -> Code security and analysis` and enable *Private vulnerability reporting*.
3. **GitHub Discussions:**
   - Navigate to `Settings -> General -> Features` and check *Discussions*.
4. **Dependabot Alerts & Security Updates:**
   - Under `Settings -> Security -> Code security and analysis`, ensure Dependabot alerts and automated security updates are enabled.
5. **Branch Protection Rule on `main`:**
   - Navigate to `Settings -> Branches` and add a protection rule for `main`:
     - Require pull request reviews before merging.
     - Require status checks to pass before merging (`verify (Node 20)`, `verify (Node 22)`, `Docker Compose Build & Smoke Test`).
     - Do not allow force pushes or branch deletion.

---

## 5. Remaining Credibility Risks & NOT RUN Items

1. **Zero Real Captured Fixtures (`captured: 0`):** Every Chargily fee/error edge, all SATIM endpoints, and all Yalidine response envelopes are based on public docs and `@chargily/chargily-pay` SDK types rather than live HTTP recordings. Contributors should use `dz-sandbox record` to contribute real fixtures.
2. **SATIM & Yalidine Webhook Behavior:** SATIM bank-specific `actionCode` tables and whether Yalidine v1 natively supports outbound webhooks or requires polling `/v1/histories` remain unverified in [docs/SPEC_STATUS.md](./SPEC_STATUS.md).
3. **ZR Express & Maystro Scaffolds:** Intentionally return `501 NOT_IMPLEMENTED_AWAITING_SPEC` to uphold the zero-guessing rule until official specs or captured fixtures arrive.
4. **Upstream `zod` Advisory (`GHSA-mrhx-c7xc-m3w5`):** Resolved! Upgraded across all workspace packages to `zod@^4.6.7`. `npm audit --omit=dev` reports **0 vulnerabilities**. Strict body limits and bounded schemas remain active as defense-in-depth.
5. **Docker Execution Not Run Locally:** Verified via static configuration audit and CI workflow; requires Docker-capable machine to test `docker compose up --build`.
