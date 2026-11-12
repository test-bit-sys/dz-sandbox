---
title: "[good first issue] Scaffold mock-zrexpress courier adapter following adding-a-provider guide"
labels: ["good first issue", "provider", "enhancement"]
---

## Goal
Add a fourth Algerian delivery adapter (`packages/mock-zrexpress`) following `docs/adding-a-provider.md`.

## Tasks
- Gather sanitized official ZR Express API docs/fixtures first (`verified: true|false` + `source`).
- Implement `zrexpress.spec.ts`, `server.ts`, contract tests, and `SPEC_STATUS.md` entries.
- Wire default port `4004` into CLI `runtime.ts` and `doctor.ts`.
