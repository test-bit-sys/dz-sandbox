---
title: "[good first issue] Populate full 58/69 wilayas & communes in GeoDataset from verified data"
labels: ["good first issue", "mock-yalidine", "data"]
---

## Goal
`packages/mock-yalidine/src/geo-dataset.ts` currently ships a minimal verified subset (8 wilayas, 19 communes, 9 stopdesk centers) behind `GeoDataset`, with `meta.complete = false`.

## Tasks
- Import/integrate a verified complete Algeria wilayas + communes dataset (e.g., `algeria-geo` with clear license attribution) implementing `GeoDataset`.
- Set `meta.complete = true` once all official wilayas and communes are included.
- Update `docs/SPEC_STATUS.md` and add contract tests verifying wilaya <-> commune matching.
