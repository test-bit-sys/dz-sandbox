import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ChargilyClient, verifySignature } from '@chargily/chargily-pay';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MemoryStore,
  ScenarioEngine,
  SeededRNG,
  VirtualClock,
  WebhookDispatcher,
} from '@dz-sandbox/core';
import { createChargilyServer } from './server.js';

const FixtureFileSchema = z.object({
  provider: z.literal('chargily'),
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

function setupChargily(fetchImpl?: typeof fetch) {
  const store = new MemoryStore();
  const clock = new VirtualClock();
  const rng = new SeededRNG(101);
  const scenarios = new ScenarioEngine(store);
  const webhooks = new WebhookDispatcher(store, clock, rng, { fetchImpl });
  const app = createChargilyServer({ ctx: { store, clock, rng, scenarios }, webhooks });
  return { app, store, clock, rng, scenarios, webhooks };
}

describe('mock-chargily contract fixtures', () => {
  it('replays all fixtures/chargily/*.json and enforces verified source rule', async () => {
    const { app } = setupChargily();
    const fixturesDir = path.resolve(__dirname, '../../../fixtures/chargily');
    const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const raw = JSON.parse(readFileSync(path.join(fixturesDir, file), 'utf8')) as unknown;
      const fixture = FixtureFileSchema.parse(raw);
      if (fixture.verified) {
        expect(fixture.source.trim().length).toBeGreaterThan(0);
      }

      for (const testCase of fixture.cases) {
        const res = await app.inject({
          method: testCase.method,
          url: testCase.path,
          headers: testCase.headers,
          payload: testCase.body as Record<string, unknown> | undefined,
        });
        expect(res.statusCode, `${file}:${testCase.name}`).toBe(testCase.expectedStatus);
        const json = res.json() as Record<string, unknown>;
        for (const key of testCase.requiredKeys) {
          expect(json, `${file}:${testCase.name} missing ${key}`).toHaveProperty(key);
        }
      }
    }

    await app.close();
  });
});

describe('mock-chargily CRUD & official @chargily/chargily-pay SDK compatibility', () => {
  let activeApp: ReturnType<typeof setupChargily>['app'] | undefined;

  afterEach(async () => {
    if (activeApp) {
      await activeApp.close();
      activeApp = undefined;
    }
  });

  it('works with official ChargilyClient and verifySignature helper', async () => {
    const receivedHooks: Array<{ raw: string; sig: string }> = [];
    const { app } = setupChargily(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      receivedHooks.push({
        raw: String(init?.body ?? ''),
        sig: headers.signature ?? '',
      });
      return new Response('ok', { status: 200 });
    });
    activeApp = app;

    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (!addr || typeof addr !== 'object') throw new Error('Expected listening address');
    const baseUrl = `http://127.0.0.1:${addr.port}/api/v2`;

    const secret = 'test_sk_official_sdk_key';
    const client = new ChargilyClient({ api_key: secret, mode: 'test' });
    // ChargilyClient hardcodes base_url in constructor; override for local sandbox
    (client as unknown as { base_url: string }).base_url = baseUrl;

    const customer = await client.createCustomer({
      name: 'Amine',
      email: 'amine@example.dz',
      phone: '0551234567',
    });
    expect(customer.id).toMatch(/^cus_/);
    const updatedCustomer = await client.updateCustomer(customer.id, { name: 'Amine Updated' });
    expect(updatedCustomer.name).toBe('Amine Updated');

    const product = await client.createProduct({ name: 'T-Shirt DZ' });
    const price = await client.createPrice({
      amount: 3200,
      currency: 'dzd',
      product_id: product.id,
    });
    const prodPrices = await client.getProductPrices(product.id);
    expect(prodPrices.data).toHaveLength(1);

    const link = await client.createPaymentLink({
      name: 'Promo Link',
      items: [{ price: price.id, quantity: 2 }],
    });
    expect(link.id).toMatch(/^plnk_/);
    const linkItems = await client.getPaymentLinkItems(link.id);
    expect(linkItems.data).toHaveLength(1);

    const checkout = await client.createCheckout({
      items: [{ price: price.id, quantity: 2 }],
      payment_method: 'cib',
      success_url: 'http://127.0.0.1:3000/ok',
      failure_url: 'http://127.0.0.1:3000/ko',
      webhook_endpoint: 'http://127.0.0.1:3000/webhook',
      customer_id: customer.id,
      locale: 'fr',
      metadata: { orderId: 'ORD-77' },
    });
    expect(checkout.amount).toBe(6400);
    expect(checkout.status).toBe('pending');
    expect(checkout.checkout_url).toContain(`/pay/chargily/${checkout.id}`);

    const items = await client.getCheckoutItems(checkout.id);
    expect(items.data).toHaveLength(1);

    // Visit hosted payment page
    const pageRes = await fetch(checkout.checkout_url);
    expect(pageRes.status).toBe(200);
    const html = await pageRes.text();
    expect(html).toContain(checkout.id);

    // Simulate user clicking Pay on hosted page
    const actionRes = await fetch(`${checkout.checkout_url}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ action: 'success' }),
    });
    expect(actionRes.status).toBe(200);

    const after = await client.getCheckout(checkout.id);
    expect(after.status).toBe('paid');

    const balance = await client.getBalance();
    expect(balance.wallets[0]?.balance).toBe(6400);

    // Verify signature using Chargily's own verifySignature()!
    expect(receivedHooks).toHaveLength(1);
    const hook = receivedHooks[0]!;
    expect(verifySignature(Buffer.from(hook.raw, 'utf8'), hook.sig, secret)).toBe(true);
    const parsedEvent = JSON.parse(hook.raw) as { type: string; data: { id: string; status: string } };
    expect(parsedEvent.type).toBe('checkout.paid');
    expect(parsedEvent.data.id).toBe(checkout.id);
  });

  it('covers checkout expire, updates, deletes, and pagination', async () => {
    const { app } = setupChargily();
    activeApp = app;

    const headers = { authorization: 'Bearer test_sk_crud' };
    const cRes = await app.inject({
      method: 'POST',
      url: '/test/api/v2/customers',
      headers,
      payload: { name: 'Salim' },
    });
    const cid = cRes.json().id as string;
    expect((await app.inject({ method: 'GET', url: `/test/api/v2/customers/${cid}`, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/test/api/v2/customers/${cid}`, headers })).json().deleted).toBe(true);

    const pRes = await app.inject({
      method: 'POST',
      url: '/api/v2/products',
      headers,
      payload: { name: 'Item' },
    });
    const pid = pRes.json().id as string;
    await app.inject({ method: 'POST', url: `/api/v2/products/${pid}`, headers, payload: { name: 'Item 2' } });
    expect((await app.inject({ method: 'GET', url: `/api/v2/products/${pid}`, headers })).json().name).toBe('Item 2');

    const prRes = await app.inject({
      method: 'POST',
      url: '/api/v2/prices',
      headers,
      payload: { amount: 500, currency: 'dzd', product_id: pid },
    });
    const prid = prRes.json().id as string;
    await app.inject({ method: 'POST', url: `/api/v2/prices/${prid}`, headers, payload: { metadata: { tag: 'v2' } } });
    expect((await app.inject({ method: 'GET', url: `/api/v2/prices/${prid}`, headers })).json().metadata.tag).toBe('v2');

    const chk = await app.inject({
      method: 'POST',
      url: '/api/v2/checkouts',
      headers,
      payload: { amount: 500, currency: 'dzd', success_url: 'http://127.0.0.1/ok' },
    });
    const chkId = chk.json().id as string;
    const exp = await app.inject({ method: 'POST', url: `/api/v2/checkouts/${chkId}/expire`, headers });
    expect(exp.json().status).toBe('expired');
    const expAgain = await app.inject({ method: 'POST', url: `/api/v2/checkouts/${chkId}/expire`, headers });
    expect(expAgain.statusCode).toBe(422);

    // 404s, 422s, payment link updates, hosted page locales & redirect
    expect((await app.inject({ method: 'GET', url: '/api/v2/customers/cus_missing', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: '/api/v2/customers/cus_missing', headers, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/v2/customers/cus_missing', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/v2/customers', headers, payload: { email: 'not-email' } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/api/v2/products/prod_missing', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/v2/products/prod_missing', headers, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/v2/products/prod_missing', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/v2/products', headers, payload: {} })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/api/v2/prices/prc_missing', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/v2/prices', headers, payload: { amount: 100, currency: 'dzd', product_id: 'prod_missing' } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/api/v2/checkouts/chk_missing', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v2/checkouts/chk_missing/items', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/v2/checkouts/chk_missing/expire', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/pay/chargily/chk_missing' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/pay/chargily/chk_missing/action', payload: { action: 'success' } })).statusCode).toBe(404);

    // Payment link update & list + English/Arabic hosted page + 302 redirect
    const pl = await app.inject({
      method: 'POST',
      url: '/api/v2/payment-links',
      headers,
      payload: { name: 'Link 1', items: [{ price: prid, quantity: 1 }], locale: 'en' },
    });
    const plId = pl.json().id as string;
    await app.inject({ method: 'POST', url: `/api/v2/payment-links/${plId}`, headers, payload: { name: 'Link 1b' } });
    expect((await app.inject({ method: 'GET', url: `/api/v2/payment-links/${plId}`, headers })).json().name).toBe('Link 1b');
    expect((await app.inject({ method: 'GET', url: '/api/v2/payment-links', headers })).json().total).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/api/v2/payment-links/plnk_missing', headers })).statusCode).toBe(404);

    const chkEn = await app.inject({
      method: 'POST',
      url: '/api/v2/checkouts',
      headers,
      payload: { amount: 500, currency: 'dzd', success_url: 'http://127.0.0.1/ok', locale: 'en' },
    });
    const chkEnId = chkEn.json().id as string;
    const enHtml = await app.inject({ method: 'GET', url: `/pay/chargily/${chkEnId}` });
    expect(enHtml.body).toContain('Pay Now (Success)');
    const redirectRes = await app.inject({
      method: 'POST',
      url: `/pay/chargily/${chkEnId}/action`,
      payload: { action: 'success' },
    });
    expect(redirectRes.statusCode).toBe(302);
    expect(redirectRes.headers.location).toBe('http://127.0.0.1/ok');

    expect((await app.inject({ method: 'DELETE', url: `/api/v2/products/${pid}`, headers })).json().deleted).toBe(true);
  });
});

describe('mock-chargily failure & webhook scenarios', () => {
  it('simulates declined, cancelled, duplicate_webhook, delayed_webhook, out_of_order, bad_sig, never_sent, double_charge', async () => {
    const delivered: Array<{ type: string; sig: string; body: string }> = [];
    const { app, clock, scenarios } = setupChargily(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      delivered.push({
        type: (JSON.parse(String(init?.body)) as { type: string }).type,
        sig: headers.signature ?? '',
        body: String(init?.body ?? ''),
      });
      return new Response('ok', { status: 200 });
    });

    const headers = { authorization: 'Bearer test_sk_scen' };
    const createChk = async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/checkouts',
        headers,
        payload: {
          amount: 1000,
          currency: 'dzd',
          success_url: 'http://127.0.0.1:3000/ok',
          failure_url: 'http://127.0.0.1:3000/ko',
          webhook_endpoint: 'http://127.0.0.1:3000/hook',
        },
      });
      return res.json().id as string;
    };

    // 1. Declined
    const idDeclined = await createChk();
    const resDec = await app.inject({
      method: 'POST',
      url: `/pay/chargily/${idDeclined}/action`,
      headers: { accept: 'application/json' },
      payload: { action: 'declined' },
    });
    expect(resDec.json().checkout.status).toBe('failed');
    expect(delivered.at(-1)?.type).toBe('checkout.failed');

    // 2. Cancelled
    const idCancel = await createChk();
    const resCan = await app.inject({
      method: 'POST',
      url: `/pay/chargily/${idCancel}/action`,
      headers: { accept: 'application/json' },
      payload: { action: 'user_cancelled' },
    });
    expect(resCan.json().checkout.status).toBe('canceled');
    expect(delivered.at(-1)?.type).toBe('checkout.canceled');

    // 3. Duplicate webhook
    const idDup = await createChk();
    scenarios.setResourceScenario('chargily', idDup, 'duplicate_webhook');
    const beforeDup = delivered.length;
    await app.inject({
      method: 'POST',
      url: `/pay/chargily/${idDup}/action`,
      headers: { accept: 'application/json' },
    });
    expect(delivered.length - beforeDup).toBe(2);

    // 4. Delayed webhook via VirtualClock
    const idDelay = await createChk();
    scenarios.setResourceScenario('chargily', idDelay, 'delayed_webhook');
    const beforeDelay = delivered.length;
    await app.inject({
      method: 'POST',
      url: `/pay/chargily/${idDelay}/action`,
      headers: { accept: 'application/json' },
    });
    expect(delivered.length).toBe(beforeDelay);
    await clock.advance('30s');
    expect(delivered.length).toBe(beforeDelay + 1);

    // 5. Out-of-order webhooks
    const idOoo = await createChk();
    scenarios.setResourceScenario('chargily', idOoo, 'out_of_order_webhooks');
    const beforeOoo = delivered.length;
    await app.inject({
      method: 'POST',
      url: `/pay/chargily/${idOoo}/action`,
      headers: { accept: 'application/json' },
    });
    expect(delivered.slice(beforeOoo).map((d) => d.type)).toEqual([
      'checkout.paid',
      'checkout.processing',
    ]);

    // 6. Bad signature
    const idBadSig = await createChk();
    scenarios.setResourceScenario('chargily', idBadSig, 'webhook_bad_signature');
    await app.inject({
      method: 'POST',
      url: `/pay/chargily/${idBadSig}/action`,
      headers: { accept: 'application/json' },
    });
    const lastBad = delivered.at(-1)!;
    expect(() =>
      verifySignature(Buffer.from(lastBad.body, 'utf8'), lastBad.sig, 'test_sk_scen'),
    ).toThrow();

    // 7. Webhook never sent
    const idNever = await createChk();
    scenarios.setResourceScenario('chargily', idNever, 'webhook_never_sent');
    const beforeNever = delivered.length;
    await app.inject({
      method: 'POST',
      url: `/pay/chargily/${idNever}/action`,
      headers: { accept: 'application/json' },
    });
    expect(delivered.length).toBe(beforeNever);

    // 8. Double charge attempt on already-paid checkout
    const resDouble = await app.inject({
      method: 'POST',
      url: `/pay/chargily/${idNever}/action`,
      headers: { accept: 'application/json', 'x-dz-scenario': 'double_charge_attempt' },
    });
    expect(resDouble.statusCode).toBe(409);

    // 9. Network & validation error scenarios on API calls
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v2/balance',
          headers: { ...headers, 'x-dz-scenario': 'gateway_500' },
        })
      ).statusCode,
    ).toBe(500);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v2/balance',
          headers: { ...headers, 'x-dz-scenario': 'auth_failed' },
        })
      ).statusCode,
    ).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v2/balance' })).statusCode).toBe(401);

    // Validation & 404 errors across endpoints + /test/api/v2 alias + AR/FR hosted pages
    expect((await app.inject({ method: 'GET', url: '/test/api/v2/balance', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v2/customers', headers, payload: { name: 123 } })).statusCode).toBe(422);
    const custFull = await app.inject({ method: 'POST', url: '/api/v2/customers', headers, payload: { name: 'Karim', address: { address: 'Rue 1', state: 'Oran', country: 'DZ' } } });
    const custFullId = custFull.json().id as string;
    expect((await app.inject({ method: 'PATCH', url: `/api/v2/customers/${custFullId}`, headers, payload: { address: { address: 'Rue 2' } } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: `/api/v2/customers/${custFullId}`, headers, payload: { name: 999 } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/api/v2/customers', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v2/customers/missing', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: '/api/v2/customers/missing', headers, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/v2/customers/missing', headers })).statusCode).toBe(404);
    const prodOk = await app.inject({ method: 'POST', url: '/api/v2/products', headers, payload: { name: 'Prod Valid' } });
    const prodOkId = prodOk.json().id as string;
    expect((await app.inject({ method: 'POST', url: `/api/v2/products/${prodOkId}`, headers, payload: { name: 999 } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/api/v2/products', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v2/products/missing', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/v2/products', headers, payload: {} })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/api/v2/products/missing', headers, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/v2/products/missing', headers })).statusCode).toBe(404);
    const priceOk = await app.inject({ method: 'POST', url: '/api/v2/prices', headers, payload: { amount: 1200, currency: 'dzd', product_id: prodOkId } });
    const priceOkId = priceOk.json().id as string;
    expect((await app.inject({ method: 'GET', url: '/api/v2/prices' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v2/prices', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/v2/prices/${priceOkId}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/api/v2/prices/${priceOkId}`, headers, payload: { metadata: 'bad' } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/api/v2/prices', headers, payload: {} })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/api/v2/prices', headers, payload: { amount: 1000, currency: 'dzd', product_id: 'prod_missing' } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/api/v2/prices/missing', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/v2/prices/missing', headers, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v2/checkouts?per_page=1&page=1', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v2/checkouts', headers, payload: { currency: 'dzd' } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/api/v2/checkouts', headers, payload: { items: [{ price: 'price_missing', quantity: 1 }], success_url: 'http://127.0.0.1/ok' } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/api/v2/checkouts/missing', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/v2/checkouts/missing/expire', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v2/checkouts/missing/items', headers })).statusCode).toBe(404);
    const plOk = await app.inject({ method: 'POST', url: '/api/v2/payment-links', headers, payload: { name: 'Link Valid', items: [{ price: priceOkId, quantity: 1 }] } });
    const plOkId = plOk.json().id as string;
    expect((await app.inject({ method: 'POST', url: `/api/v2/payment-links/${plOkId}`, headers, payload: { locale: 'xx' } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/api/v2/payment-links', headers, payload: {} })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/api/v2/payment-links', headers, payload: { name: 'Bad', items: [{ price: 'price_missing', quantity: 1 }] } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/api/v2/payment-links/missing', headers, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v2/payment-links/missing/items', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v2/customers' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v2/products' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v2/checkouts' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v2/payment-links' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v2/payment-links/${plOkId}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/api/v2/payment-links/${plOkId}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v2/payment-links/${plOkId}/items` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v2/checkouts/any` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/api/v2/checkouts/any/expire` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v2/checkouts/any/items` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v2/customers/${custFullId}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PATCH', url: `/api/v2/customers/${custFullId}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: `/api/v2/customers/${custFullId}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v2/products/${prodOkId}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/api/v2/products/${prodOkId}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: `/api/v2/products/${prodOkId}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/api/v2/prices/${priceOkId}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/pay/chargily/chk_missing' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/pay/chargily/chk_missing/action', payload: { action: 'success' } })).statusCode).toBe(404);

    // Expired checkout cannot be paid or re-expired (422) & AR/FR hosted pages render cleanly
    const chkAr = await app.inject({
      method: 'POST',
      url: '/api/v2/checkouts',
      headers,
      payload: { amount: 1500, currency: 'dzd', pass_fees_to_customer: true, payment_method: 'cib', success_url: 'http://127.0.0.1/ok', locale: 'ar' },
    });
    const chkArId = chkAr.json().id as string;
    expect((await app.inject({ method: 'GET', url: `/pay/chargily/${chkArId}` })).body).toContain('dir="rtl"');
    const chkFr = await app.inject({
      method: 'POST',
      url: '/api/v2/checkouts',
      headers,
      payload: { amount: 1500, currency: 'dzd', success_url: 'http://127.0.0.1/ok', locale: 'fr' },
    });
    expect((await app.inject({ method: 'GET', url: `/pay/chargily/${chkFr.json().id}` })).body).toContain('Payer maintenant');
    expect((await app.inject({ method: 'POST', url: `/pay/chargily/${chkFr.json().id}/action`, payload: { action: 'declined' } })).statusCode).toBe(302);
    await app.inject({ method: 'POST', url: `/api/v2/checkouts/${chkArId}/expire`, headers });
    expect((await app.inject({ method: 'POST', url: `/api/v2/checkouts/${chkArId}/expire`, headers })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: `/pay/chargily/${chkArId}/action`, payload: { action: 'success' } })).statusCode).toBe(422);

    // Security regressions: unsafe URL protocols, embedded creds, and oversized request body rejected
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v2/checkouts',
          headers,
          payload: { amount: 1500, currency: 'dzd', success_url: 'javascript:alert(1)' },
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v2/checkouts',
          headers,
          payload: { amount: 1500, currency: 'dzd', success_url: 'https://user:pass@127.0.0.1/ok' },
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v2/checkouts',
          headers: { ...headers, 'content-type': 'application/json' },
          payload: JSON.stringify({
            amount: 1500,
            currency: 'dzd',
            success_url: 'http://127.0.0.1/ok',
            description: 'x'.repeat(300 * 1024),
          }),
        })
      ).statusCode,
    ).toBe(413);

    await app.close();
  });
});
