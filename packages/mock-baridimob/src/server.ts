import formbody from '@fastify/formbody';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  applyNetworkScenario,
  getScenarioHeader,
  registerRequestAuditHook,
  type SandboxContext,
} from '@dz-sandbox/core';
import { BARIDIMOB_SPEC } from './baridimob.spec.js';

export interface BaridiMobServerDeps {
  ctx: SandboxContext;
}

const NS = {
  transactions: 'baridimob:transactions',
  pendingTransfers: 'baridimob:pending_transfers',
} as const;

function extractParams(request: FastifyRequest): Record<string, unknown> {
  const query = (request.query as Record<string, unknown> | undefined) ?? {};
  const body =
    request.body && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {};
  return { ...query, ...body };
}

export function createBaridiMobServer(deps: BaridiMobServerDeps): FastifyInstance {
  const { ctx } = deps;
  const app = Fastify({ logger: false, bodyLimit: 512 * 1024 });
  app.register(formbody);
  registerRequestAuditHook(app, ctx, 'baridimob');

  // Pre-handler hook to enforce network-level scenarios (500, 429, timeout, network drop, etc.)
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') return;
    const resolved = ctx.scenarios.resolve({
      provider: 'baridimob',
      headerScenario: getScenarioHeader(request),
    });
    (request as FastifyRequest & { _dzScenario?: string })._dzScenario = resolved.name;
    if (await applyNetworkScenario(ctx, 'baridimob', request, reply, resolved)) {
      return reply;
    }
  });

  function getActiveScenario(request: FastifyRequest, resourceId?: string): string {
    if (resourceId) {
      const resolved = ctx.scenarios.resolve({
        provider: 'baridimob',
        headerScenario: getScenarioHeader(request),
        resourceId,
      });
      return resolved.name;
    }
    return (request as FastifyRequest & { _dzScenario?: string })._dzScenario ?? 'success';
  }

  // Health check endpoint
  app.get('/health', async () => ({
    status: 'ok',
    service: 'mock-baridimob',
    spec: { verified: BARIDIMOB_SPEC.verified },
  }));

  // Register routes on both standard /mobilebank/service/:endpoint and /:endpoint
  function registerRoute(
    methods: ('GET' | 'POST')[],
    endpoint: string,
    handler: (request: FastifyRequest) => Promise<unknown>,
  ) {
    app.route({
      method: methods,
      url: `/mobilebank/service/${endpoint}`,
      handler,
    });
    app.route({
      method: methods,
      url: `/${endpoint}`,
      handler,
    });
  }

  // 1. Auth: login & login/hash
  const handleLogin = async (request: FastifyRequest) => {
    const scenario = getActiveScenario(request);
    const params = extractParams(request);

    if (scenario === 'account_locked') {
      return { result: BARIDIMOB_SPEC.resultCodes.accountLocked };
    }
    if (scenario === 'device_confirm_required') {
      return { result: BARIDIMOB_SPEC.resultCodes.deviceConfirmRequired };
    }
    if (scenario === 'session_expired') {
      return { result: BARIDIMOB_SPEC.resultCodes.sessionClosed };
    }

    const pwd = String(params['pwd'] ?? '');
    if (pwd === 'wrong') {
      return { result: BARIDIMOB_SPEC.resultCodes.invalidLoginPass };
    }
    if (pwd === 'needs_hash' && !request.url.includes('/hash')) {
      return { result: BARIDIMOB_SPEC.resultCodes.hashedPasswordError };
    }

    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      session: {
        devid: String(params['devid'] ?? 'dev_mock_01'),
        token: 'tok_mock_' + ctx.rng.hex(8),
      },
    };
  };
  registerRoute(['POST'], 'login', handleLogin);
  registerRoute(['POST'], 'login/hash', handleLogin);

  // 2. Auth: deviceAttach
  registerRoute(['POST'], 'deviceAttach', async (request) => {
    const scenario = getActiveScenario(request);
    if (scenario === 'account_locked') {
      return { result: BARIDIMOB_SPEC.resultCodes.accountLocked };
    }
    return { result: BARIDIMOB_SPEC.resultCodes.success };
  });

  // 3. Auth: deviceConfirm
  registerRoute(['POST'], 'deviceConfirm', async (request) => {
    const scenario = getActiveScenario(request);
    const params = extractParams(request);
    const devcode = String(params['devcode'] ?? '');

    if (scenario === 'expired_otp') {
      return { result: BARIDIMOB_SPEC.resultCodes.expiredConfirmationCode };
    }
    if (scenario === 'too_many_attempts') {
      return { result: BARIDIMOB_SPEC.resultCodes.tooManyConfirmationAttempts };
    }
    if (scenario === 'invalid_otp' || (devcode && devcode !== BARIDIMOB_SPEC.defaultOtp)) {
      return { result: BARIDIMOB_SPEC.resultCodes.invalidConfirmationCode };
    }

    return { result: BARIDIMOB_SPEC.resultCodes.success };
  });

  // 4. Auth: logout
  registerRoute(['GET', 'POST'], 'logout', async () => {
    return { result: BARIDIMOB_SPEC.resultCodes.success };
  });

  // 5. Accounts
  registerRoute(['GET', 'POST'], 'accounts', async (request) => {
    const scenario = getActiveScenario(request);
    if (scenario === 'session_expired') {
      return { result: BARIDIMOB_SPEC.resultCodes.sessionClosed };
    }
    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      accounts: BARIDIMOB_SPEC.seedAccounts,
    };
  });

  registerRoute(['GET', 'POST'], 'account', async (request) => {
    const scenario = getActiveScenario(request);
    if (scenario === 'session_expired') {
      return { result: BARIDIMOB_SPEC.resultCodes.sessionClosed };
    }
    const params = extractParams(request);
    const id = String(params['id'] ?? BARIDIMOB_SPEC.seedAccounts[0]?.id);
    const found = BARIDIMOB_SPEC.seedAccounts.find((a) => a.id === id) ?? BARIDIMOB_SPEC.seedAccounts[0];
    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      account: found,
    };
  });

  // 6. Account & Card History
  const handleHistory = async (request: FastifyRequest) => {
    const scenario = getActiveScenario(request);
    if (scenario === 'session_expired') {
      return { result: BARIDIMOB_SPEC.resultCodes.sessionClosed };
    }

    const customTx = ctx.store.listResources<Record<string, unknown>>(NS.transactions);
    const all = [...BARIDIMOB_SPEC.seedTransactions, ...customTx];
    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      history: all,
    };
  };
  registerRoute(['GET', 'POST'], 'accountHistory', handleHistory);
  registerRoute(['GET', 'POST'], 'cardHistory', handleHistory);

  // 7. Cards
  registerRoute(['GET', 'POST'], 'cards', async (request) => {
    const scenario = getActiveScenario(request);
    if (scenario === 'session_expired') {
      return { result: BARIDIMOB_SPEC.resultCodes.sessionClosed };
    }
    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      cards: BARIDIMOB_SPEC.seedCards,
    };
  });

  registerRoute(['GET', 'POST'], 'card', async (request) => {
    const scenario = getActiveScenario(request);
    if (scenario === 'session_expired') {
      return { result: BARIDIMOB_SPEC.resultCodes.sessionClosed };
    }
    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      card: BARIDIMOB_SPEC.seedCards[0],
    };
  });

  registerRoute(['GET', 'POST'], 'cardLimits', async (request) => {
    const scenario = getActiveScenario(request);
    if (scenario === 'session_expired') {
      return { result: BARIDIMOB_SPEC.resultCodes.sessionClosed };
    }
    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      limits: BARIDIMOB_SPEC.seedLimits,
    };
  });

  // 8. Transfers
  registerRoute(['POST'], 'transferCheck', async (request) => {
    const scenario = getActiveScenario(request);
    if (scenario === 'session_expired') {
      return { result: BARIDIMOB_SPEC.resultCodes.sessionClosed };
    }
    if (scenario === 'insufficient_funds') {
      return { result: BARIDIMOB_SPEC.resultCodes.transactionDeclined };
    }

    const params = extractParams(request);
    const transRef = 'TR_' + ctx.rng.hex(8).toUpperCase();
    ctx.store.setResource(NS.pendingTransfers, transRef, {
      transRef,
      amount: Number(params['amount'] ?? 0),
      currency: String(params['currency'] ?? 'DZD'),
      sourceId: String(params['sourceId'] ?? ''),
      targetId: String(params['targetId'] ?? ''),
      createdAt: ctx.clock.isoNow(),
    });

    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      transRef,
      confirmReq: { type: 'SMS' },
    };
  });

  registerRoute(['GET', 'POST'], 'getOTPbySMS', async (request) => {
    const scenario = getActiveScenario(request);
    if (scenario === 'session_expired') {
      return { result: BARIDIMOB_SPEC.resultCodes.sessionClosed };
    }
    return { result: BARIDIMOB_SPEC.resultCodes.success };
  });

  registerRoute(['POST'], 'transferExec', async (request) => {
    const params = extractParams(request);
    const transRef = String(params['transRef'] ?? '');
    const scenario = getActiveScenario(request, transRef || undefined);

    if (scenario === 'expired_otp') {
      return { result: BARIDIMOB_SPEC.resultCodes.expiredConfirmationCode };
    }
    if (scenario === 'too_many_attempts') {
      return { result: BARIDIMOB_SPEC.resultCodes.tooManyConfirmationAttempts };
    }

    const confirmVal = String(params['confirmVal'] ?? '');
    if (scenario === 'invalid_otp' || (confirmVal && confirmVal !== BARIDIMOB_SPEC.defaultOtp)) {
      return { result: BARIDIMOB_SPEC.resultCodes.invalidConfirmationCode };
    }
    if (scenario === 'insufficient_funds') {
      return { result: BARIDIMOB_SPEC.resultCodes.transactionDeclined };
    }

    const pending = ctx.store.getResource<{
      amount: number;
      currency: string;
      sourceId: string;
      targetId: string;
    }>(NS.pendingTransfers, transRef);

    const amount = pending?.amount ?? Number(params['amount'] ?? 1000);
    const targetId = pending?.targetId ?? String(params['targetId'] ?? '00799999000000000002');

    // Create dynamic transaction record so subsequent history queries see the transfer
    const timestamp = ctx.clock.isoNow().replace(/[-:TZ.]/g, '').slice(0, 14);
    ctx.store.setResource(NS.transactions, transRef, {
      amount,
      currency: 'DZD',
      description: `Virement envoyé vers ${targetId}`,
      type: '2',
      tid: transRef,
      timestamp,
      feeAmount: 50,
      details: [
        { id: 'refNum', value: `REF-${transRef}` },
        { id: 'recipient', value: targetId },
      ],
    });

    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      transRef,
      status: 'EXECUTED',
    };
  });

  // 9. Bill Payments
  registerRoute(['GET', 'POST'], 'paymentCategories', async () => {
    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      categories: [
        { id: 'telecom', name: 'Téléphonie & Internet' },
        { id: 'utilities', name: 'Électricité & Eau' },
      ],
    };
  });

  registerRoute(['GET', 'POST'], 'paymentProviders', async () => {
    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      providers: [
        { id: 'mobilis', name: 'Mobilis' },
        { id: 'djezzy', name: 'Djezzy' },
        { id: 'ooredoo', name: 'Ooredoo' },
      ],
    };
  });

  registerRoute(['POST'], 'paymentCheck', async (request) => {
    const scenario = getActiveScenario(request);
    if (scenario === 'insufficient_funds') {
      return { result: BARIDIMOB_SPEC.resultCodes.transactionDeclined };
    }
    const transRef = 'PAY_' + ctx.rng.hex(8).toUpperCase();
    return {
      result: BARIDIMOB_SPEC.resultCodes.success,
      transRef,
      confirmReq: { type: 'SMS' },
    };
  });

  registerRoute(['POST'], 'paymentExec', async (request) => {
    const scenario = getActiveScenario(request);
    const params = extractParams(request);
    const confirmVal = String(params['confirmVal'] ?? '');
    if (scenario === 'invalid_otp' || (confirmVal && confirmVal !== BARIDIMOB_SPEC.defaultOtp)) {
      return { result: BARIDIMOB_SPEC.resultCodes.invalidConfirmationCode };
    }
    return { result: BARIDIMOB_SPEC.resultCodes.success, status: 'EXECUTED' };
  });

  return app;
}
