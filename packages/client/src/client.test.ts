import { describe, expect, it } from 'vitest';
import {
  MemoryStore,
  ScenarioEngine,
  SeededRNG,
  VirtualClock,
  WebhookDispatcher,
} from '@dz-sandbox/core';
import { createControlServer } from '@dz-sandbox/control';
import { createSandboxClient, pointChargilyClientToSandbox } from './index.js';

describe('@dz-sandbox/client', () => {
  it('controls reset, scenario, webhook waiting, clock advance, export/import over HTTP', async () => {
    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(11);
    const scenarios = new ScenarioEngine(store);
    const webhooks = new WebhookDispatcher(store, clock, rng, {
      fetchImpl: async () => new Response('ok', { status: 200 }),
    });
    const app = createControlServer({ store, clock, rng, scenarios, webhooks });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (!addr || typeof addr !== 'object') throw new Error('Expected address');
    const client = createSandboxClient({ controlUrl: `http://127.0.0.1:${addr.port}` });

    await client.reset();
    await client.scenario('chargily', 'duplicate_webhook');
    await client.resourceScenario('chargily', 'chk_1', 'declined');
    await client.sequence('satim', ['gateway_500', 'success'], false);

    const st = await client.state();
    expect((st.defaults as Record<string, string>).chargily).toBe('duplicate_webhook');

    await client.trigger('chargily', 'checkout.paid', {
      targetUrl: 'http://127.0.0.1:9999/hook',
      payload: { id: 'chk_1' },
    });

    const hooks = await client.waitForWebhook({
      provider: 'chargily',
      eventType: 'checkout.paid',
      count: 1,
      timeoutMs: 1000,
    });
    expect(hooks).toHaveLength(1);
    await client.redeliverWebhook(hooks[0]!.id);

    const adv = await client.clock.advance('2h');
    expect(adv.ok).toBe(true);
    await client.clock.reset();

    const bundle = await client.exportBundle();
    await client.reset();
    await client.importBundle(bundle);
    expect(await client.requests({ provider: 'chargily' })).toEqual([]);

    await expect(
      client.waitForWebhook({ provider: 'yalidine', count: 1, timeoutMs: 80, pollIntervalMs: 20 }),
    ).rejects.toThrow(/Timed out/);

    const dummySdk = { base_url: 'https://pay.chargily.net/test/api/v2' };
    pointChargilyClientToSandbox(dummySdk, 'http://127.0.0.1:4001/api/v2/');
    expect(dummySdk.base_url).toBe('http://127.0.0.1:4001/api/v2');

    await app.close();
  });
});
