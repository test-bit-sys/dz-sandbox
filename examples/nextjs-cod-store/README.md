# Next.js COD Store Example (Yalidine + dz-sandbox)

Minimal Next.js 15 App Router store (`app/api/orders/cod/route.ts`) demonstrating Cash-On-Delivery parcel validation and failure handling against `mock-yalidine`.

## Prerequisites

- Node.js 20+
- Running `dz-sandbox` (`npx dz-sandbox start` or `node packages/cli/dist/cli.js start`)

## Run

```bash
# Terminal 1 (from repo root)
node packages/cli/dist/cli.js start

# Terminal 2
cd examples/nextjs-cod-store
npm run demo    # Executes app/api/orders/cod/route.ts directly against mock-yalidine offline

# Optional full Next.js UI (peer dependency)
# npm install next react react-dom && npm run build
```

Expected `npm run demo` output:

```text
1) created_ok -> HTTP 201 {"ok":true,...}
2) phone_rejected -> HTTP 422 {"error":"YALIDINE_REJECTED",...}
3) rate_limited -> HTTP 503 {"error":"YALIDINE_REJECTED","upstreamStatus":429,...}
nextjs-cod-store demo OK: happy path 201, phone_rejected->422, rate_limited->503
```

## Try Failure Scenarios Manually

1. Inspect available wilayas/communes:
   ```bash
   curl -H "X-API-ID: test_api_id" -H "X-API-TOKEN: test_api_token" http://127.0.0.1:4003/v1/wilayas
   ```
2. Simulate failures with CLI or control API:
   - `npx dz-sandbox scenario set yalidine phone_rejected` → route returns `422` cleanly.
   - `npx dz-sandbox scenario set yalidine rate_limited` → upstream `429` maps to retryable `503`.
   - `npx dz-sandbox scenario set yalidine lifecycle_fast` + advance virtual clock (`POST /__control/clock/advance {"duration":"10m"}`) → observe status progression in `GET /v1/histories`.
