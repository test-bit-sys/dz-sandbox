---
title: "[good first issue] Add copy-as-Python/fetch snippet buttons alongside Copy as cURL in dashboard"
labels: ["good first issue", "dashboard", "dx"]
---

## Goal
In `packages/control/src/dashboard.ts`, the Requests tab currently lets developers copy logged requests as `cURL`.

## Tasks
- Add a dropdown or secondary button next to `Copy as cURL` to copy requests as Node `fetch(...)` or Python `requests`/`urllib` snippets.
- Add localized labels in `packages/control/src/locales/{ar,fr,en}.json`.
- Keep zero external dependencies and add unit checks in `packages/control/src/control.test.ts`.
