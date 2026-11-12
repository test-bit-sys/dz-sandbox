import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MemoryStore,
  ScenarioEngine,
  SeededRNG,
  VirtualClock,
  WebhookDispatcher,
} from '@dz-sandbox/core';
import { MinimalAlgeriaGeoDataset } from './geo-dataset.js';
import { createYalidineServer } from './server.js';
import { YALIDINE_SPEC } from './yalidine.spec.js';

const FixtureSchema = z.object({
  provider: z.literal('yalidine'),
  verified: z.boolean(),
  source: z.string(),
  cases: z.array(
    z.object({
      name: z.string(),
      method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']),
      path: z.string(),
      headers: z.record(z.string(), z.string()).default({}),
      body: z.unknown().optional(),
      expectedStatus: z.number().int(),
      requiredKeys: z.array(z.string()),
    }),
  ),
});

const AUTH = {
  'x-api-id': 'test_id_1',
  'x-api-token': 'test_tok_1',
};

function setupYalidine(fetchImpl?: typeof fetch) {
  const store = new MemoryStore();
  const clock = new VirtualClock();
  const rng = new SeededRNG(303);
  const scenarios = new ScenarioEngine(store);
  const webhooks = new WebhookDispatcher(store, clock, rng, { fetchImpl });
  const app = createYalidineServer({ ctx: { store, clock, rng, scenarios }, webhooks });
  return { app, store, clock, rng, scenarios, webhooks };
}

describe('mock-yalidine contract fixtures', () => {
  it('replays fixtures/yalidine/*.json', async () => {
    const { app } = setupYalidine();
    const dir = path.resolve(__dirname, '../../../fixtures/yalidine');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const fixture = FixtureSchema.parse(JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
      for (const tc of fixture.cases) {
        const res = await app.inject({
          method: tc.method,
          url: tc.path,
          headers: tc.headers,
          payload: tc.body as Record<string, unknown> | undefined,
        });
        expect(res.statusCode, tc.name).toBe(tc.expectedStatus);
        const json = res.json() as Record<string, unknown>;
        for (const k of tc.requiredKeys) {
          expect(json).toHaveProperty(k);
        }
      }
    }
    await app.close();
  });
});

describe('mock-yalidine geo endpoints, validation, and parcel CRUD', () => {
  it('serves wilayas, communes, centers, deliveryfees and enforces strict parcel validation', async () => {
    const { app } = setupYalidine();

    const health = (await app.inject({ method: 'GET', url: '/health' })).json();
    expect(health.dataset.complete).toBe(true);
    expect(health.dataset.totalWilayasIncluded).toBe(69);
    expect(health.dataset.totalCommunesIncluded).toBe(1541);
    expect((await app.inject({ method: 'GET', url: '/v1/wilayas?id=16', headers: AUTH })).json().data).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: '/v1/communes?wilaya_id=16', headers: AUTH })).json().total_data).toBeGreaterThanOrEqual(50);
    expect((await app.inject({ method: 'GET', url: '/v1/centers?wilaya_id=31', headers: AUTH })).json().data).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: '/v1/deliveryfees', headers: AUTH })).json().data.length).toBe(69);
    expect((await app.inject({ method: 'GET', url: '/v1/deliveryfees?from_wilaya_id=16&to_wilaya_id=999', headers: AUTH })).statusCode).toBe(422);

    // Supports Arabic + French wilaya/commune names including era 58/69 wilayas & MinimalAlgeriaGeoDataset fallback
    const arabicParcel = await app.inject({
      method: 'POST',
      url: '/v1/parcels',
      headers: AUTH,
      payload: [{
        order_id: 'AR-58-1',
        from_wilaya_name: 'الجزائر',
        firstname: 'Sami',
        familyname: 'Benali',
        contact_phone: '0550998877',
        address: 'حي المنيعة',
        to_wilaya_name: 'المنيعة',
        to_commune_name: 'المنيعة',
        product_list: 'Router',
        price: 6200,
      }],
    });
    expect(arabicParcel.statusCode).toBe(201);

    const era69Parcel = await app.inject({
      method: 'POST',
      url: '/v1/parcels',
      headers: AUTH,
      payload: [{
        order_id: 'FR-69-1',
        from_wilaya_id: 16,
        firstname: 'Nabil',
        familyname: 'Haddad',
        contact_phone: '+213661223344',
        address: 'Centre Ville',
        to_wilaya_id: 69,
        to_commune_name: 'El Abiodh Sidi Cheikh',
        product_list: 'Solar Kit',
        price: 12000,
      }],
    });
    expect(era69Parcel.statusCode).toBe(201);

    const minimalDs = new MinimalAlgeriaGeoDataset();
    expect(minimalDs.meta.complete).toBe(false);
    expect(minimalDs.findWilaya('Alger')?.id).toBe(16);
    expect(minimalDs.findCommune(16, 'Hydra')?.id).toBe(1603);
    expect(minimalDs.getCommunes()).toHaveLength(19);
    expect(minimalDs.getCenters(16)).toHaveLength(2);
    expect(minimalDs.findCenter(310201)?.wilaya_id).toBe(31);
    expect(minimalDs.getDeliveryFee(16, 31)?.home_fee).toBe(800);

    // Mismatched commune for wilaya
    const badCommune = await app.inject({
      method: 'POST',
      url: '/v1/parcels',
      headers: AUTH,
      payload: [{
        order_id: 'BAD-1',
        firstname: 'Ali',
        familyname: 'Khelifi',
        contact_phone: '0550123456',
        address: 'Rue 1',
        to_wilaya_name: 'Oran',
        commune_name: 'Hydra',
        product_list: 'Book',
        price: 1200,
      }],
    });
    expect(badCommune.statusCode).toBe(422);

    // Invalid phone
    const badPhone = await app.inject({
      method: 'POST',
      url: '/v1/parcels',
      headers: AUTH,
      payload: [{
        order_id: 'BAD-2',
        firstname: 'Ali',
        familyname: 'Khelifi',
        contact_phone: '12345',
        address: 'Rue 1',
        to_wilaya_name: 'Oran',
        commune_name: 'Oran',
        product_list: 'Book',
        price: 1200,
      }],
    });
    expect(badPhone.statusCode).toBe(422);

    // Stopdesk requires valid center in destination wilaya
    const badStopdesk = await app.inject({
      method: 'POST',
      url: '/v1/parcels',
      headers: AUTH,
      payload: [{
        order_id: 'BAD-3',
        firstname: 'Ali',
        familyname: 'Khelifi',
        contact_phone: '0550123456',
        to_wilaya_name: 'Oran',
        commune_name: 'Bir El Djir',
        is_stopdesk: true,
        stopdesk_id: 160101,
        product_list: 'Book',
        price: 1200,
      }],
    });
    expect(badStopdesk.statusCode).toBe(422);

    // Valid stopdesk parcel + CRUD (get, list, patch, delete)
    const okStopdesk = await app.inject({
      method: 'POST',
      url: '/v1/parcels',
      headers: AUTH,
      payload: [{
        order_id: 'OK-SD-1',
        firstname: 'Ali',
        familyname: 'Khelifi',
        contact_phone: '0661123456',
        to_wilaya_id: 31,
        to_commune_name: 'Bir El Djir',
        is_stopdesk: true,
        stopdesk_id: 310201,
        product_list: 'Laptop Bag',
        price: 4500,
      }],
    });
    expect(okStopdesk.statusCode).toBe(201);
    const tracking = okStopdesk.json().data[0].tracking as string;
    expect(tracking).toMatch(/^yal-\d{6}$/);

    expect((await app.inject({ method: 'GET', url: `/v1/parcels/${tracking}`, headers: AUTH })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/v1/parcels?tracking=${tracking}`, headers: AUTH })).json().total_data).toBe(1);
    const patched = await app.inject({
      method: 'PATCH',
      url: `/v1/parcels/${tracking}`,
      headers: AUTH,
      payload: { price: 4800 },
    });
    expect(patched.json().price).toBe(4800);
    expect((await app.inject({ method: 'DELETE', url: `/v1/parcels/${tracking}`, headers: AUTH })).json().deleted).toBe(true);
    expect((await app.inject({ method: 'GET', url: `/v1/parcels/${tracking}`, headers: AUTH })).statusCode).toBe(404);

    await app.close();
  });
});

describe('mock-yalidine lifecycle simulator & delivery scenarios', () => {
  it('simulates lifecycle_fast, returned_to_sender, delivery_failed_retry, status_stuck, and error scenarios', async () => {
    const webhookEvents: Array<{ tracking: string; status: string }> = [];
    const { app, clock, scenarios } = setupYalidine(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { tracking: string; status: string };
      webhookEvents.push({ tracking: body.tracking, status: body.status });
      return new Response('ok', { status: 200 });
    });

    const createOne = async (orderId: string, scenarioHeader?: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/parcels',
        headers: scenarioHeader ? { ...AUTH, 'x-dz-scenario': scenarioHeader } : AUTH,
        payload: {
          order_id: orderId,
          firstname: 'Nabil',
          familyname: 'Bouchama',
          contact_phone: '0770123456',
          address: '10 Rue de la Liberté',
          to_wilaya_name: 'Alger',
          commune_name: 'Hydra',
          product_list: 'Phone Case',
          price: 1800,
          webhook_url: 'http://127.0.0.1:3000/yalidine-hook',
        },
      });
      return res.json().data[0].tracking as string;
    };

    // 1. lifecycle_fast: 15m total -> delivered
    const tFast = await createOne('ORD-FAST', 'lifecycle_fast');
    await clock.advance('15m');
    const fastParcel = (await app.inject({ method: 'GET', url: `/v1/parcels/${tFast}`, headers: AUTH })).json();
    expect(fastParcel.status).toBe(YALIDINE_SPEC.statuses.delivered.label);
    const fastHist = (await app.inject({ method: 'GET', url: `/v1/histories?tracking=${tFast}`, headers: AUTH })).json();
    expect(fastHist.data).toHaveLength(4);
    expect(webhookEvents.some((e) => e.tracking === tFast && e.status === 'Livré')).toBe(true);

    // Delivered parcel cannot be deleted or edited
    expect((await app.inject({ method: 'DELETE', url: `/v1/parcels/${tFast}`, headers: AUTH })).statusCode).toBe(422);
    expect((await app.inject({ method: 'PATCH', url: `/v1/parcels/${tFast}`, headers: AUTH, payload: { price: 100 } })).statusCode).toBe(422);

    // 2. returned_to_sender
    const tRet = await createOne('ORD-RET', 'returned_to_sender');
    await clock.advance('20m');
    const retParcel = (await app.inject({ method: 'GET', url: `/v1/parcels/${tRet}`, headers: AUTH })).json();
    expect(retParcel.status).toBe(YALIDINE_SPEC.statuses.returned.label);

    // 3. delivery_failed_retry
    const tRetry = await createOne('ORD-RETRY', 'delivery_failed_retry');
    await clock.advance('10m');
    expect((await app.inject({ method: 'GET', url: `/v1/parcels/${tRetry}`, headers: AUTH })).json().status).toBe(
      YALIDINE_SPEC.statuses.failedAttempt.label,
    );
    await clock.advance('15m');
    expect((await app.inject({ method: 'GET', url: `/v1/parcels/${tRetry}`, headers: AUTH })).json().status).toBe(
      YALIDINE_SPEC.statuses.delivered.label,
    );

    // 4. status_stuck
    const tStuck = await createOne('ORD-STUCK', 'status_stuck');
    await clock.advance('48h');
    expect((await app.inject({ method: 'GET', url: `/v1/parcels/${tStuck}`, headers: AUTH })).json().status).toBe(
      YALIDINE_SPEC.statuses.pending.label,
    );

    // 5. Scenario rejections: invalid_wilaya, invalid_commune, phone_rejected, rate_limited, auth_failed
    for (const [scen, code] of [
      ['invalid_wilaya', 422],
      ['invalid_commune', 422],
      ['phone_rejected', 422],
      ['rate_limited', 429],
      ['auth_failed', 401],
    ] as const) {
      scenarios.setDefault('yalidine', scen);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/parcels',
        headers: AUTH,
        payload: {},
      });
      expect(res.statusCode, scen).toBe(code);
    }

    // 6. Auth, filters, single-object create, validation error paths, and 404 checks
    scenarios.setDefault('yalidine', 'created_ok');
    expect((await app.inject({ method: 'GET', url: '/v1/wilayas' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/communes', headers: AUTH })).json().total_data).toBeGreaterThanOrEqual(19);
    expect((await app.inject({ method: 'GET', url: '/v1/centers', headers: AUTH })).json().total_data).toBeGreaterThanOrEqual(8);
    expect((await app.inject({ method: 'GET', url: '/v1/deliveryfees', headers: AUTH })).json().total_data).toBeGreaterThanOrEqual(8);
    expect((await app.inject({ method: 'GET', url: '/v1/deliveryfees?from_wilaya_id=16&wilaya_id=16,31', headers: AUTH })).json().total_data).toBe(2);
    expect((await app.inject({ method: 'GET', url: '/v1/parcels', headers: AUTH })).json().total_data).toBeGreaterThanOrEqual(4);
    expect((await app.inject({ method: 'GET', url: '/v1/histories', headers: AUTH })).json().total_data).toBeGreaterThanOrEqual(4);
    expect((await app.inject({ method: 'POST', url: '/v1/parcels', headers: AUTH, payload: [] })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/v1/parcels', headers: AUTH, payload: { invalid: true } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/v1/parcels', headers: AUTH, payload: {
      order_id: 'BAD-ORIG', firstname: 'A', familyname: 'B', contact_phone: '0550123456',
      from_wilaya_id: 999, to_wilaya_id: 16, to_commune_name: 'Alger Centre', product_list: 'P', price: 100, address: 'X',
    } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/v1/parcels', headers: AUTH, payload: {
      order_id: 'BAD-DEST', firstname: 'A', familyname: 'B', contact_phone: '0550123456',
      to_wilaya_id: 999, to_commune_name: 'Alger Centre', product_list: 'P', price: 100, address: 'X',
    } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/v1/parcels', headers: AUTH, payload: {
      order_id: 'BAD-NO-W', firstname: 'A', familyname: 'B', contact_phone: '0550123456',
      to_commune_name: 'Alger Centre', product_list: 'P', price: 100, address: 'X',
    } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/v1/parcels', headers: AUTH, payload: {
      order_id: 'BAD-NO-C', firstname: 'A', familyname: 'B', contact_phone: '0550123456',
      to_wilaya_id: 16, product_list: 'P', price: 100, address: 'X',
    } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/v1/parcels', headers: AUTH, payload: {
      order_id: 'BAD-ADDR', firstname: 'A', familyname: 'B', contact_phone: '0550123456',
      to_wilaya_id: 16, to_commune_name: 'Alger Centre', product_list: 'P', price: 100, address: '   ',
    } })).statusCode).toBe(422);

    // Single object + freeshipping + parcel filters + histories without tracking + 404/422 PATCH/DELETE
    const single = await app.inject({
      method: 'POST',
      url: '/v1/parcels',
      headers: AUTH,
      payload: {
        order_id: 'SINGLE-1',
        firstname: 'Sami',
        familyname: 'B',
        contact_phone: '0770112233',
        to_wilaya_id: 16,
        to_commune_name: 'Alger Centre',
        product_list: 'Book',
        price: 1500,
        freeshipping: true,
        address: 'Rue 1',
      },
    });
    expect(single.statusCode).toBe(201);
    const singleTrack = single.json().data[0].tracking as string;
    expect(single.json().data[0].delivery_fee).toBe(0);
    expect((await app.inject({ method: 'GET', url: '/v1/parcels?order_id=SINGLE-1&last_status=En+pr%C3%A9paration', headers: AUTH })).json().total_data).toBe(1);
    expect((await app.inject({ method: 'PATCH', url: `/v1/parcels/${singleTrack}`, headers: AUTH, payload: { contact_phone: 'bad' } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'PATCH', url: `/v1/parcels/${singleTrack}`, headers: AUTH, payload: { price: -10 } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/v1/parcels/yal-000000', headers: AUTH })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: '/v1/parcels/yal-000000', headers: AUTH, payload: { price: 100 } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/v1/parcels/yal-000000', headers: AUTH })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/histories?status=Livr%C3%A9', headers: AUTH })).json().total_data).toBeGreaterThanOrEqual(2);

    await app.close();
  });

  it('property: phone regex accepts valid 05/06/07/+213 numbers and rejects invalid strings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('05', '06', '07', '+2135', '+2136', '+2137'),
        fc.stringMatching(/^\d{8}$/),
        (prefix, rest) => {
          expect(YALIDINE_SPEC.phoneRegex.test(`${prefix}${rest}`)).toBe(true);
        },
      ),
    );
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-4]{1,12}$/), (bad) => {
        expect(YALIDINE_SPEC.phoneRegex.test(bad)).toBe(false);
      }),
    );
  });

  it('rejects duplicate or orphan commune codes in import-geo Zod schema', () => {
    const scriptCheck = `
      import { validateAndTransformGeo } from './scripts/import-geo.mjs';
      let failed = false;
      try {
        validateAndTransformGeo(
          [{ code: '16', name_ar: 'الجزائر', name_fr: 'Alger', era: 48 }],
          [{ code: '1601', wilaya_code: '99', name_ar: 'بلدية', name_fr: 'Commune' }]
        );
      } catch {
        failed = true;
      }
      if (!failed) process.exit(2);
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', scriptCheck], {
      cwd: path.resolve(__dirname, '../../..'),
    });
  });

  it('property: parcel lifecycle scheduling, deletion gating, and seeded replay remain consistent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10_000 }),
        fc.constantFrom('created_ok', 'lifecycle_fast', 'returned_to_sender', 'delivery_failed_retry', 'status_stuck'),
        fc.boolean(),
        async (seed, scenario, deleteEarly) => {
          const runSim = async () => {
            const store = new MemoryStore();
            const clock = new VirtualClock();
            const rng = new SeededRNG(seed);
            const scenarios = new ScenarioEngine(store);
            const ctx = { store, clock, rng, scenarios };
            scenarios.setDefault('yalidine', scenario);
            const app = createYalidineServer({ ctx });

            const created = await app.inject({
              method: 'POST',
              url: '/v1/parcels',
              headers: { 'x-api-id': 'id', 'x-api-token': 'tok' },
              payload: {
                order_id: 'ORD-FUZZ',
                from_wilaya_id: 16,
                to_wilaya_id: 16,
                commune_name: 'Hydra',
                firstname: 'Ali',
                familyname: 'Boudiaf',
                contact_phone: '0550112233',
                address: 'Rue 1',
                product_list: 'Item',
                price: 1200,
              },
            });
            expect(created.statusCode).toBe(201);
            const tracking = created.json().data[0].tracking as string;

            if (deleteEarly) {
              const del = await app.inject({
                method: 'DELETE',
                url: `/v1/parcels/${tracking}`,
                headers: { 'x-api-id': 'id', 'x-api-token': 'tok' },
              });
              expect(del.statusCode).toBe(200);
            }

            await clock.advance('24h');
            const parcel = await app.inject({
              method: 'GET',
              url: `/v1/parcels/${tracking}`,
              headers: { 'x-api-id': 'id', 'x-api-token': 'tok' },
            });
            await app.close();

            if (deleteEarly) {
              expect(parcel.statusCode).toBe(404);
              return { tracking, finalStatus: 'DELETED' };
            }
            return { tracking, finalStatus: parcel.json().status as string };
          };

          const first = await runSim();
          const second = await runSim();
          expect(first).toEqual(second);
        },
      ),
      { numRuns: 15 },
    );

    // Unsafe webhook_url scheme rejected
    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(1);
    const scenarios = new ScenarioEngine(store);
    const app = createYalidineServer({ ctx: { store, clock, rng, scenarios } });
    const badHook = await app.inject({
      method: 'POST',
      url: '/v1/parcels',
      headers: { 'x-api-id': 'id', 'x-api-token': 'tok' },
      payload: {
        order_id: 'ORD-BADHOOK',
        from_wilaya_id: 16,
        to_wilaya_id: 16,
        commune_name: 'Hydra',
        firstname: 'Ali',
        familyname: 'Boudiaf',
        contact_phone: '0550112233',
        address: 'Rue 1',
        product_list: 'Item',
        price: 1200,
        webhook_url: 'javascript:alert(1)',
      },
    });
    expect(badHook.statusCode).toBe(422);
    await app.close();
  });
});
