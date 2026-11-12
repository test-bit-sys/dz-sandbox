import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import YAML from 'yaml';
import {
  applyNetworkScenario,
  getScenarioHeader,
  registerRequestAuditHook,
  type SandboxContext,
} from './http.js';

export const OPENAPI_EXPERIMENTAL_LIMITATIONS = [
  'Experimental generator: creates stateless request/response mocks only (no multi-step order/parcel state machine).',
  'Only local #/components/* JSON pointers are resolved; external URL/file $ref values are unsupported.',
  'Polymorphic keywords (oneOf/anyOf/allOf) synthesize using the first branch without discriminator routing.',
  'Authentication headers and outgoing webhooks are not automatically synthesized beyond static spec responses.',
] as const;

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: Record<string, unknown>;
}

export interface CompiledOpenApiRoute {
  method: string;
  openApiPath: string;
  fastifyPath: string;
  operationId?: string;
  queryParams: OpenApiParameter[];
  requestBodyRequired: boolean;
  requestBodySchema?: Record<string, unknown>;
  successStatus: number;
  responseBody: unknown;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    responses?: Record<string, unknown>;
  };
}

export function parseOpenApiDocument(rawOrObj: string | Record<string, unknown>): OpenApiDocument {
  const parsed: unknown =
    typeof rawOrObj === 'string' ? YAML.parse(rawOrObj) : rawOrObj;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OpenAPI specification must parse to an object.');
  }
  const doc = parsed as Record<string, unknown>;
  if (typeof doc.openapi !== 'string' || !/^3\./.test(doc.openapi)) {
    throw new Error(`Unsupported or missing OpenAPI version (expected 3.x, got ${String(doc.openapi ?? 'none')}).`);
  }
  if (!doc.paths || typeof doc.paths !== 'object' || Array.isArray(doc.paths)) {
    throw new Error('OpenAPI specification must define a paths object.');
  }
  const infoRaw = (doc.info && typeof doc.info === 'object' ? doc.info : {}) as Record<string, unknown>;
  return {
    openapi: doc.openapi,
    info: {
      title: typeof infoRaw.title === 'string' ? infoRaw.title : 'Experimental Provider',
      version: typeof infoRaw.version === 'string' ? infoRaw.version : '0.0.1',
    },
    paths: doc.paths as Record<string, Record<string, unknown>>,
    components: doc.components as OpenApiDocument['components'],
  };
}

export function resolveLocalRef(
  doc: OpenApiDocument,
  node: unknown,
  visited = new Set<string>(),
): Record<string, unknown> {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return {};
  }
  const rec = node as Record<string, unknown>;
  if (typeof rec.$ref !== 'string') {
    return rec;
  }
  const ref = rec.$ref;
  if (!ref.startsWith('#/')) {
    throw new Error(`External OpenAPI $ref is not supported in experimental generator: ${ref}`);
  }
  if (visited.has(ref)) {
    return {};
  }
  visited.add(ref);
  const segments = ref
    .slice(2)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur: unknown = doc;
  for (const seg of segments) {
    if (!cur || typeof cur !== 'object' || !(seg in cur)) {
      throw new Error(`Unresolved local OpenAPI $ref: ${ref}`);
    }
    cur = (cur as Record<string, unknown>)[seg];
  }
  return resolveLocalRef(doc, cur, visited);
}

export function synthesizeFromSchema(
  doc: OpenApiDocument,
  schemaInput: unknown,
  depth = 0,
): unknown {
  if (depth > 8 || !schemaInput || typeof schemaInput !== 'object') {
    return null;
  }
  const schema = resolveLocalRef(doc, schemaInput);
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  const union = schema.oneOf ?? schema.anyOf ?? schema.allOf;
  if (Array.isArray(union) && union.length > 0) {
    return synthesizeFromSchema(doc, union[0], depth + 1);
  }

  const schemaType =
    typeof schema.type === 'string'
      ? schema.type
      : schema.properties
        ? 'object'
        : schema.items
          ? 'array'
          : 'string';

  if (schemaType === 'object') {
    const out: Record<string, unknown> = {};
    const props = (schema.properties ?? {}) as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(props)) {
      out[key] = synthesizeFromSchema(doc, propSchema, depth + 1);
    }
    return out;
  }
  if (schemaType === 'array') {
    return [synthesizeFromSchema(doc, schema.items ?? { type: 'string' }, depth + 1)];
  }
  if (schemaType === 'integer') return 100;
  if (schemaType === 'number') return 100.5;
  if (schemaType === 'boolean') return true;

  const fmt = typeof schema.format === 'string' ? schema.format : '';
  if (fmt === 'date-time') return '2026-01-01T09:00:00.000Z';
  if (fmt === 'date') return '2026-01-01';
  if (fmt === 'email') return 'sandbox@example.com';
  if (fmt === 'uuid') return '00000000-0000-4000-8000-000000000001';
  if (fmt === 'uri' || fmt === 'url') return 'https://sandbox.example.invalid/callback';
  return 'sample';
}

export function validateSchemaValue(
  doc: OpenApiDocument,
  value: unknown,
  schemaInput: unknown,
  fieldPath = 'body',
): string[] {
  if (!schemaInput || typeof schemaInput !== 'object') return [];
  const schema = resolveLocalRef(doc, schemaInput);
  const errors: string[] = [];

  if (Array.isArray(schema.enum) && schema.enum.length > 0 && !schema.enum.includes(value)) {
    errors.push(`${fieldPath} must be one of: ${schema.enum.map(String).join(', ')}`);
    return errors;
  }

  const expectedType =
    typeof schema.type === 'string'
      ? schema.type
      : schema.properties
        ? 'object'
        : undefined;

  if (expectedType === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${fieldPath} must be an object`);
      return errors;
    }
    const obj = value as Record<string, unknown>;
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const reqKey of required) {
      if (typeof reqKey === 'string' && (obj[reqKey] === undefined || obj[reqKey] === null)) {
        errors.push(`${fieldPath}.${reqKey} is required`);
      }
    }
    const props = (schema.properties ?? {}) as Record<string, unknown>;
    for (const [propKey, propSchema] of Object.entries(props)) {
      if (obj[propKey] !== undefined) {
        errors.push(...validateSchemaValue(doc, obj[propKey], propSchema, `${fieldPath}.${propKey}`));
      }
    }
    return errors;
  }

  if (expectedType === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${fieldPath} must be an array`);
      return errors;
    }
    if (schema.items) {
      value.forEach((item, idx) => {
        errors.push(...validateSchemaValue(doc, item, schema.items, `${fieldPath}[${idx}]`));
      });
    }
    return errors;
  }

  if (expectedType === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${fieldPath} must be a string`);
    } else {
      if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
        errors.push(`${fieldPath} length must be >= ${schema.minLength}`);
      }
      if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
        errors.push(`${fieldPath} length must be <= ${schema.maxLength}`);
      }
    }
    return errors;
  }

  if (expectedType === 'integer' || expectedType === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value) || (expectedType === 'integer' && !Number.isInteger(value))) {
      errors.push(`${fieldPath} must be a ${expectedType}`);
    } else {
      if (typeof schema.minimum === 'number' && value < schema.minimum) {
        errors.push(`${fieldPath} must be >= ${schema.minimum}`);
      }
      if (typeof schema.maximum === 'number' && value > schema.maximum) {
        errors.push(`${fieldPath} must be <= ${schema.maximum}`);
      }
    }
    return errors;
  }

  if (expectedType === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${fieldPath} must be a boolean`);
  }

  return errors;
}

function pickExampleOrSynthesized(doc: OpenApiDocument, jsonMedia: Record<string, unknown>): unknown {
  if (jsonMedia.example !== undefined) return jsonMedia.example;
  if (jsonMedia.examples && typeof jsonMedia.examples === 'object') {
    const first = Object.values(jsonMedia.examples as Record<string, unknown>)[0];
    if (first && typeof first === 'object' && 'value' in first) {
      return (first as Record<string, unknown>).value;
    }
  }
  if (jsonMedia.schema) {
    return synthesizeFromSchema(doc, jsonMedia.schema);
  }
  return { ok: true, experimental: true };
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

export function compileOpenApiMockRoutes(doc: OpenApiDocument): CompiledOpenApiRoute[] {
  const routes: CompiledOpenApiRoute[] = [];

  for (const [openApiPath, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const sharedParams = Array.isArray(pathItem.parameters) ? (pathItem.parameters as OpenApiParameter[]) : [];
    const fastifyPath = openApiPath.replace(/\{([^}]+)\}/g, ':$1');

    for (const [rawMethod, rawOp] of Object.entries(pathItem)) {
      const method = rawMethod.toLowerCase();
      if (!HTTP_METHODS.has(method) || !rawOp || typeof rawOp !== 'object') continue;
      const op = rawOp as Record<string, unknown>;

      const opParams = Array.isArray(op.parameters) ? (op.parameters as OpenApiParameter[]) : [];
      const allParams = [...sharedParams, ...opParams];
      const queryParams = allParams.filter((p) => p && p.in === 'query' && typeof p.name === 'string');

      let requestBodyRequired = false;
      let requestBodySchema: Record<string, unknown> | undefined;
      if (op.requestBody && typeof op.requestBody === 'object') {
        const rb = op.requestBody as Record<string, unknown>;
        requestBodyRequired = rb.required === true;
        const content = (rb.content ?? {}) as Record<string, unknown>;
        const jsonContent = (content['application/json'] ?? Object.values(content)[0]) as
          | Record<string, unknown>
          | undefined;
        if (jsonContent?.schema) {
          requestBodySchema = resolveLocalRef(doc, jsonContent.schema);
        }
      }

      const responses = (op.responses ?? {}) as Record<string, unknown>;
      const statusCodes = Object.keys(responses)
        .filter((k) => /^[123]\d\d$/.test(k))
        .sort();
      const chosenCode = statusCodes[0] ?? Object.keys(responses)[0] ?? '200';
      const successStatus = /^[1-5]\d\d$/.test(chosenCode) ? Number.parseInt(chosenCode, 10) : 200;

      let responseBody: unknown = { ok: true, experimental: true };
      const rawResp = responses[chosenCode];
      if (rawResp && typeof rawResp === 'object') {
        const respObj = resolveLocalRef(doc, rawResp);
        const content = (respObj.content ?? {}) as Record<string, unknown>;
        const jsonMedia = (content['application/json'] ?? Object.values(content)[0]) as
          | Record<string, unknown>
          | undefined;
        if (jsonMedia) {
          responseBody = pickExampleOrSynthesized(doc, jsonMedia);
        } else if (successStatus === 204) {
          responseBody = '';
        }
      }

      routes.push({
        method: method.toUpperCase(),
        openApiPath,
        fastifyPath,
        operationId: typeof op.operationId === 'string' ? op.operationId : undefined,
        queryParams,
        requestBodyRequired,
        requestBodySchema,
        successStatus,
        responseBody,
      });
    }
  }

  return routes;
}

export interface OpenApiMockServerOptions {
  provider: string;
  spec: string | Record<string, unknown>;
  ctx?: SandboxContext;
}

export function createOpenApiMockServer(opts: OpenApiMockServerOptions): {
  app: FastifyInstance;
  doc: OpenApiDocument;
  routes: CompiledOpenApiRoute[];
} {
  const doc = parseOpenApiDocument(opts.spec);
  const routes = compileOpenApiMockRoutes(doc);
  const app = Fastify({ logger: false, bodyLimit: 512 * 1024 });

  if (opts.ctx) {
    registerRequestAuditHook(app, opts.ctx, opts.provider);
  }

  app.get('/health', async () => ({
    status: 'ok',
    service: `mock-${opts.provider}`,
    experimental: true,
    generator: 'openapi',
    openApiTitle: doc.info.title,
    openApiVersion: doc.info.version,
    routeCount: routes.length,
  }));

  for (const route of routes) {
    app.route({
      method: route.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url: route.fastifyPath,
      handler: async (request, reply) => {
        reply.header('x-dz-experimental', 'openapi-generator');
        if (opts.ctx) {
          const resolved = opts.ctx.scenarios.resolve({
            provider: opts.provider,
            headerScenario: getScenarioHeader(request),
          });
          (request as typeof request & { _dzScenario?: string })._dzScenario = resolved.name;
          if (await applyNetworkScenario(opts.ctx, opts.provider, request, reply, resolved)) {
            return;
          }
        }

        const validationErrors: string[] = [];
        const queryObj = (request.query ?? {}) as Record<string, unknown>;
        for (const qp of route.queryParams) {
          const val = queryObj[qp.name];
          if (qp.required && (val === undefined || val === '')) {
            validationErrors.push(`query.${qp.name} is required`);
          } else if (val !== undefined && qp.schema) {
            const resolvedSchema = resolveLocalRef(doc, qp.schema);
            const coerced =
              resolvedSchema.type === 'integer' || resolvedSchema.type === 'number'
                ? Number(val)
                : resolvedSchema.type === 'boolean'
                  ? val === 'true'
                    ? true
                    : val === 'false'
                      ? false
                      : val
                  : val;
            validationErrors.push(...validateSchemaValue(doc, coerced, resolvedSchema, `query.${qp.name}`));
          }
        }

        if (route.requestBodyRequired && (request.body === undefined || request.body === null)) {
          validationErrors.push('body is required');
        } else if (route.requestBodySchema && request.body !== undefined) {
          validationErrors.push(...validateSchemaValue(doc, request.body, route.requestBodySchema, 'body'));
        }

        if (validationErrors.length > 0) {
          return reply.code(422).send({
            error: 'OPENAPI_VALIDATION_ERROR',
            experimental: true,
            provider: opts.provider,
            details: validationErrors,
          });
        }

        return reply.code(route.successStatus).send(route.responseBody);
      },
    });
  }

  return { app, doc, routes };
}

export interface GenerateOpenApiFilesOptions {
  provider: string;
  openApiPath: string;
  outDir: string;
}

export interface GeneratedOpenApiResult {
  provider: string;
  outDir: string;
  experimental: true;
  routes: CompiledOpenApiRoute[];
  files: string[];
}

export function generateOpenApiProviderFiles(opts: GenerateOpenApiFilesOptions): GeneratedOpenApiResult {
  const safeName = opts.provider
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!safeName || !/[a-z0-9]/.test(safeName)) {
    throw new Error('Invalid provider name for OpenAPI generator.');
  }
  const raw = readFileSync(path.resolve(opts.openApiPath), 'utf8');
  const doc = parseOpenApiDocument(raw);
  const routes = compileOpenApiMockRoutes(doc);

  const absOut = path.resolve(opts.outDir);
  mkdirSync(absOut, { recursive: true });

  const specPath = path.join(absOut, 'openapi.spec.json');
  const metaPath = path.join(absOut, `${safeName}.metadata.json`);
  const serverPath = path.join(absOut, 'server.mjs');
  const readmePath = path.join(absOut, 'README.md');

  writeFileSync(specPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  writeFileSync(
    metaPath,
    `${JSON.stringify(
      {
        provider: safeName,
        experimental: true,
        verified: false,
        source: `openapi:${path.basename(opts.openApiPath)}`,
        title: doc.info.title,
        version: doc.info.version,
        limitations: OPENAPI_EXPERIMENTAL_LIMITATIONS,
        routes: routes.map((r) => ({ method: r.method, path: r.fastifyPath, status: r.successStatus })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const serverScript = `import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createOpenApiMockServer,
  MemoryStore,
  ScenarioEngine,
  SeededRNG,
  VirtualClock,
} from '@dz-sandbox/core';

const __dir = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(__dir, 'openapi.spec.json'), 'utf8'));

const store = new MemoryStore();
const clock = new VirtualClock();
const rng = new SeededRNG(1337);
const scenarios = new ScenarioEngine(store);

const port = Number.parseInt(process.env.PORT || '4200', 10);
const { app } = createOpenApiMockServer({
  provider: ${JSON.stringify(safeName)},
  spec,
  ctx: { store, clock, rng, scenarios },
});

const addr = await app.listen({ host: '127.0.0.1', port });
console.log('[EXPERIMENTAL] OpenAPI mock "${safeName}" listening at ' + addr);
`;
  writeFileSync(serverPath, serverScript, 'utf8');

  const routeLines = routes
    .map((r) => `- \`${r.method} ${r.fastifyPath}\` -> \`${r.successStatus}\``)
    .join('\n');
  const limitLines = OPENAPI_EXPERIMENTAL_LIMITATIONS.map((l) => `- ${l}`).join('\n');
  const readme = `# ${safeName} (EXPERIMENTAL OpenAPI Mock)

> [!WARNING]
> **EXPERIMENTAL:** Generated from \`${path.basename(opts.openApiPath)}\` (${doc.info.title} v${doc.info.version}). Behavior is stateless schema/example synthesis and may differ substantially from production.

## Compiled Routes

${routeLines || '- _(none)_'}

## Known Limitations

${limitLines}

## Run

\`\`\`bash
node server.mjs
\`\`\`

Scenario headers such as \`X-Dz-Scenario: gateway_500\` and \`X-Dz-Scenario: slow\` are active automatically.
`;
  writeFileSync(readmePath, readme, 'utf8');

  return {
    provider: safeName,
    outDir: absOut,
    experimental: true,
    routes,
    files: [specPath, metaPath, serverPath, readmePath],
  };
}
