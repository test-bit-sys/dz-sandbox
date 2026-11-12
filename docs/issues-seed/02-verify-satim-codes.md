---
title: "[good first issue] Verify SATIM errorCode/actionCode/respCode table against official guide"
labels: ["good first issue", "mock-satim", "verification"]
---

## Goal
All SATIM endpoint names, parameters (`register.do`, `confirmOrder.do`, `refund.do`), and response codes in `packages/mock-satim/src/satim.spec.ts` are currently marked `verified: false`.

## Tasks
- Using an official SATIM / acquiring bank merchant guide (never uploading confidential bank PDFs), verify exact field names, `jsonParams`, `orderStatus`, `errorCode`, `actionCode`, and `respCode` mappings.
- Update `packages/mock-satim/src/satim.spec.ts`, add redacted contract fixtures in `fixtures/satim/` with `verified: true` + `source`, and update `docs/SPEC_STATUS.md`.
