# Bug 08: Parcel Polling Stuck Forever & Unhandled Return-to-Sender

**Reproducing scenarios:** `status_stuck`, `lifecycle_fast`, `returned_to_sender`, `delivery_failed_retry`

## Failing Symptom

Many COD backends only model `pending -> delivered`, so:
- A parcel stuck in `En préparation` for 7 days (`status_stuck`) never alerts operations.
- A parcel returning via `Échec livraison -> Retourné au vendeur` (`returned_to_sender`) never restocks inventory.

## Fix

Model full courier lifecycle transitions (`pending -> in_transit -> failed_attempt -> delivered | returned_to_sender`), add SLA aging alerts for `status_stuck`, and restock inventory **only once** upon `returned_to_sender`.

## Reproduce Locally

```bash
npx dz-sandbox scenario set yalidine returned_to_sender
# Create parcel on http://127.0.0.1:4003/v1/parcels, then advance virtual clock:
curl -X POST http://127.0.0.1:4000/__control/clock/advance -d '{"duration":"2h"}'
```
