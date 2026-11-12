import { describe, expect, it } from 'vitest';
import { MemoryStore, ScenarioEngine, SeededRNG, VirtualClock } from '@dz-sandbox/core';
import { createZrExpressServer, ZREXPRESS_SPEC } from './index.js';

describe('@dz-sandbox/mock-zrexpress honest scaffold', () => {
  it('marks spec unverified, exposes health, wires scenario engine, and returns 501 instead of fabricated endpoints', async () => {
    expect(ZREXPRESS_SPEC.verified).toBe(false);
    expect(ZREXPRESS_SPEC.status).toBe('scaffold');
    expect(Object.keys(ZREXPRESS_SPEC.endpoints)).toHaveLength(0);

    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(1);
    const scenarios = new ScenarioEngine(store);
    const app = createZrExpressServer({ ctx: { store, clock, rng, scenarios } });

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({
      status: 'ok',
      service: 'mock-zrexpress',
      scaffold: true,
      verified: false,
    });

    const unimplemented = await app.inject({ method: 'POST', url: '/any/path' });
    expect(unimplemented.statusCode).toBe(501);
    expect(unimplemented.json().error).toBe('NOT_IMPLEMENTED_AWAITING_SPEC');
    expect(unimplemented.json().verified).toBe(false);

    const scenarioErr = await app.inject({
      method: 'GET',
      url: '/any/path',
      headers: { 'x-dz-scenario': 'gateway_500' },
    });
    expect(scenarioErr.statusCode).toBe(500);

    expect(store.queryRequestLogs({ provider: 'zrexpress' }).length).toBeGreaterThanOrEqual(2);
    await app.close();
    store.close();
  });
});
