# Release Checklist (`dz-sandbox`)

Follow these steps before tagging and publishing a release (`vX.Y.Z`):

## 1. Truthfulness & Fixture Audit
- [x] Confirm `docs/SPEC_STATUS.md` matches the exact verification state of every endpoint and fixture.
- [x] Confirm zero `verified: true` fixtures lack a non-empty `source`.
- [x] Confirm zero real merchant keys, passwords, or real card numbers exist in code, tests, fixtures, or docs.
- [x] Confirm third-party geo attribution (`NOTICE`) excludes ODbL coordinate fields and lists MIT Official Gazette source metadata cleanly.

## 2. Offline Clean Build, Coverage & Examples Verification
- [x] `npm ci` (or clean workspace build after deleting caches)
- [x] `npm run build`
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run test:coverage` (`>=85%` on statements, branches, functions, and lines enforced in `vitest.config.ts` on `core`, `mock-chargily`, `mock-satim`, `mock-yalidine`)
- [x] `npm run test:python`
- [x] `npm run examples:smoke`
- [x] `npm run test:e2e:browser` (Playwright Chromium E2E, contrast, ARIA, zero external requests; `@axe-core/playwright` auto-runs in online CI)
- [x] `npm run docs:build && npm run test:docs`
- [x] `node packages/cli/dist/cli.js fixtures validate fixtures`
- [x] `npm pack` across all 9 workspace packages verifies zero `.ts` sources or test files leak into tarballs, every tarball includes `dist/`, `LICENSE`, and `README.md`, and clean temp-dir offline install + `npx dz-sandbox doctor` + `@dz-sandbox/client` smoke pass.

## 3. GitHub Repository Settings (Maintainer Manual Actions)
- [ ] **Configure repository placeholders:** Replace `test-bit-sys` and `test-bit-sys` across `package.json`, `.github/CODEOWNERS`, `LICENSE`, `SUPPORT.md`, and README files with your real GitHub username and name.
- [ ] **Set repository description & topics:**
  - Description: *Local deterministic sandbox simulating Algerian payment and delivery APIs (Chargily Pay v2, SATIM, Yalidine)*
  - Topics: `algeria`, `mock-server`, `sandbox`, `payments`, `webhooks`, `delivery`, `chargily`, `satim`, `yalidine`, `typescript`, `testing`, `rtl`
- [ ] **Enable Private Vulnerability Reporting:** Go to `Settings -> Security -> Code security and analysis` and enable *Private vulnerability reporting*.
- [ ] **Enable GitHub Discussions:** Go to `Settings -> General -> Features` and check *Discussions*.
- [ ] **Enable Dependabot Alerts & Security Updates:** Under `Settings -> Security -> Code security and analysis`.
- [ ] **Configure Branch Protection on `main`:** Go to `Settings -> Branches` and add a rule for `main` requiring pull request reviews, passing CI status checks (`verify`, `docker-smoke`), and disallowing force pushes.

## 4. Manual Publishing Steps
- [x] **Resolved `npm audit` advisory on `zod`:** upgraded all workspace packages to `zod@^4.6.7` (resolving `GHSA-mrhx-c7xc-m3w5`); `npm audit --omit=dev --audit-level=high` reports **0 vulnerabilities** (see `docs/DECISIONS.md`).
- [ ] **Run Docker Compose smoke check on a machine/CI with Docker:** verify `docker compose up --build` and `.github/workflows/ci.yml` `docker-smoke` job pass cleanly on Linux.
- [ ] **Capture real provider fixtures (optional, recommended before v0.2.0):** follow [docs/CAPTURE_GUIDE.md](./CAPTURE_GUIDE.md) + `node scripts/redact-fixture.mjs` to add real redacted sandbox fixtures for Chargily, SATIM, and Yalidine.
- [ ] **Record demo visual:** follow [docs/DEMO_SCRIPT.md](./DEMO_SCRIPT.md) to capture `docs/assets/demo.gif` and uncomment the README placeholder.
- [ ] **npm publish auth:** run `npm login` (with 2FA) and publish packages (`npm publish --workspaces --access public`), or configure `NPM_TOKEN` in GitHub Secrets for `.github/workflows/release.yml`.
- [ ] **Tag & push release:** run `git tag v0.1.0 && git push origin v0.1.0` after final approval.
- [ ] **Post-publish GitHub configuration:** make the GHCR container package (`ghcr.io/<owner>/dz-sandbox`) public under Package Settings, and seed initial issues from `docs/issues-seed/`.
