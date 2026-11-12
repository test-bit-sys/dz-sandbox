---
title: "[good first issue] Add Tamazight (kab / ber) UI locale file for the dashboard"
labels: ["good first issue", "i18n", "dashboard"]
---

## Goal
The control dashboard stores all labels in `packages/control/src/locales/{ar,fr,en}.json` and dynamically switches language & direction.

## Tasks
- Add `packages/control/src/locales/kab.json` (or `tzm.json`) with complete key parity matching `en.json`.
- Wire the language switcher option in `packages/control/src/dashboard.ts` and `server.ts`.
- Add test coverage in `packages/control/src/control.test.ts`.
