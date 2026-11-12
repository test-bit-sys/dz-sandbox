# Release Checklist (`dz-sandbox`)

Follow these steps before tagging a release (`vX.Y.Z`):

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
- [x] `npm pack --dry-run` across all 7 workspace packages verifies zero `.ts` sources or test files leak into tarballs and every tarball includes `dist/` + `LICENSE`.

## 3. Manual Steps Required From Maintainer Before Publishing
- [ ] **Resolve or accept `npm audit` advisory on `zod@3`:** `npm audit --omit=dev --audit-level=high` reports `GHSA-mrhx-c7xc-m3w5` (`zod <4.6.6`); decide whether to stay on `zod@^3.24.2` for v0.1.0 or plan a breaking `zod@4` upgrade for v0.2.0.
- [ ] **Run Docker Compose smoke check on a machine/CI with Docker:** verify `docker compose up --build` and `.github/workflows/ci.yml` `docker-smoke` job pass cleanly on Linux.
- [ ] **Capture real provider fixtures (optional, recommended before v0.2.0):** follow [docs/CAPTURE_GUIDE.md](./CAPTURE_GUIDE.md) + `node scripts/redact-fixture.mjs` to add real redacted sandbox fixtures for Chargily, SATIM, and Yalidine.
- [ ] **Record demo visual:** follow [docs/DEMO_SCRIPT.md](./DEMO_SCRIPT.md) to capture `docs/assets/demo.gif` and replace the README placeholder.
- [ ] **npm publish auth:** run `npm login` (with 2FA) and publish packages (`npm publish --workspaces --access public`), or configure `NPM_TOKEN` in GitHub Secrets for `.github/workflows/release.yml`.
- [ ] **Tag & push release:** run `git tag v0.1.0 && git push origin v0.1.0` after final approval.
- [ ] **Post-publish GitHub configuration:** make the GHCR container package (`ghcr.io/<owner>/dz-sandbox`) public under Package Settings, enable GitHub Discussions, and seed initial issues from `docs/issues-seed/`.
