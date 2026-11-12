# Release Checklist (`dz-sandbox`)

Follow these steps before tagging a release (`vX.Y.Z`):

1. **Truthfulness & Fixture Audit**
   - [ ] Confirm `docs/SPEC_STATUS.md` matches the exact verification state of every endpoint and fixture.
   - [ ] Confirm zero `verified: true` fixtures lack a non-empty `source`.
   - [ ] Confirm zero real merchant keys, passwords, or real card numbers exist in code, tests, fixtures, or docs.

2. **Offline Clean Build & Tests**
   - [ ] `npm ci`
   - [ ] `npm run build`
   - [ ] `npm run typecheck`
   - [ ] `npm run lint`
   - [ ] `npm run test:coverage` (passes 100%, >=85% lines/stmts/funcs, >=75% branches)
   - [ ] `npm run test:python`

3. **Container & Examples Verification**
   - [ ] `docker build -t dz-sandbox:rc .` succeeds cleanly on Linux/macOS/CI.
   - [ ] Container starts via `docker compose up`, healthchecks return `200 OK` on port `4000`, and `/health` responds on `4001`, `4002`, `4003`.
   - [ ] Dashboard loads cleanly offline at `http://127.0.0.1:4000/` in AR (RTL), FR, and EN without browser console errors or external requests.

4. **Publish & Tag**
   - [ ] Bump package versions consistently across workspace `package.json` files and `packages/python-client/pyproject.toml`.
   - [ ] Run `npm publish --workspaces --dry-run --access public`.
   - [ ] Tag `git tag vX.Y.Z && git push origin vX.Y.Z` to trigger `.github/workflows/release.yml`.
