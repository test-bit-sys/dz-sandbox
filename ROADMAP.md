# Roadmap

## v0.1.0 (Current Foundation)

- [x] Deterministic core (`VirtualClock`, `SeededRNG`, `ScenarioEngine`, `WebhookDispatcher`, `MemoryStore` + `SqliteStore`)
- [x] Control API (`/__control/*` + OpenAPI 3.1.0) & offline RTL-default AR/FR/EN dashboard
- [x] `mock-chargily` (Chargily Pay v2 surface verified against `@chargily/chargily-pay@2.1.0`)
- [x] `mock-satim` (SATIM flow structure + fake cards behind `satim.spec.ts`, awaiting official bank PDF verification)
- [x] `mock-yalidine` (parcel CRUD/validation + virtual-clock lifecycle; minimal verified geo subset pending `algeria-geo`)
- [x] `@dz-sandbox/client`, Python stdlib client (`dz-sandbox`), CLI (`dz-sandbox start|doctor|...`), Docker & CI

## v0.2.0 (Spec Hardening & Full Geo Data)

- [ ] Upgrade `mock-satim` endpoints, `errorCode`, `actionCode`, `respCode`, and `jsonParams` using official SATIM merchant technical guide
- [ ] Populate full 58/69 wilayas + ~1541 communes in `mock-yalidine` from `algeria-geo` without guessing
- [ ] Record live redacted Chargily Pay v2 test-mode captures to upgrade partial error envelopes & webhook event fixtures
- [ ] Verify whether Yalidine v1 supports native push webhooks or remains polling-only

## v0.3.0+ (Ecosystem Expansion)

- [ ] Additional courier adapters (`mock-zrexpress`, `mock-maystro`, `mock-ecotrack`) — see `docs/adding-a-provider.md`
- [ ] BaridiMob / Algerie Poste flow investigation (pending official API availability)
- [ ] GitHub Action (`setup-dz-sandbox`) for one-line CI checkout/delivery testing in merchant repos
- [ ] Hosted chaos presets (Eid peak traffic bursts, intermittent 3DS timeouts, webhook replay storms)
