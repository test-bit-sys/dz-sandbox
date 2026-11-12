import crypto from 'node:crypto';
import express from 'express';

const CHARGILY_BASE = process.env.CHARGILY_BASE_URL ?? 'http://127.0.0.1:4001/api/v2';
const CHARGILY_SECRET = process.env.CHARGILY_SECRET_KEY ?? 'test_sk_example_secret';
const SATIM_BASE = process.env.SATIM_BASE_URL ?? 'http://127.0.0.1:4002/payment/rest';
const SATIM_USER = process.env.SATIM_USERNAME ?? 'test_merchant';
const SATIM_PASS = process.env.SATIM_PASSWORD ?? 'test_password';
const PORT = Number(process.env.PORT ?? 3100);
const ENFORCE_IDEMPOTENCY = process.env.IDEMPOTENT_WEBHOOKS === 'true';

export function createExampleApp(opts = {}) {
  const chargilyBase = opts.chargilyBase ?? CHARGILY_BASE;
  const satimBase = opts.satimBase ?? SATIM_BASE;
  const secret = opts.secret ?? CHARGILY_SECRET;
  const enforceIdempotency = opts.enforceIdempotency ?? ENFORCE_IDEMPOTENCY;

  const app = express();
  const orders = new Map();
  let fulfillments = 0;

  // Capture raw body for exact HMAC-SHA256 verification
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );

  app.post('/orders', async (req, res) => {
    const amount = Number(req.body?.amount ?? 2500);
    const orderId = `ord_${orders.size + 1}`;
    const selfBase = opts.selfBase ?? `http://127.0.0.1:${PORT}`;

    const resp = await fetch(`${chargilyBase}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency: 'dzd',
        payment_method: req.body?.payment_method ?? 'edahabia',
        success_url: `${selfBase}/success?order=${orderId}`,
        failure_url: `${selfBase}/failure?order=${orderId}`,
        webhook_endpoint: `${selfBase}/webhooks/chargily`,
        metadata: { orderId },
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return res.status(502).json({ error: 'CHARGILY_ERROR', upstreamStatus: resp.status, detail: errBody });
    }

    const checkout = await resp.json();
    orders.set(orderId, {
      orderId,
      checkoutId: checkout.id,
      amount,
      status: 'pending',
      fulfillments: 0,
    });

    return res.status(201).json({ orderId, checkout_url: checkout.checkout_url, checkoutId: checkout.id });
  });

  app.post('/webhooks/chargily', (req, res) => {
    const sig = req.get('signature') ?? '';
    const raw = req.rawBody ?? JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');

    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return res.status(403).json({ error: 'INVALID_SIGNATURE' });
    }

    const event = req.body;
    const orderId = event?.data?.metadata?.orderId;
    const order = orders.get(orderId);

    if (order && event.type === 'checkout.paid') {
      if (enforceIdempotency && order.status === 'paid') {
        return res.status(200).json({ ok: true, deduplicated: true });
      }
      // Without idempotency guard, duplicate_webhook increments fulfillments twice!
      order.status = 'paid';
      order.fulfillments += 1;
      fulfillments += 1;
    } else if (order && (event.type === 'checkout.failed' || event.type === 'checkout.canceled')) {
      order.status = 'failed';
    }

    return res.status(200).json({ ok: true });
  });

  app.post('/satim/orders', async (req, res) => {
    const amountDzd = Number(req.body?.amount ?? 2000);
    const amountCentimes = Math.round(amountDzd * 100);
    const orderId = `sat_${orders.size + 1}`;
    const selfBase = opts.selfBase ?? `http://127.0.0.1:${PORT}`;
    const qs = new URLSearchParams({
      userName: SATIM_USER,
      password: SATIM_PASS,
      orderNumber: orderId,
      amount: String(amountCentimes),
      currency: '012',
      returnUrl: `${selfBase}/satim/return?order=${orderId}`,
      failUrl: `${selfBase}/failure?order=${orderId}`,
      language: 'fr',
    });

    const resp = await fetch(`${satimBase}/register.do?${qs.toString()}`);
    const body = await resp.json();
    if (!resp.ok || !body.orderId) {
      return res.status(502).json({ error: 'SATIM_REGISTER_FAILED', detail: body });
    }

    orders.set(orderId, {
      orderId,
      satimOrderId: body.orderId,
      amount: amountDzd,
      status: 'pending',
      fulfillments: 0,
    });
    return res.status(201).json({ orderId, satimOrderId: body.orderId, formUrl: body.formUrl });
  });

  app.get('/satim/return', async (req, res) => {
    const satimOrderId = String(req.query.orderId ?? '');
    const orderNum = String(req.query.order ?? '');
    const qs = new URLSearchParams({
      userName: SATIM_USER,
      password: SATIM_PASS,
      orderId: satimOrderId,
    });
    const ack = await fetch(`${satimBase}/confirmOrder.do?${qs.toString()}`).then((r) => r.json());
    const order = orders.get(orderNum);
    if (order && ack.errorCode === '0' && ack.orderStatus === 2) {
      order.status = 'paid';
      order.fulfillments += 1;
      fulfillments += 1;
    }
    return res.json({ orderNum, satimOrderId, ack, order });
  });

  app.get('/orders', (_req, res) => {
    res.json({ totalFulfillments: fulfillments, orders: Array.from(orders.values()) });
  });

  app.get('/success', (req, res) => res.send(`Payment succeeded for ${req.query.order ?? ''}`));
  app.get('/failure', (req, res) => res.send(`Payment failed for ${req.query.order ?? ''}`));

  return { app, orders };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app } = createExampleApp();
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Express checkout example listening on http://127.0.0.1:${PORT}`);
  });
}
