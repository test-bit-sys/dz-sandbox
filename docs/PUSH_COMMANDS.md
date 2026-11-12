# GitHub Push Instructions (`docs/PUSH_COMMANDS.md`)

The `gh` (GitHub CLI) is not installed on this local Windows machine. To publish **dz-sandbox** safely to your GitHub account without guessing credentials, follow either Option A or Option B below.

---

## Pre-Push Checklist (Already Verified Locally)
- [x] Working tree is clean on branch `main` (commit `7ab252c`).
- [x] Secret scan verified: 0 private keys, 0 live Stripe/Chargily keys, 0 real PANs/cards, 0 personal data.
- [x] Clean builds, TypeScript typechecking, and ESLint pass.
- [x] Vitest test suites and coverage thresholds pass (all core and mocks &ge; 85%).
- [x] Python client tests pass (`packages/python-client`).
- [x] All 3 example stores pass non-interactive smoke testing (`npm run examples:smoke`).
- [x] Chromium Playwright browser E2E and WCAG AA contrast/ARIA checks pass.
- [x] Offline docs generator built 37 HTML pages in `dist-docs/` with zero external assets and zero broken links.
- [x] Package tarballs verified via `npm pack --workspaces --dry-run` (zero `.ts` sources or test leaks).
- [x] Fixture validation verified (`npx dz-sandbox fixtures validate ./fixtures`).

---

## Option A: Using the GitHub CLI (`gh`)

If you have `gh` installed on your machine or terminal:

```bash
# 1. Authenticate with your GitHub account (if not already logged in)
gh auth login

# 2. Create the public repository under your GitHub account
gh repo create dz-sandbox --public \
  --description "Local deterministic sandbox simulating Algerian payment and delivery APIs (Chargily Pay v2, SATIM, Yalidine)" \
  --source=. \
  --remote=origin

# 3. Push the main branch
git push -u origin main

# 4. Set repository topics
gh repo edit --add-topic "algeria,mock-server,sandbox,payments,webhooks,delivery,chargily,satim,yalidine,typescript,testing,rtl"
```

---

## Option B: Using Git & GitHub Web UI

If you prefer using standard Git and the GitHub web interface:

```bash
# 1. Create a new empty repository named "dz-sandbox" at:
#    https://github.com/new
#    - Visibility: Public
#    - Do NOT initialize with a README, .gitignore, or license (already present in repo)

# 2. Add the remote (replace <YOUR_GITHUB_USERNAME> with your username):
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/dz-sandbox.git
# Or if using SSH:
# git remote add origin git@github.com:<YOUR_GITHUB_USERNAME>/dz-sandbox.git

# 3. Push the main branch:
git push -u origin main

# 4. Verify the push with ls-remote:
git ls-remote --heads origin
```

---

## Post-Push Verification & GitHub Settings

1. **Verify public tree:** Confirm on GitHub that only tracked files appear and that `node_modules`, `dist`, `.env*`, `*.db`, `coverage`, and `.tgz` are completely absent.
2. **Enable Private Vulnerability Reporting:**
   - Go to `Settings -> Security -> Code security and analysis` and enable **Private vulnerability reporting**.
3. **Enable GitHub Discussions:**
   - Go to `Settings -> General -> Features` and check **Discussions**.
4. **Set Branch Protection:**
   - Go to `Settings -> Branches` and add a rule for `main` requiring pull requests and passing CI checks.
5. **Tag and Release (Manual Only):**
   - When ready for release:
     ```bash
     git tag v0.1.0
     git push origin v0.1.0
     ```
   - This will trigger `.github/workflows/release.yml`.
