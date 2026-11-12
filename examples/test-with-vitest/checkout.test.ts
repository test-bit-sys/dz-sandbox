import { expect, it } from 'vitest';
import { createSandboxClient } from '@dz-sandbox/client';

// Expects dz-sandbox running (docker compose up / npx dz-sandbox start)
const sandbox = createSandboxClient({ controlUrl: process.env.DZ_CONTROL_URL ?? 'http://127.0.0.1:4000' });

it('catches duplicate Chargily webhooks and verifies virtual clock delay', async () => {
  await sandbox.reset();
  await sandbox.scenario('chargily', 'duplicate_webhook');

  const chargilyBase = process.env.CHARGILY_BASE_URL ?? 'http://127.0.0.1:4001/api/v2';
  const chargilyOrigin = new URL(chargilyBase).origin;
  const createRes = await fetch(`${chargilyBase}/checkouts`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test_sk_example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: 2500,
      currency: 'dzd',
      payment_method: 'edahabia',
      success_url: 'http://127.0.0.1:3999/success',
      webhook_endpoint: 'http://127.0.0.1:3999/webhook',
    }),
  });
  expect(createRes.status).toBe(201);
  const checkout = (await createRes.json()) as { id: string };

  // Complete checkout through simulated hosted action
  await fetch(`${chargilyOrigin}/pay/chargily/${checkout.id}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action: 'success' }),
  });

  const hooks = await sandbox.waitForWebhook({
    provider: 'chargily',
    eventType: 'checkout.paid',
    count: 2,
    timeoutMs: 3000,
  });
  expect(hooks).toHaveLength(2);
});
