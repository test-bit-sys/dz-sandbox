import Fastify, { type FastifyInstance } from 'fastify';
import {
  applyNetworkScenario,
  getScenarioHeader,
  registerRequestAuditHook,
  type SandboxContext,
} from '@dz-sandbox/core';
import { ZREXPRESS_SPEC } from './zrexpress.spec.js';

export interface ZrExpressServerOptions {
  ctx: SandboxContext;
}

export function createZrExpressServer(opts: ZrExpressServerOptions): FastifyInstance {
  const { ctx } = opts;
  const app = Fastify({ logger: false, bodyLimit: 512 * 1024 });
  registerRequestAuditHook(app, ctx, ZREXPRESS_SPEC.provider);

  app.get('/health', async () => ({
    status: 'ok',
    service: 'mock-zrexpress',
    scaffold: true,
    verified: ZREXPRESS_SPEC.verified,
  }));

  app.all('/*', async (request, reply) => {
    const resolved = ctx.scenarios.resolve({
      provider: ZREXPRESS_SPEC.provider,
      headerScenario: getScenarioHeader(request),
    });
    (request as typeof request & { _dzScenario?: string })._dzScenario = resolved.name;
    if (await applyNetworkScenario(ctx, ZREXPRESS_SPEC.provider, request, reply, resolved)) {
      return;
    }

    return reply.code(501).send({
      error: 'NOT_IMPLEMENTED_AWAITING_SPEC',
      provider: ZREXPRESS_SPEC.provider,
      scaffold: true,
      verified: false,
      message:
        'ZR Express endpoints are not simulated yet because no official documentation or sanitized captures are present. See docs/SPEC_STATUS.md and docs/CAPTURE_GUIDE.md.',
    });
  });

  return app;
}
