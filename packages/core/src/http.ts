import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { VirtualClock } from './clock.js';
import { redactBody, redactHeaders } from './redact.js';
import type { SeededRNG } from './rng.js';
import type { ResolvedScenario, ScenarioEngine } from './scenarios.js';
import type { SandboxStore } from './store.js';

export interface SandboxContext {
  store: SandboxStore;
  clock: VirtualClock;
  rng: SeededRNG;
  scenarios: ScenarioEngine;
  timeoutMs?: number;
}

export function resolveBindHost(requestedHost?: string): string {
  if (requestedHost) return requestedHost;
  return process.env.DZ_SANDBOX_HOST || '127.0.0.1';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getScenarioHeader(request: FastifyRequest): string | undefined {
  const raw = request.headers['x-dz-scenario'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0];
  return undefined;
}

/**
 * Applies network-level scenario behaviors (latency, timeout, socket drop, HTTP 500/429/401)
 * and logs redacted request/response records to the store.
 *
 * Returns `true` if the request was already terminated by a network/error scenario.
 */
export async function applyNetworkScenario(
  ctx: SandboxContext,
  provider: string,
  request: FastifyRequest,
  reply: FastifyReply,
  resolved: ResolvedScenario,
): Promise<boolean> {
  const { behavior } = resolved.definition;

  if (behavior.headers) {
    for (const [k, v] of Object.entries(behavior.headers)) {
      reply.header(k, v);
    }
  }

  if (behavior.dropSocket) {
    ctx.store.appendRequestLog({
      id: ctx.rng.id('req'),
      provider,
      method: request.method,
      path: request.url,
      headers: redactHeaders(request.headers),
      query: (request.query as Record<string, unknown>) ?? {},
      body: redactBody(request.body),
      statusCode: 0,
      responseBody: { error: 'SOCKET_DROPPED' },
      scenario: resolved.name,
      durationMs: 0,
      timestamp: ctx.clock.isoNow(),
    });
    request.raw.socket?.destroy();
    reply.hijack();
    return true;
  }

  const delayMs = behavior.timeoutMs ?? behavior.latencyMs ?? 0;
  if (delayMs > 0) {
    const cap = ctx.timeoutMs ?? delayMs;
    await sleep(Math.min(delayMs, cap));
    if (behavior.timeoutMs !== undefined && behavior.outcome === 'timeout') {
      reply.code(504).send({
        error: 'GATEWAY_TIMEOUT',
        message: `Simulated gateway timeout after ${Math.min(delayMs, cap)}ms`,
      });
      return true;
    }
  }

  if (
    behavior.httpStatus &&
    [401, 429, 500, 502, 503, 504].includes(behavior.httpStatus)
  ) {
    reply.code(behavior.httpStatus).send({
      error: behavior.errorCode ?? 'SCENARIO_ERROR',
      message: behavior.errorMessage ?? `Simulated HTTP ${behavior.httpStatus}`,
      scenario: resolved.name,
    });
    return true;
  }

  return false;
}

export function registerRequestAuditHook(
  app: FastifyInstance,
  ctx: SandboxContext,
  provider: string,
): void {
  app.addHook('onRequest', async (request) => {
    (request as FastifyRequest & { _dzStartedAt?: number })._dzStartedAt = Date.now();
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const startedAt = (request as FastifyRequest & { _dzStartedAt?: number })._dzStartedAt ?? Date.now();
    const durationMs = Math.max(0, Date.now() - startedAt);
    const scenarioName =
      (request as FastifyRequest & { _dzScenario?: string })._dzScenario ??
      getScenarioHeader(request) ??
      ctx.store.getDefaultScenario(provider) ??
      (provider === 'yalidine' ? 'created_ok' : 'success');

    let parsedResponse: unknown = payload;
    if (typeof payload === 'string') {
      try {
        parsedResponse = JSON.parse(payload) as unknown;
      } catch {
        parsedResponse = payload.slice(0, 500);
      }
    }

    ctx.store.appendRequestLog({
      id: ctx.rng.id('req'),
      provider,
      method: request.method,
      path: request.url,
      headers: redactHeaders(request.headers),
      query: (request.query as Record<string, unknown>) ?? {},
      body: redactBody(request.body),
      statusCode: reply.statusCode,
      responseBody: redactBody(parsedResponse),
      scenario: scenarioName,
      durationMs,
      timestamp: ctx.clock.isoNow(),
    });

    return payload;
  });
}
