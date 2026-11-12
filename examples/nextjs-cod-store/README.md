# Next.js COD Store Example (Yalidine + dz-sandbox)

Minimal Next.js App Router API route (`app/api/orders/cod/route.ts`) demonstrating Cash-On-Delivery parcel validation and failure handling against `mock-yalidine`.

## Test Failure Scenarios Locally

1. Start `dz-sandbox` (`npx dz-sandbox start`).
2. Inspect available verified wilayas/communes:
   ```bash
   curl -H "X-API-ID: test_api_id" -H "X-API-TOKEN: test_api_token" http://127.0.0.1:4003/v1/wilayas
   ```
3. Simulate failures with `@dz-sandbox/client` or CLI:
   - `npx dz-sandbox scenario set yalidine phone_rejected` -> verifies your API route returns `422` cleanly.
   - `npx dz-sandbox scenario set yalidine rate_limited` -> verifies `429` triggers `503` retryable response instead of crashing.
   - `npx dz-sandbox scenario set yalidine lifecycle_fast` + advance virtual clock (`POST /__control/clock/advance {"duration":"10m"}`) -> verifies parcel progression in `GET /v1/histories`.
