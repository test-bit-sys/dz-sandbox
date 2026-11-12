import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_INITIAL_CLOCK_MS,
  isLoopbackHostOrIp,
  isSafeHttpUrl,
  sanitizeHostHeader,
  ScenarioDefinitionSchema,
  timingSafeEqualToken,
  type SandboxBundle,
  type SandboxStateSnapshot,
  type SandboxStore,
  type ScenarioEngine,
  type SeededRNG,
  type VirtualClock,
  type WebhookDispatcher,
} from '@dz-sandbox/core';
import { buildControlOpenApiSpec } from './openapi.js';
import { DASHBOARD_LOCALES, renderDashboardHtml, type DashboardLang } from './dashboard.js';

export type TriggerHandler = (opts: {
  provider: string;
  eventType: string;
  payload?: unknown;
  targetUrl?: string;
  resourceId?: string;
}) => Promise<unknown>;

export interface ControlServerDeps {
  store: SandboxStore;
  clock: VirtualClock;
  rng: SeededRNG;
  scenarios: ScenarioEngine;
  webhooks: WebhookDispatcher;
  controlToken?: string;
  allowUnauthenticatedRemote?: boolean;
  onTrigger?: TriggerHandler;
  onReset?: () => void;
  dashboardHtml?: () => string;
  serviceHealth?: () => Record<string, { status: string; port?: number }>;
}

const SafeHttpUrlSchema = z
  .string()
  .max(2048)
  .refine(isSafeHttpUrl, { message: 'URL must use http(s) without embedded credentials' });

const SetProviderScenarioSchema = z.object({
  scenario: z.string().min(1).max(120).optional(),
  sequence: z.array(z.string().min(1).max(120)).min(1).max(100).optional(),
  loop: z.boolean().optional(),
});

const SetResourceScenarioSchema = z.object({
  scenario: z.string().min(1).max(120),
});

const AdvanceClockSchema = z.object({
  duration: z.union([z.number().nonnegative(), z.string().min(1).max(32)]),
});

const TriggerBodySchema = z
  .object({
    targetUrl: SafeHttpUrlSchema.optional(),
    resourceId: z.string().max(128).optional(),
    secret: z.string().max(512).optional(),
    payload: z.unknown().optional(),
  })
  .optional();

const ImportBundleSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  clockMs: z.number(),
  seed: z.number(),
  defaults: z.record(z.string()),
  resourceScenarios: z.record(z.record(z.string())),
  sequenceScenarios: z.record(
    z.object({
      steps: z.array(z.string()).max(100),
      index: z.number().int().nonnegative(),
      loop: z.boolean().optional(),
    }),
  ),
  customScenarios: z.array(ScenarioDefinitionSchema).max(200),
  resources: z.record(z.record(z.unknown())),
});

export function createControlServer(deps: ControlServerDeps): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024,
  });

  const configuredToken = deps.controlToken ?? process.env.DZ_CONTROL_TOKEN?.trim() ?? '';
  const allowUnauthRemote =
    deps.allowUnauthenticatedRemote ?? (process.env.DZ_ALLOW_UNAUTH_CONTROL === 'true');

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (pathname === '/health' || pathname === '/__control/health') {
      return;
    }
    if (!pathname.startsWith('/__control')) {
      return;
    }
    if (configuredToken) {
      const authHeader = request.headers.authorization;
      const match = authHeader ? /^Bearer\s+(.+)$/i.exec(authHeader.trim()) : null;
      const candidate = match?.[1]?.trim() ?? '';
      if (!candidate || !timingSafeEqualToken(configuredToken, candidate)) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: 'Control API requires Authorization: Bearer <DZ_CONTROL_TOKEN>',
        });
      }
      return;
    }
    if (!allowUnauthRemote && !isLoopbackHostOrIp(request.ip)) {
      return reply.code(403).send({
        error: 'CONTROL_AUTH_REQUIRED',
        message: 'Non-loopback control API access requires DZ_CONTROL_TOKEN or DZ_ALLOW_UNAUTH_CONTROL=true',
      });
    }
  });

  app.get('/health', async () => ({ status: 'ok', service: 'control' }));
  app.get('/__control/health', async () => ({
    status: 'ok',
    service: 'control',
    clockIso: deps.clock.isoNow(),
    providers: deps.serviceHealth ? deps.serviceHealth() : {},
  }));

  app.get('/__control/openapi.json', async (request) => {
    const host = sanitizeHostHeader(request.headers.host, '127.0.0.1:4000');
    return buildControlOpenApiSpec(`http://${host}`);
  });

  app.get('/', async (_request, reply) => {
    if (deps.dashboardHtml) {
      reply.type('text/html; charset=utf-8').send(deps.dashboardHtml());
      return;
    }
    reply.type('text/html; charset=utf-8').send(renderDashboardHtml());
  });

  app.get<{ Params: { lang: string } }>('/locales/:lang.json', async (request, reply) => {
    const key = request.params.lang as DashboardLang;
    if (!Object.hasOwn(DASHBOARD_LOCALES, key)) {
      return reply.code(404).send({ error: 'LOCALE_NOT_FOUND' });
    }
    return DASHBOARD_LOCALES[key];
  });

  app.get('/__control/state', async (): Promise<SandboxStateSnapshot & { pendingTimersList: unknown[] }> => {
    const pending = deps.clock.getPendingTimers();
    return {
      clockIso: deps.clock.isoNow(),
      clockMs: deps.clock.now(),
      pendingTimers: pending.length,
      pendingTimersList: pending,
      seed: deps.rng.getSeed(),
      defaults: deps.store.listDefaultScenarios(),
      resourceScenarios: deps.store.listResourceScenarios(),
      sequenceScenarios: deps.store.listSequenceScenarios(),
      requestCount: deps.store.countRequestLogs(),
      webhookCount: deps.store.countWebhookLogs(),
      storeType: deps.store.kind,
    };
  });

  app.post('/__control/reset', async () => {
    deps.store.reset();
    deps.clock.reset(DEFAULT_INITIAL_CLOCK_MS);
    deps.rng.reset();
    deps.onReset?.();
    return {
      ok: true,
      clockIso: deps.clock.isoNow(),
      seed: deps.rng.getSeed(),
    };
  });

  app.get('/__control/scenarios', async () => {
    return {
      scenarios: deps.scenarios.listAll(),
      defaults: deps.store.listDefaultScenarios(),
      resourceScenarios: deps.store.listResourceScenarios(),
      sequenceScenarios: deps.store.listSequenceScenarios(),
    };
  });

  app.post('/__control/scenarios', async (request, reply) => {
    const parsed = ScenarioDefinitionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_SCENARIO', details: parsed.error.flatten() });
    }
    const created = deps.scenarios.registerCustom(parsed.data);
    return reply.code(201).send({ scenario: created });
  });

  app.put<{ Params: { provider: string } }>('/__control/scenario/:provider', async (request, reply) => {
    const parsed = SetProviderScenarioSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', details: parsed.error.flatten() });
    }
    const { provider } = request.params;
    const { scenario, sequence, loop } = parsed.data;

    if (sequence) {
      const seqState = deps.scenarios.setSequence(provider, sequence, Boolean(loop));
      return { ok: true, provider, mode: 'sequence', sequence: seqState };
    }
    if (!scenario) {
      return reply.code(400).send({ error: 'MISSING_SCENARIO', message: 'Provide scenario or sequence' });
    }
    deps.scenarios.clearSequence(provider);
    deps.scenarios.setDefault(provider, scenario);
    return { ok: true, provider, mode: 'default', scenario };
  });

  app.put<{ Params: { provider: string; resourceId: string } }>(
    '/__control/scenario/:provider/:resourceId',
    async (request, reply) => {
      const parsed = SetResourceScenarioSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', details: parsed.error.flatten() });
      }
      const { provider, resourceId } = request.params;
      deps.scenarios.setResourceScenario(provider, resourceId, parsed.data.scenario);
      return { ok: true, provider, resourceId, scenario: parsed.data.scenario };
    },
  );

  app.delete<{ Params: { provider: string; resourceId: string } }>(
    '/__control/scenario/:provider/:resourceId',
    async (request) => {
      const { provider, resourceId } = request.params;
      const deleted = deps.scenarios.clearResourceScenario(provider, resourceId);
      return { ok: true, deleted };
    },
  );

  app.get<{
    Querystring: {
      provider?: string;
      statusCode?: string;
      since?: string;
      until?: string;
      limit?: string;
    };
  }>('/__control/requests', async (request) => {
    const q = request.query;
    const entries = deps.store.queryRequestLogs({
      provider: q.provider,
      statusCode: q.statusCode ? Number.parseInt(q.statusCode, 10) : undefined,
      since: q.since,
      until: q.until,
      limit: q.limit ? Number.parseInt(q.limit, 10) : 200,
    });
    return { count: entries.length, requests: entries };
  });

  app.get<{
    Querystring: {
      provider?: string;
      status?: 'pending' | 'delivered' | 'failed' | 'suppressed';
      limit?: string;
    };
  }>('/__control/webhooks', async (request) => {
    const q = request.query;
    const webhooks = deps.store.queryWebhookLogs({
      provider: q.provider,
      status: q.status,
      limit: q.limit ? Number.parseInt(q.limit, 10) : 200,
    });
    return { count: webhooks.length, webhooks };
  });

  app.post<{ Params: { id: string } }>('/__control/webhooks/:id/redeliver', async (request, reply) => {
    try {
      const updated = await deps.webhooks.redeliver(request.params.id);
      return { ok: true, webhook: updated };
    } catch (error) {
      return reply.code(404).send({
        error: 'WEBHOOK_NOT_FOUND',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post('/__control/clock/advance', async (request, reply) => {
    const parsed = AdvanceClockSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_DURATION', details: parsed.error.flatten() });
    }
    try {
      const result = await deps.clock.advance(parsed.data.duration);
      return { ok: true, ...result };
    } catch (error) {
      return reply.code(400).send({
        error: 'INVALID_DURATION',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post('/__control/clock/reset', async () => {
    deps.clock.reset(DEFAULT_INITIAL_CLOCK_MS);
    return { ok: true, clockMs: deps.clock.now(), clockIso: deps.clock.isoNow() };
  });

  app.post<{ Params: { provider: string; eventType: string } }>(
    '/__control/trigger/:provider/:eventType',
    async (request, reply) => {
      const parsed = TriggerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', details: parsed.error.flatten() });
      }
      const { provider, eventType } = request.params;
      const body = parsed.data ?? {};

      if (deps.onTrigger) {
        const result = await deps.onTrigger({
          provider,
          eventType,
          payload: body.payload,
          targetUrl: body.targetUrl,
          resourceId: body.resourceId,
        });
        return { ok: true, provider, eventType, result };
      }

      if (!body.targetUrl) {
        return reply.code(400).send({
          error: 'MISSING_TARGET_URL',
          message: 'Provide targetUrl or configure provider trigger handler',
        });
      }

      const entries = await deps.webhooks.dispatch({
        provider,
        eventType,
        targetUrl: body.targetUrl,
        payload: body.payload ?? {
          id: deps.rng.id('evt'),
          type: eventType,
          provider,
          created_at: deps.clock.isoNow(),
        },
        secret: body.secret ?? 'test_sk_dz_sandbox_secret',
      });
      return { ok: true, provider, eventType, webhooks: entries };
    },
  );

  app.get('/__control/export', async (): Promise<SandboxBundle> => {
    return {
      version: 1,
      exportedAt: deps.clock.isoNow(),
      clockMs: deps.clock.now(),
      seed: deps.rng.getSeed(),
      defaults: deps.store.listDefaultScenarios(),
      resourceScenarios: deps.store.listResourceScenarios(),
      sequenceScenarios: deps.store.listSequenceScenarios(),
      customScenarios: deps.store.listCustomScenarios(),
      resources: deps.store.exportAllResources(),
    };
  });

  app.post('/__control/import', async (request, reply) => {
    const parsed = ImportBundleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BUNDLE', details: parsed.error.flatten() });
    }
    const bundle = parsed.data;
    deps.store.reset();
    deps.store.clearCustomScenarios();
    deps.clock.reset(bundle.clockMs);
    deps.rng.reseed(bundle.seed);

    for (const [provider, scenario] of Object.entries(bundle.defaults)) {
      deps.store.setDefaultScenario(provider, scenario);
    }
    for (const [provider, mapping] of Object.entries(bundle.resourceScenarios)) {
      for (const [resourceId, scenario] of Object.entries(mapping)) {
        deps.store.setResourceScenario(provider, resourceId, scenario);
      }
    }
    for (const [provider, seqState] of Object.entries(bundle.sequenceScenarios)) {
      deps.store.setSequenceScenario(provider, seqState);
    }
    for (const custom of bundle.customScenarios) {
      deps.scenarios.registerCustom(custom);
    }
    deps.store.importAllResources(bundle.resources);

    return { ok: true, importedAt: deps.clock.isoNow() };
  });

  return app;
}
