# 60-Second Visual Demo Storyboard (`dz-sandbox`)

Target recording resolution: `1280x800` (clean desktop terminal + browser side-by-side). Total duration: ~60 seconds.

| Time | Scene | Action / Narration Overlay |
| --- | --- | --- |
| `0:00 – 0:08` | **One-command boot** | Run `npx dz-sandbox start` (or `docker compose up`). Show all 4 local ports booting in <1s offline (`4000` control, `4001` Chargily, `4002` SATIM, `4003` Yalidine). Overlay tagline: *"Test what fails, not just what succeeds."* |
| `0:08 – 0:18` | **Arabic RTL Dashboard** | Open `http://127.0.0.1:4000/` in browser (Arabic RTL default), toggle briefly to French/English, highlight scenario dropdowns and virtual clock controls. |
| `0:18 – 0:36` | **Catch the `duplicate_webhook` bug live** | Run `node examples/express-checkout/demo.mjs` (or `./scripts/demo.sh`). Highlight Chargily `duplicate_webhook` firing twice -> `naive` handler fulfills the order **2 times** (double fulfillment bug), while `idempotent` handler verifies `signature` + deduplicates event IDs -> **1 fulfillment**. |
| `0:36 – 0:48` | **Fake SATIM cards & Yalidine lifecycle** | Submit fake test card `4000000000000001` on SATIM hosted page (`:4002`) -> paid -> partial refund; create Yalidine parcel to `16` (Alger) -> advance virtual clock by `2h` (`POST /__control/clock/advance`) -> parcel jumps `pending -> in_transit -> delivered` instantly. |
| `0:48 – 0:60` | **Reproducible bug report** | Run `npx dz-sandbox export repro.json` and close on `README.md` Quick Start + disclaimer badge (`docs/SPEC_STATUS.md`). |
