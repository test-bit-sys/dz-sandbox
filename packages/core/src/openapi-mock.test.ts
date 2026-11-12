import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compileOpenApiMockRoutes,
  createOpenApiMockServer,
  generateOpenApiProviderFiles,
  MemoryStore,
  parseOpenApiDocument,
  ScenarioEngine,
  SeededRNG,
  synthesizeFromSchema,
  validateSchemaValue,
  VirtualClock,
} from './index.js';

describe('experimental OpenAPI 3.x mock provider generator', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it('parses YAML/JSON OpenAPI 3.x specs, validates inputs, synthesizes examples/schemas, and enforces scenario faults', async () => {
    const demoYamlPath = path.resolve(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'fixtures',
      'openapi-demo',
      'courier-demo.openapi.yaml',
    );
    const yamlText = readFileSync(demoYamlPath, 'utf8');
    const doc = parseOpenApiDocument(yamlText);
    expect(doc.openapi).toBe('3.0.3');

    const routes = compileOpenApiMockRoutes(doc);
    expect(routes.map((r) => `${r.method} ${r.fastifyPath}`)).toEqual([
      'GET /shipments',
      'POST /shipments',
      'GET /shipments/:tracking',
    ]);

    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(101);
    const scenarios = new ScenarioEngine(store);
    cleanups.push(() => store.close());

    const { app } = createOpenApiMockServer({
      provider: 'courier-demo',
      spec: yamlText,
      ctx: { store, clock, rng, scenarios },
    });
    cleanups.push(() => app.close());

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      status: 'ok',
      experimental: true,
      generator: 'openapi',
      routeCount: 3,
    });

    // Valid GET returns example & experimental header
    const listOk = await app.inject({ method: 'GET', url: '/shipments?wilaya_id=16' });
    expect(listOk.statusCode).toBe(200);
    expect(listOk.headers['x-dz-experimental']).toBe('openapi-generator');
    expect(listOk.json().items[0].tracking).toBe('DEMO-16-001');

    // Query schema validation failure
    const badQuery = await app.inject({ method: 'GET', url: '/shipments?wilaya_id=999' });
    expect(badQuery.statusCode).toBe(422);
    expect(badQuery.json().error).toBe('OPENAPI_VALIDATION_ERROR');

    // Body schema validation failure (missing required + invalid enum/minLength)
    const badPost = await app.inject({
      method: 'POST',
      url: '/shipments',
      payload: { recipient_name: 'A', wilaya_id: 16, mode: 'drone' },
    });
    expect(badPost.statusCode).toBe(422);
    const details = badPost.json().details as string[];
    expect(details.some((d) => d.includes('amount_dzd is required'))).toBe(true);
    expect(details.some((d) => d.includes('mode must be one of'))).toBe(true);

    // Missing required body altogether
    const emptyPost = await app.inject({ method: 'POST', url: '/shipments' });
    expect(emptyPost.statusCode).toBe(422);

    // Valid POST synthesizes schema response
    const okPost = await app.inject({
      method: 'POST',
      url: '/shipments',
      payload: { recipient_name: 'Karim', wilaya_id: 16, amount_dzd: 2500, mode: 'home' },
    });
    expect(okPost.statusCode).toBe(201);
    expect(okPost.json()).toEqual({
      tracking: 'DEMO-16-001',
      status: 'created',
      created_at: '2026-01-01T09:00:00.000Z',
    });

    // Scenario engine override works on generated mock
    const err500 = await app.inject({
      method: 'GET',
      url: '/shipments/DEMO-16-001',
      headers: { 'x-dz-scenario': 'gateway_500' },
    });
    expect(err500.statusCode).toBe(500);
  });

  it('generates runnable provider files into an output folder and handles edge cases cleanly', async () => {
    const demoYamlPath = path.resolve(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'fixtures',
      'openapi-demo',
      'courier-demo.openapi.yaml',
    );
    const tmpOut = mkdtempSync(path.join(tmpdir(), 'dz-gen-'));
    cleanups.push(() => rmSync(tmpOut, { recursive: true, force: true }));

    const result = generateOpenApiProviderFiles({
      provider: 'Demo Courier',
      openApiPath: demoYamlPath,
      outDir: tmpOut,
    });
    expect(result.experimental).toBe(true);
    expect(result.provider).toBe('demo-courier');
    expect(result.files.every((f) => existsSync(f))).toBe(true);
    expect(readFileSync(path.join(tmpOut, 'README.md'), 'utf8')).toContain('EXPERIMENTAL');

    // Error branches & synthesis variety
    expect(() => parseOpenApiDocument('[]')).toThrow(/object/);
    expect(() => parseOpenApiDocument({ openapi: '2.0', paths: {} })).toThrow(/Unsupported or missing OpenAPI/);
    expect(() => parseOpenApiDocument({ openapi: '3.0.0' })).toThrow(/paths/);
    expect(() =>
      generateOpenApiProviderFiles({ provider: '!!!', openApiPath: demoYamlPath, outDir: tmpOut }),
    ).toThrow(/Invalid provider name/);

    const docWithTypes = parseOpenApiDocument({
      openapi: '3.0.3',
      info: { title: 'Types', version: '1.0' },
      paths: {
        '/items': {
          delete: {
            responses: { '204': { description: 'Deleted' } },
          },
        },
        '/remote': {
          get: {
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: {
        schemas: {
          Loop: { $ref: '#/components/schemas/Loop' },
        },
      },
    });
    expect(
      synthesizeFromSchema(docWithTypes, {
        type: 'object',
        properties: {
          flag: { type: 'boolean' },
          num: { type: 'number' },
          arr: { type: 'array', items: { type: 'string', format: 'email' } },
          dt: { type: 'string', format: 'date' },
          id: { type: 'string', format: 'uuid' },
          url: { type: 'string', format: 'url' },
          choice: { oneOf: [{ type: 'integer' }] },
          loop: { $ref: '#/components/schemas/Loop' },
        },
      }),
    ).toMatchObject({
      flag: true,
      num: 100.5,
      arr: ['sandbox@example.com'],
      dt: '2026-01-01',
      id: '00000000-0000-4000-8000-000000000001',
      url: 'https://sandbox.example.invalid/callback',
      choice: 100,
    });
    expect(() =>
      compileOpenApiMockRoutes(
        parseOpenApiDocument({
          openapi: '3.0.0',
          paths: {
            '/bad': {
              post: {
                requestBody: {
                  content: { 'application/json': { schema: { $ref: 'https://evil.example/s.json' } } },
                },
                responses: { '200': { description: 'ok' } },
              },
            },
          },
        }),
      ),
    ).toThrow(/External OpenAPI \$ref/);

    // Additional validation + coercion branches (boolean query, required query, arrays, maxLength, examples, 204)
    expect(validateSchemaValue(docWithTypes, 'too-long-text', { type: 'string', maxLength: 3 }).length).toBe(1);
    expect(validateSchemaValue(docWithTypes, 123, { type: 'string' }).length).toBe(1);
    expect(validateSchemaValue(docWithTypes, 'bad', { type: 'object', properties: {} }).length).toBe(1);
    expect(validateSchemaValue(docWithTypes, 'not-arr', { type: 'array', items: { type: 'string' } }).length).toBe(1);
    expect(validateSchemaValue(docWithTypes, ['ok', 42], { type: 'array', items: { type: 'string' } }).length).toBe(1);
    expect(validateSchemaValue(docWithTypes, 'nope', { type: 'boolean' }).length).toBe(1);
    expect(validateSchemaValue(docWithTypes, 999, { type: 'integer', maximum: 10 }).length).toBe(1);

    const richSpec = createOpenApiMockServer({
      provider: 'rich-demo',
      spec: {
        openapi: '3.0.3',
        info: { title: 'Rich Demo', version: '0.1.0' },
        paths: {
          '/check': {
            get: {
              parameters: [
                { name: 'reqFlag', in: 'query', required: true, schema: { type: 'boolean' } },
                { name: 'optNum', in: 'query', schema: { type: 'number', minimum: 1 } },
              ],
              responses: {
                '200': {
                  description: 'ok',
                  content: {
                    'application/json': {
                      examples: { first: { value: { checked: true } } },
                    },
                  },
                },
              },
            },
            delete: {
              responses: { '204': { description: 'empty' } },
            },
          },
        },
      },
    });
    cleanups.push(() => richSpec.app.close());

    expect((await richSpec.app.inject({ method: 'GET', url: '/check' })).statusCode).toBe(422);
    expect((await richSpec.app.inject({ method: 'GET', url: '/check?reqFlag=maybe' })).statusCode).toBe(422);
    expect((await richSpec.app.inject({ method: 'GET', url: '/check?reqFlag=false&optNum=5' })).json()).toEqual({
      checked: true,
    });
    expect((await richSpec.app.inject({ method: 'GET', url: '/check?reqFlag=true' })).statusCode).toBe(200);
    expect((await richSpec.app.inject({ method: 'DELETE', url: '/check' })).statusCode).toBe(204);
  });
});
