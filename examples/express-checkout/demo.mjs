import http from 'node:http';
import { createExampleApp } from './server.mjs';

const CONTROL_URL = process.env.DZ_CONTROL_URL ?? 'http://127.0.0.1:4000';
const CHARGILY_URL = process.env.CHARGILY_BASE_URL ?? 'http://127.0.0.1:4001/api/v2';
const SATIM_URL = process.env.SATIM_BASE_URL ?? 'http://127.0.0.1:4002/payment/rest';

const chargilyOrigin = new URL(CHARGILY_URL).origin;
const satimOrigin = new URL(SATIM_URL).origin;

async function waitForWebhookCount(expected) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const res = await fetch(`${CONTROL_URL}/__control/webhooks?provider=chargily`);
    const data = await res.json();
    if ((data.webhooks?.length ?? 0) >= expected) return data.webhooks;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for ${expected} chargily webhooks`);
}

async function run() {
  const server = http.createServer();
  let appPort = 0;

  const { app } = createExampleApp({
    chargilyBase: CHARGILY_URL,
    satimBase: SATIM_URL,
    get selfBase() {
      return `http://127.0.0.1:${appPort}`;
    },
  });

  await new Promise((resolve) => {
    server.on('request', app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      appPort = addr.port;
      resolve();
    });
  });

  const base = `http://127.0.0.1:${appPort}`;
  try {
    await fetch(`${CONTROL_URL}/__control/reset`, { method: 'POST' });
    await fetch(`${CONTROL_URL}/__control/scenario/chargily`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'duplicate_webhook' }),
    });

    // 1. Naive handler under duplicate_webhook (bug: fulfills twice)
    const ord1 = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 2500, handler: 'naive' }),
    }).then((r) => r.json());

    await fetch(`${chargilyOrigin}/pay/chargily/${ord1.checkoutId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'success' }),
    });
    await waitForWebhookCount(2);

    // 2. Idempotent handler under duplicate_webhook (fix: fulfills once)
    const ord2 = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 2500, handler: 'idempotent' }),
    }).then((r) => r.json());

    await fetch(`${chargilyOrigin}/pay/chargily/${ord2.checkoutId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'success' }),
    });
    await waitForWebhookCount(4);

    // 3. SATIM flow (register.do -> hosted confirm -> confirmOrder.do)
    const sat = await fetch(`${base}/satim/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 2000 }),
    }).then((r) => r.json());

    const satAction = await fetch(`${satimOrigin}/pay/satim/${sat.satimOrderId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        cardPan: '4000000000000001',
        expiry: '12/30',
        cvv: '123',
        cardholder: 'TEST USER',
        action: 'pay',
      }),
    }).then((r) => r.json());

    await fetch(satAction.redirectUrl ?? `${base}/satim/return?order=${sat.orderId}&orderId=${sat.satimOrderId}`);

    const summary = await fetch(`${base}/orders`).then((r) => r.json());
    console.log(JSON.stringify(summary, null, 2));

    const naiveOrder = summary.orders.find((o) => o.orderId === ord1.orderId);
    const idempotentOrder = summary.orders.find((o) => o.orderId === ord2.orderId);
    const satimOrder = summary.orders.find((o) => o.orderId === sat.orderId);

    if (naiveOrder?.fulfillments !== 2) {
      throw new Error(`Expected naive fulfillments=2, got ${naiveOrder?.fulfillments}`);
    }
    if (idempotentOrder?.fulfillments !== 1) {
      throw new Error(`Expected idempotent fulfillments=1, got ${idempotentOrder?.fulfillments}`);
    }
    if (satimOrder?.fulfillments !== 1) {
      throw new Error(`Expected satim fulfillments=1, got ${satimOrder?.fulfillments}`);
    }
    console.log('express-checkout demo OK: naive=2 fulfillments (bug caught), idempotent=1 (fixed), satim=1');
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
