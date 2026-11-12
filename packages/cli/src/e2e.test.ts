import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyHmacSha256 } from '@dz-sandbox/core';
import { createSandboxClient } from '@dz-sandbox/client';
import { startSandboxRuntime, type SandboxRuntime } from './runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('dz-sandbox end-to-end integration suites', () => {
  let runtime: SandboxRuntime | undefined;
  let merchantApp: FastifyInstance | undefined;

  afterEach(async () => {
    if (merchantApp) {
      merchantApp.server.closeIdleConnections?.();
      await merchantApp.close();
      merchantApp = undefined;
    }
    if (runtime) {
      await runtime.stop();
      runtime = undefined;
    }
  });

  it('reproduces and fixes Chargily duplicate_webhook bug, completes SATIM payment + refund, and drives Yalidine COD lifecycle via virtual clock', async () => {
    const scenariosDir = path.resolve(__dirname, '../../../scenarios');
    runtime = await startSandboxRuntime({
      controlPort: 0,
      chargilyPort: 0,
      satimPort: 0,
      yalidinePort: 0,
      scenariosDir,
      watchScenarios: false,
    });

    const sandbox = createSandboxClient({ controlUrl: runtime.urls.control });
    const chargilyOrigin = `http://127.0.0.1:${runtime.ports.chargily}`;
    const chargilyBase = runtime.urls.chargily;
    const satimOrigin = `http://127.0.0.1:${runtime.ports.satim}`;
    const satimBase = runtime.urls.satim;
    const yalidineBase = runtime.urls.yalidine;
    const secret = 'test_sk_e2e_secret';

    // Custom YAML scenario from ./scenarios/example-custom.yaml is loaded
    const scenListRes = (await fetch(`${runtime.urls.control}/__control/scenarios`).then((r) =>
      r.json(),
    )) as { scenarios: Array<{ name: string }> };
    expect(scenListRes.scenarios.some((s) => s.name === 'chargily_slow_duplicate')).toBe(true);

    // Boot merchant webhook receiver
    merchantApp = Fastify({ logger: false });
    let enforceIdempotency = false;
    const processedOrders = new Map<string, number>();

    merchantApp.post('/webhooks/chargily', async (request, reply) => {
      const sig = String(request.headers.signature ?? '');
      const raw = JSON.stringify(request.body);
      expect(verifyHmacSha256(raw, secret, sig)).toBe(true);

      const event = request.body as { type: string; data?: { metadata?: { orderId?: string } } };
      const orderId = event.data?.metadata?.orderId;
      if (orderId && event.type === 'checkout.paid') {
        const current = processedOrders.get(orderId) ?? 0;
        if (enforceIdempotency && current > 0) {
          return { ok: true, deduplicated: true };
        }
        processedOrders.set(orderId, current + 1);
      }
      return reply.code(200).send({ ok: true });
    });

    await merchantApp.listen({ host: '127.0.0.1', port: 0 });
    const addr = merchantApp.server.address();
    if (!addr || typeof addr !== 'object') throw new Error('Merchant server failed to bind');
    const merchantUrl = `http://127.0.0.1:${addr.port}`;

    // 1) Chargily duplicate_webhook exposes non-idempotent fulfillment, then passes with guard
    await sandbox.scenario('chargily', 'duplicate_webhook');
    const createChk1 = (await fetch(`${chargilyBase}/checkouts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 3000,
        currency: 'dzd',
        payment_method: 'edahabia',
        success_url: `${merchantUrl}/ok`,
        webhook_endpoint: `${merchantUrl}/webhooks/chargily`,
        metadata: { orderId: 'ORD-BUGGY' },
      }),
    }).then((r) => r.json())) as { id: string };

    const action1 = await fetch(`${chargilyOrigin}/pay/chargily/${createChk1.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'success' }),
    });
    expect(action1.status).toBe(200);
    const dupHooks = await sandbox.waitForWebhook({ provider: 'chargily', count: 2, timeoutMs: 3000 });
    expect(dupHooks).toHaveLength(2);
    expect(processedOrders.get('ORD-BUGGY')).toBe(2);

    enforceIdempotency = true;
    const createChk2 = (await fetch(`${chargilyBase}/checkouts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 3000,
        currency: 'dzd',
        payment_method: 'cib',
        success_url: `${merchantUrl}/ok`,
        webhook_endpoint: `${merchantUrl}/webhooks/chargily`,
        metadata: { orderId: 'ORD-SAFE' },
      }),
    }).then((r) => r.json())) as { id: string };

    const action2 = await fetch(`${chargilyOrigin}/pay/chargily/${createChk2.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'success' }),
    });
    expect(action2.status).toBe(200);
    await sandbox.waitForWebhook({ provider: 'chargily', count: 4, timeoutMs: 3000 });
    expect(processedOrders.get('ORD-SAFE')).toBe(1);

    // 2) SATIM full flow: register.do -> hosted card -> confirmOrder.do -> partial refund.do
    const regQs = new URLSearchParams({
      userName: 'test_merchant',
      password: 'test_password',
      orderNumber: 'SAT-E2E-1',
      amount: '150000',
      currency: '012',
      returnUrl: `${merchantUrl}/ok`,
      failUrl: `${merchantUrl}/ko`,
      language: 'ar',
    });
    const reg = (await fetch(`${satimBase}/register.do?${regQs.toString()}`).then((r) =>
      r.json(),
    )) as { errorCode: number; orderId: string };
    expect(reg.errorCode).toBe(0);

    const payRes = (await fetch(`${satimOrigin}/pay/satim/${reg.orderId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ cardPan: '4000000000000001' }),
    }).then((r) => r.json())) as { ok: boolean };
    expect(payRes.ok).toBe(true);

    const confirm = (await fetch(
      `${satimBase}/confirmOrder.do?userName=test_merchant&password=test_password&orderId=${reg.orderId}`,
    ).then((r) => r.json())) as { errorCode: number; orderStatus: number };
    expect(confirm.errorCode).toBe(0);
    expect(confirm.orderStatus).toBe(2);

    const refund = (await fetch(
      `${satimBase}/refund.do?userName=test_merchant&password=test_password&orderId=${reg.orderId}&amount=50000`,
    ).then((r) => r.json())) as { errorCode: number; refundedAmount: number };
    expect(refund.errorCode).toBe(0);
    expect(refund.refundedAmount).toBe(50000);

    // 3) Yalidine COD store flow driven deterministically via VirtualClock
    await sandbox.reset();
    await sandbox.scenario('yalidine', 'lifecycle_fast');
    const yalHeaders = {
      'X-API-ID': 'test_id',
      'X-API-TOKEN': 'test_tok',
      'Content-Type': 'application/json',
    };
    const parcelCreate = (await fetch(`${yalidineBase}/parcels`, {
      method: 'POST',
      headers: yalHeaders,
      body: JSON.stringify([
        {
          order_id: 'COD-E2E-1',
          firstname: 'Yacine',
          familyname: 'Mansouri',
          contact_phone: '0550112233',
          address: 'Rue Didouche Mourad',
          to_wilaya_id: 16,
          to_commune_name: 'Alger Centre',
          product_list: 'Phone Case',
          price: 2800,
        },
      ]),
    }).then((r) => r.json())) as { data: Array<{ tracking: string }> };
    const tracking = parcelCreate.data[0]?.tracking;
    expect(tracking).toMatch(/^yal-/);

    await sandbox.clock.advance('10m');
    const histories = (await fetch(`${yalidineBase}/histories?tracking=${tracking}`, {
      headers: yalHeaders,
    }).then((r) => r.json())) as { data: Array<{ status: string }> };
    expect(histories.data.some((h) => /livr/i.test(h.status))).toBe(true);
  });
});
