# Contributing to dz-sandbox

Thank you for helping Algerian developers **test what fails, not just what succeeds**.

## Core Rules

1. **Honesty first — never invent API details.**
   Every endpoint, header, field name, status table, or signature scheme must come from official documentation or real sandbox captures.
   - If you verify an endpoint/payload, add a fixture under `fixtures/<provider>/` with `"verified": true` and a concrete `"source"`, and update `docs/SPEC_STATUS.md`.
   - If something is inferred or partial, keep `"verified": false` and isolate configurable constants inside `packages/mock-<provider>/src/*.spec.ts`.
2. **Never commit real credentials, merchant keys, or real card numbers.** Use clearly fake test values (`test_sk_*`, `4000000000000001`).
3. **Do not copy proprietary docs/code verbatim.** Write original descriptions and schemas from understanding.
4. **Offline-first & minimal dependencies.** Tests and dashboard must run cleanly offline after `npm install`.

## Development Workflow

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm run test:coverage
npm run test:python
```

Coverage thresholds (`vitest.config.ts`) require **>=85%** lines/statements/functions and **>=75%** branches globally.

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new scenario, endpoint, or provider simulation
- `fix:` bug fix or spec alignment correction
- `test:` unit, contract fixture, property, or E2E test additions
- `docs:` README, guides, or `SPEC_STATUS.md` updates
- `ci:` workflow or Docker updates

Wait for CI checks to pass before requesting review, and summarize any changes to verified vs. unverified spec entries in your PR description.
