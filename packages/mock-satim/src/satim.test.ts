import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MemoryStore, ScenarioEngine, SeededRNG, VirtualClock } from '@dz-sandbox/core';
import { SATIM_SPEC, type SatimOutcome } from './satim.spec.js';
import { createSatimServer } from './server.js';
import { applyPaymentOutcome, applyRefund, SatimTransitionError, type SatimOrder } from './state-machine.js';

const FixtureSchema = z.object({
  provider: z.literal('satim'),
  verified: z.boolean(),
  source: z.string(),
  cases: z.array(
    z.object({
      name: z.string(),
      method: z.enum(['GET', 'POST']),
      path: z.string(),
      body: z.record(z.unknown()).optional(),
      expectedStatus: z.number().int(),
      requiredKeys: z.array(z.string()),
    }),
  ),
});

function setupSatim() {
  const store = new MemoryStore();
  const clock = new VirtualClock();
  const rng = new SeededRNG(202);
  const scenarios = new ScenarioEngine(store);
  const app = createSatimServer({ ctx: { store, clock, rng, scenarios } });
  return { app, store, clock, rng, scenarios };
}

describe('mock-satim contract fixtures', () => {
  it('replays fixtures/satim/*.json', async () => {
    const { app } = setupSatim();
    const dir = path.resolve(__dirname, '../../../fixtures/satim');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const fixture = FixtureSchema.parse(JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
      for (const tc of fixture.cases) {
        const res = await app.inject({
          method: tc.method,
          url: tc.path,
          payload: tc.body,
        });
        expect(res.statusCode).toBe(tc.expectedStatus);
        const json = res.json() as Record<string, unknown>;
        for (const k of tc.requiredKeys) {
          expect(json).toHaveProperty(k);
        }
      }
    }
    await app.close();
  });
});

describe('mock-satim end-to-end payment, cards, refunds, and error rules', () => {
  it('completes register -> hosted form -> confirm -> partial/full refund and rejects illegal transitions', async () => {
    const { app } = setupSatim();

    // Register
    const reg = await app.inject({
      method: 'GET',
      url: '/payment/rest/register.do?userName=merch&password=pwd&orderNumber=ORD-900&amount=200000&currency=012&returnUrl=http://127.0.0.1:3000/ok&failUrl=http://127.0.0.1:3000/ko&language=ar',
    });
    expect(reg.statusCode).toBe(200);
    const { orderId, formUrl } = reg.json() as { orderId: string; formUrl: string };
    expect(formUrl).toContain(`/pay/satim/${orderId}`);

    // Reject duplicate orderNumber
    const dup = await app.inject({
      method: 'POST',
      url: '/register.do',
      payload: {
        userName: 'merch',
        password: 'pwd',
        orderNumber: 'ORD-900',
        amount: 200000,
        currency: '012',
        returnUrl: 'http://127.0.0.1:3000/ok',
      },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().errorCode).toBe(SATIM_SPEC.errorCodes.duplicateOrder);

    // Illegal: refund before payment
    const earlyRefund = await app.inject({
      method: 'POST',
      url: '/payment/rest/refund.do',
      payload: { userName: 'merch', password: 'pwd', orderId, amount: 50000 },
    });
    expect(earlyRefund.statusCode).toBe(422);

    // Hosted page renders fake cards
    const htmlRes = await app.inject({ method: 'GET', url: `/pay/satim/${orderId}` });
    expect(htmlRes.statusCode).toBe(200);
    expect(htmlRes.body).toContain('4000000000000001');

    // Submit payment with success card
    const payRes = await app.inject({
      method: 'POST',
      url: `/pay/satim/${orderId}/action`,
      headers: { accept: 'application/json' },
      payload: { action: 'pay', cardPan: '4000000000000001' },
    });
    expect(payRes.statusCode).toBe(200);
    expect(payRes.json().orderStatus).toBe(SATIM_SPEC.orderStatus.paid);
    expect(payRes.json().redirectUrl).toContain(`orderId=${orderId}`);

    // Double charge attempt on paid order
    const doubleRes = await app.inject({
      method: 'POST',
      url: `/pay/satim/${orderId}/action`,
      headers: { 'x-dz-scenario': 'double_charge_attempt' },
      payload: { action: 'pay', cardPan: '4000000000000001' },
    });
    expect(doubleRes.statusCode).toBe(409);

    // Confirm / acknowledge status
    const conf = await app.inject({
      method: 'GET',
      url: `/payment/rest/confirmOrder.do?userName=merch&password=pwd&orderId=${orderId}`,
    });
    expect(conf.statusCode).toBe(200);
    expect(conf.json().orderStatus).toBe(2);
    expect(conf.json().depositAmount).toBe(200000);
    expect(conf.json().actionCode).toBe(0);

    // Refund failure scenario
    const refFail = await app.inject({
      method: 'POST',
      url: '/payment/rest/refund.do',
      headers: { 'x-dz-scenario': 'refund_failure' },
      payload: { userName: 'merch', password: 'pwd', orderId, amount: 50000 },
    });
    expect(refFail.statusCode).toBe(422);

    // Partial refund via partial_refund scenario
    const refPart = await app.inject({
      method: 'POST',
      url: '/payment/rest/refund.do',
      headers: { 'x-dz-scenario': 'partial_refund' },
      payload: { userName: 'merch', password: 'pwd', orderId, amount: 200000 },
    });
    expect(refPart.statusCode).toBe(200);
    expect(refPart.json().refundedAmount).toBe(100000);
    expect(refPart.json().state).toBe('PARTIALLY_REFUNDED');

    // Over-refund rejected
    const overRef = await app.inject({
      method: 'POST',
      url: '/payment/rest/refund.do',
      payload: { userName: 'merch', password: 'pwd', orderId, amount: 150000 },
    });
    expect(overRef.statusCode).toBe(422);

    // Complete remaining refund
    const fullRef = await app.inject({
      method: 'POST',
      url: '/payment/rest/refund.do',
      payload: { userName: 'merch', password: 'pwd', orderId, amount: 100000 },
    });
    expect(fullRef.statusCode).toBe(200);
    expect(fullRef.json().orderStatus).toBe(SATIM_SPEC.orderStatus.refunded);

    await app.close();
  });

  it('simulates all fake test card failure outcomes and redirect', async () => {
    const { app } = setupSatim();

    const cases: Array<{ pan?: string; action?: string; expectedActionCode: number; expectedStatus: number }> = [
      { pan: '4000000000000002', expectedActionCode: SATIM_SPEC.actionCodes.declined, expectedStatus: 6 },
      { pan: '4000000000000003', expectedActionCode: SATIM_SPEC.actionCodes.insufficientFunds, expectedStatus: 6 },
      { pan: '4000000000000004', expectedActionCode: SATIM_SPEC.actionCodes.expiredCard, expectedStatus: 6 },
      { pan: '4000000000000005', expectedActionCode: SATIM_SPEC.actionCodes.threeDsTimeout, expectedStatus: 6 },
      { action: 'user_cancelled', expectedActionCode: SATIM_SPEC.actionCodes.cancelledByUser, expectedStatus: 3 },
    ];

    let idx = 0;
    for (const tc of cases) {
      idx++;
      const reg = await app.inject({
        method: 'POST',
        url: '/payment/rest/register.do',
        payload: {
          userName: 'm',
          password: 'p',
          orderNumber: `CARD-${idx}`,
          amount: 10000,
          currency: '012',
          returnUrl: 'http://127.0.0.1:3000/ok',
          failUrl: 'http://127.0.0.1:3000/ko',
        },
      });
      const orderId = reg.json().orderId as string;

      const pay = await app.inject({
        method: 'POST',
        url: `/pay/satim/${orderId}/action`,
        payload: { action: tc.action ?? 'pay', cardPan: tc.pan },
      });
      expect(pay.statusCode).toBe(302);
      expect(pay.headers.location).toContain('http://127.0.0.1:3000/ko');

      const status = await app.inject({
        method: 'GET',
        url: `/payment/rest/getOrderStatusExtended.do?userName=m&password=p&orderId=${orderId}`,
      });
      expect(status.json().orderStatus).toBe(tc.expectedStatus);
      expect(status.json().actionCode).toBe(tc.expectedActionCode);
    }

    // Unknown order IDs & network scenario
    expect((await app.inject({ method: 'GET', url: '/pay/satim/missing' })).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/payment/rest/confirmOrder.do',
          payload: { userName: 'm', password: 'p', orderId: 'missing' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/payment/rest/refund.do',
          payload: { userName: 'm', password: 'p', orderId: 'missing', amount: 100 },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/payment/rest/register.do',
          headers: { 'x-dz-scenario': 'gateway_500' },
          payload: {},
        })
      ).statusCode,
    ).toBe(500);

    // 10. Validation (400), 404 not found, aliases, refund_failure, double_charge_attempt, partial_refund, HTML redirect
    expect((await app.inject({ method: 'GET', url: '/payment/rest/register.do?amount=-1' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/payment/rest/confirmOrder.do' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/payment/rest/refund.do' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/pay/satim/missing/action', payload: {} })).statusCode).toBe(404);

    const rOk = await app.inject({
      method: 'POST',
      url: '/payment/rest/register.do',
      payload: {
        userName: 'm',
        password: 'p',
        orderNumber: 'ORD-HTML-1',
        amount: 40000,
        currency: '012',
        returnUrl: 'http://127.0.0.1:3000/ok',
        failUrl: 'http://127.0.0.1:3000/ko',
        language: 'en',
        jsonParams: JSON.stringify({ udf1: 'cust_1' }),
      },
    });
    const ordOk = rOk.json().orderId as string;
    expect((await app.inject({ method: 'GET', url: `/pay/satim/${ordOk}` })).body).toContain('SATIM');
    const htmlSubmit = await app.inject({
      method: 'POST',
      url: `/pay/satim/${ordOk}/action`,
      payload: { cardPan: '4000000000000001' },
    });
    expect(htmlSubmit.statusCode).toBe(302);
    expect(htmlSubmit.headers.location).toContain('http://127.0.0.1:3000/ok');

    expect((await app.inject({ method: 'GET', url: `/payment/rest/getOrderStatusExtended.do?userName=m&password=p&orderId=${ordOk}` })).json().orderStatus).toBe(2);
    expect((await app.inject({ method: 'GET', url: `/payment/rest/acknowledgeTransaction.do?userName=m&password=p&orderId=${ordOk}` })).json().params.udf1).toBe('cust_1');

    expect(
      (await app.inject({
        method: 'POST',
        url: `/pay/satim/${ordOk}/action`,
        headers: { accept: 'application/json', 'x-dz-scenario': 'double_charge_attempt' },
        payload: { cardPan: '4000000000000001' },
      })).statusCode,
    ).toBe(409);

    expect(
      (await app.inject({
        method: 'POST',
        url: '/payment/rest/refund.do',
        headers: { 'x-dz-scenario': 'refund_failure' },
        payload: { userName: 'm', password: 'p', orderId: ordOk, amount: 10000 },
      })).statusCode,
    ).toBe(422);

    const partial = await app.inject({
      method: 'POST',
      url: '/payment/rest/refund.do',
      headers: { 'x-dz-scenario': 'partial_refund' },
      payload: { userName: 'm', password: 'p', orderId: ordOk, amount: 40000 },
    });
    expect(partial.statusCode).toBe(200);
    expect(partial.json().refundedAmount).toBe(20000);

    await app.close();
  });
});

describe('SATIM state machine property tests', () => {
  it('never allows refundedAmount to exceed depositAmount or illegal state transitions', () => {
    const baseOrder: SatimOrder = {
      orderId: 'ord_prop',
      orderNumber: 'PROP-1',
      userName: 'm',
      amount: 100_00,
      depositAmount: 0,
      refundedAmount: 0,
      currency: '012',
      returnUrl: 'http://127.0.0.1/ok',
      failUrl: 'http://127.0.0.1/ko',
      description: '',
      language: 'ar',
      jsonParams: {},
      state: 'REGISTERED',
      orderStatus: 0,
      errorCode: 0,
      actionCode: 0,
      actionCodeDescription: 'Order registered',
      approvalCode: null,
      maskedPan: null,
      formUrl: 'http://127.0.0.1:4002/pay/satim/ord_prop',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const outcomeArb = fc.constantFrom<SatimOutcome>(
      'success',
      'declined',
      'insufficient_funds',
      'expired_card',
      'user_cancelled',
      '3ds_timeout',
    );

    const opArb = fc.oneof(
      fc.record({ kind: fc.constant('pay' as const), outcome: outcomeArb }),
      fc.record({ kind: fc.constant('refund' as const), amount: fc.integer({ min: -500, max: 15000 }) }),
    );

    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 12 }), (ops) => {
        let current = baseOrder;
        for (const op of ops) {
          if (op.kind === 'pay') {
            if (current.state === 'REGISTERED') {
              current = applyPaymentOutcome(current, op.outcome, '2026-01-01T00:01:00.000Z');
            } else {
              expect(() => applyPaymentOutcome(current, op.outcome, '2026-01-01T00:01:00.000Z')).toThrow(
                SatimTransitionError,
              );
            }
          } else {
            const canRefund =
              (current.state === 'PAID' || current.state === 'PARTIALLY_REFUNDED') &&
              op.amount > 0 &&
              op.amount <= current.depositAmount - current.refundedAmount;
            if (canRefund) {
              current = applyRefund(current, op.amount, '2026-01-01T00:02:00.000Z');
            } else {
              expect(() => applyRefund(current, op.amount, '2026-01-01T00:02:00.000Z')).toThrow(
                SatimTransitionError,
              );
            }
          }
          expect(current.refundedAmount).toBeGreaterThanOrEqual(0);
          expect(current.refundedAmount).toBeLessThanOrEqual(current.depositAmount);
        }
      }),
    );
  });
});
