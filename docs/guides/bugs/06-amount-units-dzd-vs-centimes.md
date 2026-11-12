# Bug 06: Amount Units Confusion (DZD vs Centimes)

**Reproducing scenario:** `amount_mismatch` (Chargily Pay v2 & SATIM)

## Failing Symptom

Different Algerian gateways use different amount units (and verify against official docs/captures in `SPEC_STATUS.md`):
- Treating DZD as centimes (`× 100`) overcharges customers **100×** (`250,000 DZD` instead of `2,500 DZD`).
- Treating centimes as DZD (`/ 100`) bills **1%** (`25 DZD` instead of `2,500 DZD`) or triggers validation rejection on amounts `< minimum`.

## Fix

Normalize money into integer minor units internally (`amountCentimes` or explicit `{ value, unit }`) and write conversion helpers tested against BOTH `mock-chargily` and `mock-satim`:

```ts
export function toSatimCentimes(dzdInteger: number): number {
  if (!Number.isInteger(dzdInteger) || dzdInteger <= 0) throw new Error('Invalid DZD integer');
  return dzdInteger * 100;
}
```

> Always verify live production unit rules in the official provider docs (`docs/SPEC_STATUS.md`).

## Reproduce Locally

```bash
npx dz-sandbox scenario set satim amount_mismatch
```
