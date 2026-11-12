# Bug 09: Invalid Wilaya / Commune & Rejected Algerian Phone Numbers

**Reproducing scenarios:** `invalid_wilaya`, `phone_rejected` (Yalidine)

## Failing Symptom

Accepting free-text city names or unvalidated phone formats (`+213 55 12 34` / wrong digits / legacy vs 69-wilaya codes) lets checkout finish, then **courier label creation fails with HTTP 422** during warehouse dispatch!

## Fix

Validate delivery fields at **checkout form time** using exact wilaya IDs (`1..69` across `era=48|58|69`), valid commune names belonging to that wilaya, and normalized 10-digit Algerian mobile formats (`05/06/07XXXXXXXX`). See `examples/nextjs-cod-store`!

## Reproduce Locally

```bash
npx dz-sandbox scenario set yalidine phone_rejected
npm run examples:smoke # Observes HTTP 422 validation error from mock-yalidine
```
