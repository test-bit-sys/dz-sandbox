import formbody from '@fastify/formbody';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  applyNetworkScenario,
  getScenarioHeader,
  registerRequestAuditHook,
  type SandboxContext,
} from '@dz-sandbox/core';
import { renderSatimHostedPage } from './hosted-page.js';
import { SATIM_SPEC, type SatimOutcome } from './satim.spec.js';
import {
  applyPaymentOutcome,
  applyRefund,
  SatimTransitionError,
  type SatimOrder,
} from './state-machine.js';

export interface SatimServerDeps {
  ctx: SandboxContext;
  publicBaseUrl?: string;
}

const NS = {
  orders: 'satim:orders',
  orderNumbers: 'satim:order_numbers',
} as const;

const RegisterSchema = z.object({
  userName: z.string().min(1),
  password: z.string().min(1),
  orderNumber: z.string().min(1),
  amount: z.coerce.number().int().positive(),
  currency: z.string().default(SATIM_SPEC.currencyDzd),
  returnUrl: z.string().url(),
  failUrl: z.string().url().optional(),
  description: z.string().optional().default(''),
  language: z.enum(['ar', 'fr', 'en']).optional().default('ar'),
  jsonParams: z.union([z.string(), z.record(z.unknown())]).optional(),
});

const OrderLookupSchema = z.object({
  userName: z.string().min(1),
  password: z.string().min(1),
  orderId: z.string().min(1),
  language: z.enum(['ar', 'fr', 'en']).optional(),
});

const RefundSchema = z.object({
  userName: z.string().min(1),
  password: z.string().min(1),
  orderId: z.string().min(1),
  amount: z.coerce.number().int().positive(),
});

function extractParams(request: FastifyRequest): Record<string, unknown> {
  const query = (request.query as Record<string, unknown> | undefined) ?? {};
  const body =
    request.body && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {};
  return { ...query, ...body };
}

function parseJsonParams(raw: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { raw };
    }
  }
  return raw;
}

export function createSatimServer(deps: SatimServerDeps): FastifyInstance {
  const { ctx } = deps;
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  app.register(formbody);
  registerRequestAuditHook(app, ctx, 'satim');

  const baseUrlFromRequest = (request: FastifyRequest): string => {
    if (deps.publicBaseUrl) return deps.publicBaseUrl.replace(/\/$/, '');
    const host = request.headers.host ?? `127.0.0.1:${process.env.DZ_SATIM_PORT ?? '4002'}`;
    return `http://${host}`;
  };

  async function guardScenario(
    request: FastifyRequest,
    reply: FastifyReply,
    resourceId?: string,
  ): Promise<string | undefined> {
    const resolved = ctx.scenarios.resolve({
      provider: 'satim',
      headerScenario: getScenarioHeader(request),
      resourceId,
    });
    (request as FastifyRequest & { _dzScenario?: string })._dzScenario = resolved.name;
    if (await applyNetworkScenario(ctx, 'satim', request, reply, resolved)) {
      return undefined;
    }
    return resolved.name;
  }

  async function handleRegister(request: FastifyRequest, reply: FastifyReply) {
    const scenarioName = await guardScenario(request, reply);
    if (!scenarioName) return;

    const params = extractParams(request);
    const parsed = RegisterSchema.safeParse(params);
    if (!parsed.success) {
      return reply.code(400).send({
        errorCode: SATIM_SPEC.errorCodes.missingParameter,
        errorMessage: 'Missing or invalid SATIM parameters',
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;
    if (data.currency !== SATIM_SPEC.currencyDzd) {
      return reply.code(400).send({
        errorCode: SATIM_SPEC.errorCodes.unknownCurrency,
        errorMessage: `Unsupported currency "${data.currency}". Expected "${SATIM_SPEC.currencyDzd}" (DZD).`,
      });
    }

    const existingOrderNumber = ctx.store.getResource<{ orderId: string }>(
      NS.orderNumbers,
      data.orderNumber,
    );
    if (existingOrderNumber) {
      return reply.code(409).send({
        errorCode: SATIM_SPEC.errorCodes.duplicateOrder,
        errorMessage: `Order with orderNumber "${data.orderNumber}" already exists`,
      });
    }

    const orderId = ctx.rng.hex(20);
    const base = baseUrlFromRequest(request);
    const nowIso = ctx.clock.isoNow();
    const order: SatimOrder = {
      orderId,
      orderNumber: data.orderNumber,
      userName: data.userName,
      amount: data.amount,
      depositAmount: 0,
      refundedAmount: 0,
      currency: data.currency,
      returnUrl: data.returnUrl,
      failUrl: data.failUrl ?? data.returnUrl,
      description: data.description,
      language: data.language,
      jsonParams: parseJsonParams(data.jsonParams),
      state: 'REGISTERED',
      orderStatus: SATIM_SPEC.orderStatus.registered,
      errorCode: SATIM_SPEC.errorCodes.success,
      actionCode: 0,
      actionCodeDescription: 'Order registered',
      approvalCode: null,
      maskedPan: null,
      formUrl: `${base}/pay/satim/${orderId}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    ctx.store.setResource(NS.orders, orderId, order);
    ctx.store.setResource(NS.orderNumbers, data.orderNumber, { orderId });

    return {
      errorCode: SATIM_SPEC.errorCodes.success,
      orderId,
      formUrl: order.formUrl,
    };
  }

  async function handleStatusOrConfirm(request: FastifyRequest, reply: FastifyReply) {
    const params = extractParams(request);
    const parsed = OrderLookupSchema.safeParse(params);
    if (!parsed.success) {
      return reply.code(400).send({
        errorCode: SATIM_SPEC.errorCodes.missingParameter,
        errorMessage: 'Missing required order lookup parameters',
      });
    }

    const scenarioName = await guardScenario(request, reply, parsed.data.orderId);
    if (!scenarioName) return;

    const order = ctx.store.getResource<SatimOrder>(NS.orders, parsed.data.orderId);
    if (!order) {
      return reply.code(404).send({
        errorCode: SATIM_SPEC.errorCodes.invalidOrderId,
        errorMessage: `Order not found: ${parsed.data.orderId}`,
      });
    }

    return {
      errorCode: order.errorCode,
      errorMessage: order.errorCode === 0 ? '' : order.actionCodeDescription,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      actionCode: order.actionCode,
      actionCodeDescription: order.actionCodeDescription,
      amount: order.amount,
      depositAmount: order.depositAmount,
      refundedAmount: order.refundedAmount,
      currency: order.currency,
      approvalCode: order.approvalCode,
      Pan: order.maskedPan,
      params: {
        respCode: String(order.actionCode),
        ...order.jsonParams,
      },
      state: order.state,
    };
  }

  async function handleRefund(request: FastifyRequest, reply: FastifyReply) {
    const params = extractParams(request);
    const parsed = RefundSchema.safeParse(params);
    if (!parsed.success) {
      return reply.code(400).send({
        errorCode: SATIM_SPEC.errorCodes.missingParameter,
        errorMessage: 'Missing required refund parameters',
      });
    }

    const scenarioName = await guardScenario(request, reply, parsed.data.orderId);
    if (!scenarioName) return;

    if (scenarioName === 'refund_failure') {
      return reply.code(422).send({
        errorCode: SATIM_SPEC.errorCodes.systemError,
        actionCode: SATIM_SPEC.actionCodes.refundRejected,
        errorMessage: 'Refund rejected by acquiring bank (simulated)',
      });
    }

    const order = ctx.store.getResource<SatimOrder>(NS.orders, parsed.data.orderId);
    if (!order) {
      return reply.code(404).send({
        errorCode: SATIM_SPEC.errorCodes.invalidOrderId,
        errorMessage: `Order not found: ${parsed.data.orderId}`,
      });
    }

    const effectiveAmount =
      scenarioName === 'partial_refund' && parsed.data.amount >= order.depositAmount
        ? Math.max(1, Math.floor(order.depositAmount / 2))
        : parsed.data.amount;

    try {
      const updated = applyRefund(order, effectiveAmount, ctx.clock.isoNow());
      ctx.store.setResource(NS.orders, updated.orderId, updated);
      return {
        errorCode: SATIM_SPEC.errorCodes.success,
        errorMessage: '',
        orderId: updated.orderId,
        orderStatus: updated.orderStatus,
        refundedAmount: updated.refundedAmount,
        state: updated.state,
      };
    } catch (err) {
      if (err instanceof SatimTransitionError) {
        return reply.code(422).send({
          errorCode: err.code,
          errorMessage: err.message,
        });
      }
      throw err;
    }
  }

  app.get('/health', async () => ({ status: 'ok', service: 'mock-satim', verified: SATIM_SPEC.verified }));

  // Hosted payment page
  app.get<{ Params: { orderId: string } }>('/pay/satim/:orderId', async (request, reply) => {
    const order = ctx.store.getResource<SatimOrder>(NS.orders, request.params.orderId);
    if (!order) {
      return reply.code(404).send({ errorCode: SATIM_SPEC.errorCodes.invalidOrderId, errorMessage: 'Order not found' });
    }
    reply.type('text/html; charset=utf-8').send(renderSatimHostedPage(order));
  });

  app.post<{
    Params: { orderId: string };
    Body: { action?: string; cardPan?: string; outcome?: string };
  }>('/pay/satim/:orderId/action', async (request, reply) => {
    const order = ctx.store.getResource<SatimOrder>(NS.orders, request.params.orderId);
    if (!order) {
      return reply.code(404).send({ errorCode: SATIM_SPEC.errorCodes.invalidOrderId, errorMessage: 'Order not found' });
    }

    const resolved = ctx.scenarios.resolve({
      provider: 'satim',
      headerScenario: getScenarioHeader(request),
      resourceId: order.orderId,
    });

    if (order.state === 'PAID' && resolved.name === 'double_charge_attempt') {
      return reply.code(409).send({
        errorCode: SATIM_SPEC.errorCodes.duplicateOrder,
        errorMessage: 'Order is already paid (double charge attempt rejected)',
      });
    }

    const pan = request.body?.cardPan?.trim();
    const cardMatch = SATIM_SPEC.fakeTestCards.find((c) => c.pan === pan);

    let outcome: SatimOutcome = 'success';
    if (request.body?.action === 'user_cancelled') {
      outcome = 'user_cancelled';
    } else if (request.body?.outcome) {
      outcome = request.body.outcome as SatimOutcome;
    } else if (cardMatch) {
      outcome = cardMatch.outcome;
    } else if (
      ['declined', 'insufficient_funds', 'expired_card', 'user_cancelled', '3ds_timeout'].includes(
        resolved.name,
      )
    ) {
      outcome = resolved.name as SatimOutcome;
    }

    const maskedPan = cardMatch?.masked ?? (pan ? `${pan.slice(0, 6)}******${pan.slice(-4)}` : '400000******0001');

    try {
      const updated = applyPaymentOutcome(
        order,
        outcome,
        ctx.clock.isoNow(),
        maskedPan,
        ctx.rng.hex(6).toUpperCase(),
      );
      ctx.store.setResource(NS.orders, updated.orderId, updated);

      const targetBase = updated.state === 'PAID' ? updated.returnUrl : updated.failUrl;
      const redirectUrl = new URL(targetBase);
      redirectUrl.searchParams.set('orderId', updated.orderId);

      if ((request.headers.accept ?? '').includes('application/json')) {
        return {
          ok: updated.state === 'PAID',
          orderId: updated.orderId,
          orderStatus: updated.orderStatus,
          actionCode: updated.actionCode,
          state: updated.state,
          redirectUrl: redirectUrl.toString(),
        };
      }
      return reply.redirect(redirectUrl.toString());
    } catch (err) {
      if (err instanceof SatimTransitionError) {
        return reply.code(409).send({ errorCode: err.code, errorMessage: err.message });
      }
      throw err;
    }
  });

  // Register endpoints under both /payment/rest and root /
  for (const prefix of ['', '/payment/rest']) {
    for (const ep of SATIM_SPEC.endpoints.register) {
      app.get(`${prefix}/${ep}`, handleRegister);
      app.post(`${prefix}/${ep}`, handleRegister);
    }
    for (const ep of SATIM_SPEC.endpoints.confirm) {
      app.get(`${prefix}/${ep}`, handleStatusOrConfirm);
      app.post(`${prefix}/${ep}`, handleStatusOrConfirm);
    }
    for (const ep of SATIM_SPEC.endpoints.refund) {
      app.get(`${prefix}/${ep}`, handleRefund);
      app.post(`${prefix}/${ep}`, handleRefund);
    }
  }

  return app;
}
