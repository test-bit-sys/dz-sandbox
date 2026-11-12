import { describe, expect, it } from 'vitest';
import {
  MemoryStore,
  ScenarioEngine,
  SeededRNG,
  VirtualClock,
  WebhookDispatcher,
} from '@dz-sandbox/core';
import { createControlServer } from './server.js';

describe('Control API', () => {
  function setup() {
    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(42);
    const scenarios = new ScenarioEngine(store);
    const webhooks = new WebhookDispatcher(store, clock, rng, {
      fetchImpl: async () => new Response('accepted', { status: 202 }),
    });
    const app = createControlServer({ store, clock, rng, scenarios, webhooks });
    return { app, store, clock, rng, scenarios, webhooks };
  }

  it('serves health, state, scenarios, and OpenAPI spec', async () => {
    const { app } = setup();
    const health = await app.inject({ method: 'GET', url: '/__control/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json().status).toBe('ok');

    const openapi = await app.inject({ method: 'GET', url: '/__control/openapi.json' });
    expect(openapi.statusCode).toBe(200);
    expect(openapi.json().openapi).toBe('3.1.0');

    const scenariosRes = await app.inject({ method: 'GET', url: '/__control/scenarios' });
    expect(scenariosRes.statusCode).toBe(200);
    expect(scenariosRes.json().scenarios.length).toBeGreaterThanOrEqual(25);

    const stateRes = await app.inject({ method: 'GET', url: '/__control/state' });
    expect(stateRes.statusCode).toBe(200);
    expect(stateRes.json().storeType).toBe('memory');
    await app.close();
  });

  it('sets provider, resource, and sequence scenarios, triggers webhooks, and advances clock', async () => {
    const { app, clock } = setup();

    const setProv = await app.inject({
      method: 'PUT',
      url: '/__control/scenario/chargily',
      payload: { scenario: 'duplicate_webhook' },
    });
    expect(setProv.statusCode).toBe(200);

    const setRes = await app.inject({
      method: 'PUT',
      url: '/__control/scenario/chargily/chk_100',
      payload: { scenario: 'declined' },
    });
    expect(setRes.statusCode).toBe(200);

    const trig = await app.inject({
      method: 'POST',
      url: '/__control/trigger/chargily/checkout.paid',
      payload: { targetUrl: 'http://127.0.0.1:9999/webhook', payload: { id: 'chk_1' } },
    });
    expect(trig.statusCode).toBe(200);
    const whId = trig.json().webhooks[0].id as string;

    const hooks = await app.inject({ method: 'GET', url: '/__control/webhooks' });
    expect(hooks.json().count).toBe(1);

    const redeliver = await app.inject({
      method: 'POST',
      url: `/__control/webhooks/${whId}/redeliver`,
    });
    expect(redeliver.statusCode).toBe(200);
    expect(redeliver.json().webhook.attempts).toHaveLength(2);

    let fired = false;
    clock.schedule(3_600_000, () => {
      fired = true;
    });
    const adv = await app.inject({
      method: 'POST',
      url: '/__control/clock/advance',
      payload: { duration: '1h' },
    });
    expect(adv.statusCode).toBe(200);
    expect(adv.json().firedCount).toBe(1);
    expect(fired).toBe(true);

    await app.close();
  });

  it('exports, resets, and imports a reproducible bundle', async () => {
    const { app, store } = setup();
    store.setResource('chargily:checkouts', 'chk_x', { id: 'chk_x', amount: 4200 });
    await app.inject({
      method: 'PUT',
      url: '/__control/scenario/satim',
      payload: { sequence: ['gateway_500', 'success'], loop: false },
    });

    const exported = await app.inject({ method: 'GET', url: '/__control/export' });
    expect(exported.statusCode).toBe(200);
    const bundle = exported.json();

    const resetRes = await app.inject({ method: 'POST', url: '/__control/reset' });
    expect(resetRes.statusCode).toBe(200);
    expect(store.getResource('chargily:checkouts', 'chk_x')).toBeUndefined();

    const importRes = await app.inject({
      method: 'POST',
      url: '/__control/import',
      payload: bundle,
    });
    expect(importRes.statusCode).toBe(200);
    expect(store.getResource<{ amount: number }>('chargily:checkouts', 'chk_x')?.amount).toBe(4200);
    expect(store.listSequenceScenarios().satim?.steps).toEqual(['gateway_500', 'success']);

    // Additional control edge routes & validation paths
    const rootHtml = await app.inject({ method: 'GET', url: '/' });
    expect(rootHtml.statusCode).toBe(200);
    expect(rootHtml.body).toContain('dir="rtl"');
    expect(rootHtml.body).toContain('dz-sandbox');

    const arLoc = await app.inject({ method: 'GET', url: '/locales/ar.json' });
    expect(arLoc.statusCode).toBe(200);
    expect(arLoc.json().dir).toBe('rtl');
    expect((await app.inject({ method: 'GET', url: '/locales/xx.json' })).statusCode).toBe(404);

    const badScenario = await app.inject({
      method: 'POST',
      url: '/__control/scenarios',
      payload: { name: 'invalid name!' },
    });
    expect(badScenario.statusCode).toBe(400);

    const goodScenario = await app.inject({
      method: 'POST',
      url: '/__control/scenarios',
      payload: {
        name: 'custom_slow',
        provider: 'chargily',
        category: 'network',
        behavior: { latencyMs: 50 },
      },
    });
    expect(goodScenario.statusCode).toBe(201);

    const delRes = await app.inject({
      method: 'DELETE',
      url: '/__control/scenario/chargily/chk_missing',
    });
    expect(delRes.statusCode).toBe(200);

    const reqLogs = await app.inject({ method: 'GET', url: '/__control/requests?provider=chargily' });
    expect(reqLogs.statusCode).toBe(200);

    const badRedeliver = await app.inject({
      method: 'POST',
      url: '/__control/webhooks/missing_id/redeliver',
    });
    expect(badRedeliver.statusCode).toBe(404);

    const badClock = await app.inject({
      method: 'POST',
      url: '/__control/clock/advance',
      payload: { duration: 'invalid' },
    });
    expect(badClock.statusCode).toBe(400);

    const resetClock = await app.inject({ method: 'POST', url: '/__control/clock/reset' });
    expect(resetClock.statusCode).toBe(200);

    const badTrigger = await app.inject({
      method: 'POST',
      url: '/__control/trigger/chargily/checkout.paid',
      payload: {},
    });
    expect(badTrigger.statusCode).toBe(400);

    const badImport = await app.inject({
      method: 'POST',
      url: '/__control/import',
      payload: { version: 2 },
    });
    expect(badImport.statusCode).toBe(400);

    await app.close();
  });
});
