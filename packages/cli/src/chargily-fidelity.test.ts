import { execFileSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChargilyClient, verifySignature } from '@chargily/chargily-pay';
import { createSandboxClient, pointChargilyClientToSandbox } from '@dz-sandbox/client';
import { afterEach, describe, expect, it } from 'vitest';
import { startSandboxRuntime, type SandboxRuntime } from './runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Chargily official SDK fidelity via pointChargilyClientToSandbox()', () => {
  let runtime: SandboxRuntime | undefined;
  let webhookServer: http.Server | undefined;

  afterEach(async () => {
    if (webhookServer) {
      webhookServer.closeAllConnections?.();
      await new Promise<void>((resolve) => webhookServer!.close(() => resolve()));
      webhookServer = undefined;
    }
    if (runtime) {
      await runtime.stop();
      runtime = undefined;
    }
  });

  it('runs customer -> product -> price -> checkout -> hosted payment -> signed webhook using official SDK without patches', async () => {
    runtime = await startSandboxRuntime({
      controlPort: 0,
      chargilyPort: 0,
      satimPort: 0,
      yalidinePort: 0,
      watchScenarios: false,
    });

    const received: Array<{ raw: string; signature: string }> = [];
    webhookServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        received.push({
          raw: Buffer.concat(chunks).toString('utf8'),
          signature: String(req.headers.signature ?? ''),
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end('{"ok":true}');
      });
    });
    await new Promise<void>((resolve) => webhookServer!.listen(0, '127.0.0.1', () => resolve()));
    const addr = webhookServer.address();
    if (!addr || typeof addr !== 'object') throw new Error('Webhook listener failed');
    const webhookUrl = `http://127.0.0.1:${addr.port}/chargily-hook`;

    const secret = 'test_sk_fidelity_check_key';
    const client = new ChargilyClient({ api_key: secret, mode: 'test' });
    pointChargilyClientToSandbox(client, runtime.urls.chargily);

    const customer = await client.createCustomer({
      name: 'Fidelity Customer',
      email: 'fidelity@example.dz',
      phone: '0550112233',
    });
    expect(customer.id).toMatch(/^cus_/);

    const product = await client.createProduct({
      name: 'Algeria Dev Merch',
      description: 'Official SDK fidelity check product',
    });
    expect(product.id).toMatch(/^prod_/);

    const price = await client.createPrice({
      amount: 4200,
      currency: 'dzd',
      product_id: product.id,
    });
    expect(price.id).toMatch(/^prc_/);

    const checkout = await client.createCheckout({
      items: [{ price: price.id, quantity: 1 }],
      customer_id: customer.id,
      payment_method: 'edahabia',
      success_url: `http://127.0.0.1:${addr.port}/success`,
      failure_url: `http://127.0.0.1:${addr.port}/failure`,
      webhook_endpoint: webhookUrl,
      locale: 'en',
      metadata: { orderId: 'FIDELITY-1' },
    });
    expect(checkout.id).toMatch(/^chk_/);
    expect(checkout.amount).toBe(4200);
    expect(checkout.status).toBe('pending');

    // Hosted page renders and payment completes cleanly
    const hostedRes = await fetch(checkout.checkout_url);
    expect(hostedRes.status).toBe(200);
    const payRes = await fetch(`${checkout.checkout_url}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'success' }),
    });
    expect(payRes.status).toBe(200);

    const sandbox = createSandboxClient({ controlUrl: runtime.urls.control });
    await sandbox.waitForWebhook({ provider: 'chargily', eventType: 'checkout.paid', count: 1, timeoutMs: 3000 });
    expect(received).toHaveLength(1);

    const hook = received[0]!;
    const valid = verifySignature(Buffer.from(hook.raw, 'utf8'), hook.signature, secret);
    expect(valid).toBe(true);

    const updatedCheckout = await client.getCheckout(checkout.id);
    expect(updatedCheckout.status).toBe('paid');

    console.log(
      JSON.stringify({
        fidelityCheck: 'OK',
        customerId: customer.id,
        productId: product.id,
        priceId: price.id,
        checkoutId: checkout.id,
        checkoutStatus: updatedCheckout.status,
        webhookVerifiedByOfficialSdk: valid,
      }),
    );
  });

  it('redacts sensitive secrets, tokens, emails, phones, and PANs in captured fixtures', () => {
    const sampleFixture = {
      provider: 'chargily',
      verified: true,
      source: 'captured-test-mode:2026-11-12',
      cases: [
        {
          name: 'captured checkout',
          method: 'POST',
          path: '/api/v2/checkouts',
          headers: {
            authorization: 'Bearer test_sk_live_secret_123456',
            'x-api-token': 'tok_real_987654',
          },
          body: {
            email: 'merchant@real-company.dz',
            contact_phone: '+213550123456',
            card_pan: '4532 1234 5678 9012',
            secret_key: 'sk_should_hide',
            amount: 2500,
          },
        },
      ],
    };

    const scriptPath = path.resolve(__dirname, '../../../scripts/redact-fixture.mjs');
    const stdout = execFileSync(process.execPath, [scriptPath, '-'], {
      input: JSON.stringify(sampleFixture),
      encoding: 'utf8',
    });
    const redacted = JSON.parse(stdout) as {
      cases: Array<{
        headers: Record<string, string>;
        body: Record<string, unknown>;
      }>;
    };
    expect(redacted.cases[0]?.headers.authorization).toBe('[REDACTED_TOKEN]');
    expect(redacted.cases[0]?.headers['x-api-token']).toBe('[REDACTED_TOKEN]');
    expect(redacted.cases[0]?.body.email).toBe('redacted@example.dz');
    expect(redacted.cases[0]?.body.contact_phone).toBe('0550000000');
    expect(redacted.cases[0]?.body.card_pan).toBe('[REDACTED_CARD_PAN]');
    expect(redacted.cases[0]?.body.secret_key).toBe('[REDACTED_SECRET]');
    expect(redacted.cases[0]?.body.amount).toBe(2500);
  });
});
