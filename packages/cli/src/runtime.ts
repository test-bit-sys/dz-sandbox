import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  createStoreFromEnv,
  resolveBindHost,
  ScenarioEngine,
  SeededRNG,
  VirtualClock,
  WebhookDispatcher,
  type SandboxContext,
  type SandboxStore,
} from '@dz-sandbox/core';
import { createControlServer } from '@dz-sandbox/control';
import { CHARGILY_SPEC, createChargilyServer } from '@dz-sandbox/mock-chargily';
import { createSatimServer } from '@dz-sandbox/mock-satim';
import { createYalidineServer } from '@dz-sandbox/mock-yalidine';

export interface SandboxRuntimeOptions {
  host?: string;
  controlPort?: number;
  chargilyPort?: number;
  satimPort?: number;
  yalidinePort?: number;
  store?: SandboxStore;
  seed?: number;
  scenariosDir?: string;
  watchScenarios?: boolean;
}

export interface SandboxRuntime {
  host: string;
  ports: {
    control: number;
    chargily: number;
    satim: number;
    yalidine: number;
  };
  urls: {
    control: string;
    chargily: string;
    satim: string;
    yalidine: string;
  };
  ctx: SandboxContext;
  webhooks: WebhookDispatcher;
  servers: {
    control: FastifyInstance;
    chargily: FastifyInstance;
    satim: FastifyInstance;
    yalidine: FastifyInstance;
  };
  stop(): Promise<void>;
}

function parsePort(val: string | undefined, fallback: number): number {
  if (val === undefined) return fallback;
  const parsed = Number.parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function actualPort(app: FastifyInstance, fallback: number): number {
  const addr = app.server.address();
  if (addr && typeof addr === 'object') return addr.port;
  return fallback;
}

export async function startSandboxRuntime(
  options: SandboxRuntimeOptions = {},
): Promise<SandboxRuntime> {
  const host = resolveBindHost(options.host);
  const store = options.store ?? createStoreFromEnv(process.env);
  const clock = new VirtualClock();
  const rng = new SeededRNG(options.seed ?? parsePort(process.env.DZ_SEED, 1337));
  const scenarios = new ScenarioEngine(store);

  const scenariosDir = options.scenariosDir ?? path.resolve(process.cwd(), 'scenarios');
  scenarios.loadFromDirectory(scenariosDir);
  if (options.watchScenarios !== false) {
    scenarios.watchDirectory(scenariosDir);
  }

  const ctx: SandboxContext = {
    store,
    clock,
    rng,
    scenarios,
    timeoutMs: parsePort(process.env.DZ_TIMEOUT_MS, 30_000),
  };
  const webhooks = new WebhookDispatcher(store, clock, rng);

  const reqControlPort = options.controlPort ?? parsePort(process.env.DZ_CONTROL_PORT, 4000);
  const reqChargilyPort = options.chargilyPort ?? parsePort(process.env.DZ_CHARGILY_PORT, 4001);
  const reqSatimPort = options.satimPort ?? parsePort(process.env.DZ_SATIM_PORT, 4002);
  const reqYalidinePort = options.yalidinePort ?? parsePort(process.env.DZ_YALIDINE_PORT, 4003);

  const chargily = createChargilyServer({ ctx, webhooks });
  const satim = createSatimServer({ ctx });
  const yalidine = createYalidineServer({ ctx, webhooks });

  await chargily.listen({ host, port: reqChargilyPort });
  await satim.listen({ host, port: reqSatimPort });
  await yalidine.listen({ host, port: reqYalidinePort });

  const chargilyPort = actualPort(chargily, reqChargilyPort);
  const satimPort = actualPort(satim, reqSatimPort);
  const yalidinePort = actualPort(yalidine, reqYalidinePort);

  const control = createControlServer({
    store,
    clock,
    rng,
    scenarios,
    webhooks,
    serviceHealth: () => ({
      chargily: { status: 'ok', port: chargilyPort },
      satim: { status: 'ok', port: satimPort },
      yalidine: { status: 'ok', port: yalidinePort },
    }),
    onTrigger: async ({ provider, eventType, targetUrl, payload }) => {
      if (!targetUrl) {
        return { note: 'No targetUrl provided; specify targetUrl to dispatch HTTP webhook.' };
      }
      return webhooks.dispatch({
        provider,
        eventType,
        targetUrl,
        payload: payload ?? {
          id: rng.id('evt'),
          entity: 'event',
          type: eventType,
          provider,
          created_at: Math.floor(clock.now() / 1000),
        },
        secret: CHARGILY_SPEC.defaultSecretKey,
        signatureHeader: provider === 'chargily' ? CHARGILY_SPEC.webhookSignatureHeader : 'x-dz-signature',
      });
    },
  });

  await control.listen({ host, port: reqControlPort });
  const controlPort = actualPort(control, reqControlPort);

  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;

  return {
    host,
    ports: {
      control: controlPort,
      chargily: chargilyPort,
      satim: satimPort,
      yalidine: yalidinePort,
    },
    urls: {
      control: `http://${displayHost}:${controlPort}`,
      chargily: `http://${displayHost}:${chargilyPort}/api/v2`,
      satim: `http://${displayHost}:${satimPort}/payment/rest`,
      yalidine: `http://${displayHost}:${yalidinePort}/v1`,
    },
    ctx,
    webhooks,
    servers: { control, chargily, satim, yalidine },
    async stop() {
      scenarios.stopWatching();
      await Promise.all([
        control.close(),
        chargily.close(),
        satim.close(),
        yalidine.close(),
      ]);
      store.close();
    },
  };
}
