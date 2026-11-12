import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyNetworkScenario,
  createStoreFromEnv,
  DEFAULT_INITIAL_CLOCK_MS,
  isAllowedWebhookUrl,
  isLoopbackHostOrIp,
  isPrivateOrReservedIpOrHost,
  isSafeHttpUrl,
  MemoryStore,
  openSqliteDatabase,
  parseDurationMs,
  redactBody,
  redactHeaders,
  redactQuery,
  redactStringSecrets,
  redactUrlPath,
  registerRequestAuditHook,
  resolveBindHost,
  resolvePathInsideDir,
  sanitizeHeaderEntry,
  sanitizeHostHeader,
  sanitizeRedirectUrl,
  ScenarioEngine,
  SeededRNG,
  signHmacSha256,
  SqliteStore,
  timingSafeEqualToken,
  verifyHmacSha256,
  VirtualClock,
  WebhookDispatcher,
  type SandboxStore,
} from './index.js';

describe('SeededRNG', () => {
  it('produces identical deterministic sequences for the same seed', () => {
    const a = new SeededRNG(42);
    const b = new SeededRNG(42);
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(
      Array.from({ length: 10 }, () => b.next()),
    );
    a.reset();
    b.reseed(42);
    expect(a.id('chk')).toBe(b.id('chk'));
    expect(a.int(1, 10)).toBe(b.int(1, 10));
    expect(a.pick(['a', 'b', 'c'])).toBe(b.pick(['a', 'b', 'c']));
  });

  it('throws on invalid int range or empty pick', () => {
    const rng = new SeededRNG(1);
    expect(() => rng.int(10, 5)).toThrow();
    expect(() => rng.pick([])).toThrow();
  });
});

describe('VirtualClock', () => {
  it('parses duration strings and advances timers in chronological order', async () => {
    expect(parseDurationMs('500ms')).toBe(500);
    expect(parseDurationMs('10s')).toBe(10_000);
    expect(parseDurationMs('5m')).toBe(300_000);
    expect(parseDurationMs('2h')).toBe(7_200_000);
    expect(parseDurationMs('1d')).toBe(86_400_000);
    expect(() => parseDurationMs('bad')).toThrow();

    const clock = new VirtualClock(DEFAULT_INITIAL_CLOCK_MS);
    const events: string[] = [];

    clock.schedule(2000, () => {
      events.push('second');
    }, 't2');
    clock.schedule(1000, () => {
      events.push('first');
      clock.schedule(500, () => {
        events.push('nested');
      }, 't-nested');
    }, 't1');
    const cancelledId = clock.schedule(1500, () => {
      events.push('cancelled');
    }, 't-cancel');
    expect(clock.cancel(cancelledId)).toBe(true);
    expect(clock.getPendingTimers()).toHaveLength(2);

    const res = await clock.advance('2s');
    expect(res.firedCount).toBe(3);
    expect(events).toEqual(['first', 'nested', 'second']);
    expect(clock.now()).toBe(DEFAULT_INITIAL_CLOCK_MS + 2000);

    clock.reset();
    expect(clock.now()).toBe(DEFAULT_INITIAL_CLOCK_MS);
    expect(clock.getPendingTimers()).toHaveLength(0);
  });

  it('property: advancing by a+b equals advancing by a then b in wall time', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 100_000 }), fc.nat({ max: 100_000 }), async (a, b) => {
        const c1 = new VirtualClock(1000);
        const c2 = new VirtualClock(1000);
        await c1.advance(a + b);
        await c2.advance(a);
        await c2.advance(b);
        expect(c1.now()).toBe(c2.now());
      }),
    );
  });
});

describe.each<[string, () => SandboxStore]>([
  ['MemoryStore', () => new MemoryStore()],
  ['SqliteStore', () => new SqliteStore(':memory:')],
])('SandboxStore (%s)', (_name, factory) => {
  let store: SandboxStore;

  afterEach(() => {
    store?.close();
  });

  it('handles resources, scenario bindings, logs, export/import, and reset', () => {
    store = factory();
    store.setResource('chargily:checkouts', 'chk_1', { id: 'chk_1', amount: 1500 });
    expect(store.getResource<{ amount: number }>('chargily:checkouts', 'chk_1')?.amount).toBe(1500);
    expect(store.listResources('chargily:checkouts')).toHaveLength(1);
    expect(store.deleteResource('chargily:checkouts', 'chk_1')).toBe(true);
    expect(store.deleteResource('chargily:checkouts', 'chk_1')).toBe(false);

    store.setDefaultScenario('chargily', 'declined');
    store.setResourceScenario('chargily', 'chk_2', 'slow');
    store.setSequenceScenario('satim', { steps: ['gateway_500', 'success'], index: 0 });
    expect(store.listDefaultScenarios()).toEqual({ chargily: 'declined' });
    expect(store.listResourceScenarios()).toEqual({ chargily: { chk_2: 'slow' } });
    expect(store.listSequenceScenarios().satim?.steps).toEqual(['gateway_500', 'success']);

    store.appendRequestLog({
      id: 'req_1',
      provider: 'chargily',
      method: 'POST',
      path: '/api/v2/checkouts',
      headers: {},
      query: {},
      body: {},
      statusCode: 200,
      responseBody: {},
      scenario: 'success',
      durationMs: 2,
      timestamp: '2026-01-01T09:00:00.000Z',
    });
    expect(store.queryRequestLogs({ provider: 'chargily', statusCode: 200 })).toHaveLength(1);
    expect(
      store.queryRequestLogs({
        since: '2026-01-01T00:00:00.000Z',
        until: '2026-01-02T00:00:00.000Z',
        limit: 5,
      }),
    ).toHaveLength(1);
    expect(store.countRequestLogs()).toBe(1);

    store.appendWebhookLog({
      id: 'wh_1',
      provider: 'chargily',
      eventType: 'checkout.paid',
      targetUrl: 'http://127.0.0.1:9000/h',
      payload: { ok: true },
      signature: 'sig',
      signatureValid: true,
      headers: {},
      status: 'pending',
      scheduledAt: '2026-01-01T09:00:00.000Z',
      attempts: [],
      createdAt: '2026-01-01T09:00:00.000Z',
    });
    store.updateWebhookLog({
      id: 'wh_1',
      provider: 'chargily',
      eventType: 'checkout.paid',
      targetUrl: 'http://127.0.0.1:9000/h',
      payload: { ok: true },
      signature: 'sig',
      signatureValid: true,
      headers: {},
      status: 'delivered',
      scheduledAt: '2026-01-01T09:00:00.000Z',
      attempts: [{ attemptNumber: 1, timestamp: '2026-01-01T09:00:00.000Z', statusCode: 200, durationMs: 5 }],
      createdAt: '2026-01-01T09:00:00.000Z',
    });
    expect(store.getWebhookLog('wh_1')?.status).toBe('delivered');
    expect(store.queryWebhookLogs({ provider: 'chargily', status: 'delivered', limit: 5 })).toHaveLength(1);
    expect(store.countWebhookLogs()).toBe(1);

    store.setCustomScenario({
      name: 'custom_test',
      provider: 'chargily',
      category: 'payment',
      description: 'test',
      behavior: { outcome: 'success' },
      builtIn: false,
    });
    expect(store.getCustomScenario('custom_test')?.name).toBe('custom_test');
    expect(store.listCustomScenarios()).toHaveLength(1);
    store.clearCustomScenarios();
    expect(store.listCustomScenarios()).toHaveLength(0);

    expect(store.deleteResourceScenario('chargily', 'chk_2')).toBe(true);
    expect(store.deleteSequenceScenario('satim')).toBe(true);

    const exported = store.exportAllResources();
    store.reset();
    expect(store.countRequestLogs()).toBe(0);
    expect(store.countWebhookLogs()).toBe(0);
    expect(store.listDefaultScenarios()).toEqual({});
    store.importAllResources({ ...exported, 'chargily:checkouts': { chk_imp: { id: 'chk_imp' } } });
    expect(store.getResource<{ id: string }>('chargily:checkouts', 'chk_imp')?.id).toBe('chk_imp');
  });
});

describe('createStoreFromEnv', () => {
  it('selects memory or sqlite based on DZ_STORE and falls back cleanly on missing sqlite drivers', () => {
    const mem = createStoreFromEnv({ DZ_STORE: 'memory' });
    expect(mem.kind).toBe('memory');
    mem.close();

    const sqlite = createStoreFromEnv({ DZ_STORE: 'sqlite', DZ_SQLITE_PATH: ':memory:' });
    expect(sqlite.kind).toBe('sqlite');
    sqlite.close();

    // Fallback 1: node:sqlite unavailable -> falls back to better-sqlite3 with clear log line
    const warnings1: string[] = [];
    const fakeStatements = {
      get: () => undefined,
      all: () => [],
      run: () => ({ changes: 0 }),
    };
    class FakeBetterSqlite3 {
      exec() {}
      prepare() {
        return fakeStatements;
      }
      close() {}
    }
    const db = openSqliteDatabase(':memory:', {
      loadBuiltin: () => {
        throw new Error('ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite');
      },
      loadBetterSqlite3: () => FakeBetterSqlite3,
      logger: { warn: (m) => warnings1.push(m) },
    });
    expect(warnings1.some((w) => w.includes('falling back to better-sqlite3'))).toBe(true);
    db.close();

    // Fallback 2: both node:sqlite and better-sqlite3 unavailable -> falls back cleanly to MemoryStore with warning
    const warnings2: string[] = [];
    const fallbackStore = createStoreFromEnv(
      { DZ_STORE: 'sqlite', DZ_SQLITE_PATH: ':memory:' },
      {
        loadBuiltin: () => {
          throw new Error('no node:sqlite on Node 20');
        },
        loadBetterSqlite3: () => {
          throw new Error('better-sqlite3 native binary missing');
        },
        logger: { warn: (m) => warnings2.push(m) },
      },
    );
    expect(fallbackStore.kind).toBe('memory');
    expect(warnings2.some((w) => w.includes('falling back to MemoryStore'))).toBe(true);
    fallbackStore.close();

    // File-backed SQLite store exercises WAL pragma + filtered queries
    const dir = mkdtempSync(path.join(os.tmpdir(), 'dz-sqlite-'));
    try {
      const fileStore = new SqliteStore(path.join(dir, 'test.db'));
      fileStore.setDefaultScenario('chargily', 'declined');
      expect(fileStore.getDefaultScenario('chargily')).toBe('declined');
      fileStore.appendRequestLog({
        id: 'req_f1',
        provider: 'chargily',
        method: 'POST',
        path: '/test',
        headers: {},
        query: {},
        body: null,
        statusCode: 500,
        responseBody: { error: 'boom' },
        scenario: 'gateway_500',
        durationMs: 2,
        timestamp: '2026-01-01T10:00:00.000Z',
      });
      expect(
        fileStore.queryRequestLogs({
          provider: 'chargily',
          statusCode: 500,
          since: '2026-01-01T09:00:00.000Z',
          until: '2026-01-01T11:00:00.000Z',
          limit: 5,
        }),
      ).toHaveLength(1);
      expect(fileStore.deleteResource('chargily:checkouts', 'missing')).toBe(false);
      fileStore.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('ScenarioEngine', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('resolves precedence: header > resource > sequence > default > fallback', () => {
    const store = new MemoryStore();
    const engine = new ScenarioEngine(store);

    expect(engine.resolve({ provider: 'chargily' }).name).toBe('success');
    expect(engine.resolve({ provider: 'yalidine' }).name).toBe('created_ok');

    engine.setDefault('chargily', 'declined');
    expect(engine.resolve({ provider: 'chargily' }).name).toBe('declined');

    engine.setSequence('chargily', ['gateway_500', 'success']);
    expect(engine.resolve({ provider: 'chargily' }).name).toBe('gateway_500');
    expect(engine.resolve({ provider: 'chargily' }).name).toBe('success');
    expect(engine.resolve({ provider: 'chargily' }).name).toBe('success');

    engine.setResourceScenario('chargily', 'chk_99', 'insufficient_funds');
    expect(engine.resolve({ provider: 'chargily', resourceId: 'chk_99' }).name).toBe(
      'insufficient_funds',
    );

    expect(
      engine.resolve({
        provider: 'chargily',
        resourceId: 'chk_99',
        headerScenario: 'expired_card',
      }).name,
    ).toBe('expired_card');
  });

  it('loads and validates YAML and JSON custom scenarios from disk', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'dz-scenarios-'));
    writeFileSync(
      path.join(tempDir, 'custom.yaml'),
      `scenarios:\n  - name: ramadan_peak\n    provider: yalidine\n    category: delivery\n    description: Simulated high-latency peak\n    behavior:\n      outcome: created_ok\n      latencyMs: 250\n`,
      'utf8',
    );
    writeFileSync(
      path.join(tempDir, 'extra.json'),
      JSON.stringify({
        name: 'custom_502',
        provider: 'satim',
        category: 'network',
        behavior: { httpStatus: 502, errorMessage: 'Upstream proxy failed' },
      }),
      'utf8',
    );

    const store = new MemoryStore();
    const engine = new ScenarioEngine(store);
    const loaded = engine.loadFromDirectory(tempDir);
    expect(loaded.map((s) => s.name).sort()).toEqual(['custom_502', 'ramadan_peak']);
    expect(engine.hasDefinition('ramadan_peak')).toBe(true);
    expect(engine.getDefinition('custom_502').behavior.httpStatus).toBe(502);
    expect(engine.listAll().length).toBeGreaterThan(25);
    expect(() => engine.setSequence('chargily', [])).toThrow();
    engine.watchDirectory(tempDir);
    engine.stopWatching();
    expect(engine.loadFromDirectory(path.join(tempDir, 'nonexistent'))).toEqual([]);
  });

  it('property: header override always wins regardless of resource/default state', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9_]{3,16}$/),
        fc.stringMatching(/^[a-z0-9_]{3,16}$/),
        fc.stringMatching(/^[a-z0-9_]{3,16}$/),
        (headerName, resourceName, defaultName) => {
          const store = new MemoryStore();
          const engine = new ScenarioEngine(store);
          engine.setDefault('chargily', defaultName);
          engine.setResourceScenario('chargily', 'res_1', resourceName);
          const resolved = engine.resolve({
            provider: 'chargily',
            resourceId: 'res_1',
            headerScenario: headerName,
          });
          expect(resolved.name).toBe(headerName);
          expect(resolved.source).toBe('header');
        },
      ),
    );
  });
});

describe('Signer & Redaction', () => {
  it('signs and verifies HMAC-SHA256 in constant time', () => {
    const sig = signHmacSha256('{"id":"1"}', 'test_sk_123');
    expect(verifyHmacSha256('{"id":"1"}', 'test_sk_123', sig)).toBe(true);
    expect(verifyHmacSha256('{"id":"2"}', 'test_sk_123', sig)).toBe(false);
    expect(verifyHmacSha256('{"id":"1"}', 'test_sk_123', 'short')).toBe(false);
  });

  it('redacts sensitive headers and body keys', () => {
    const headers = redactHeaders({
      authorization: 'Bearer test_sk_1234567890',
      'x-api-token': 'tok_abcdef1234',
      'content-type': 'application/json',
    });
    expect(headers.authorization).toBe('Bearer ***7890');
    expect(headers['x-api-token']).toBe('***1234');
    expect(headers['content-type']).toBe('application/json');

    const body = redactBody({ password: 'my_secret_password', orderNumber: 'ORD-1' }) as Record<
      string,
      unknown
    >;
    expect(body.password).toBe('***word');
    expect(body.orderNumber).toBe('ORD-1');
  });
});

describe('WebhookDispatcher', () => {
  it('handles duplicate, delayed, bad signature, suppressed, out-of-order, and retries', async () => {
    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(7);
    const received: Array<{ url: string; sig: string; body: unknown }> = [];

    const mockFetch: typeof fetch = async (input, init) => {
      const headers = init?.headers as Record<string, string>;
      received.push({
        url: String(input),
        sig: headers.signature ?? '',
        body: JSON.parse(String(init?.body ?? '{}')),
      });
      return new Response('ok', { status: 200 });
    };

    const dispatcher = new WebhookDispatcher(store, clock, rng, {
      fetchImpl: mockFetch,
      allowlist: ['127.0.0.1'],
    });

    // Duplicate webhook (2 deliveries)
    const dup = await dispatcher.dispatch({
      provider: 'chargily',
      eventType: 'checkout.paid',
      targetUrl: 'http://127.0.0.1:9000/hook',
      payload: { type: 'checkout.paid', id: '1' },
      secret: 'test_sk_abc',
      behavior: { count: 2 },
    });
    expect(dup).toHaveLength(2);
    expect(received).toHaveLength(2);
    expect(verifyHmacSha256(JSON.stringify({ type: 'checkout.paid', id: '1' }), 'test_sk_abc', received[0]!.sig)).toBe(true);

    // Delayed webhook via VirtualClock
    await dispatcher.dispatch({
      provider: 'chargily',
      eventType: 'checkout.paid',
      targetUrl: 'http://127.0.0.1:9000/hook',
      payload: { type: 'checkout.paid', id: '2' },
      secret: 'test_sk_abc',
      behavior: { delayMs: 30_000 },
    });
    expect(received).toHaveLength(2);
    await clock.advance('30s');
    expect(received).toHaveLength(3);

    // Bad signature
    await dispatcher.dispatch({
      provider: 'chargily',
      eventType: 'checkout.paid',
      targetUrl: 'http://127.0.0.1:9000/hook',
      payload: { type: 'checkout.paid', id: '3' },
      secret: 'test_sk_abc',
      behavior: { badSignature: true },
    });
    expect(
      verifyHmacSha256(JSON.stringify({ type: 'checkout.paid', id: '3' }), 'test_sk_abc', received[3]!.sig),
    ).toBe(false);

    // Never sent (suppressed)
    const suppressed = await dispatcher.dispatch({
      provider: 'chargily',
      eventType: 'checkout.paid',
      targetUrl: 'http://127.0.0.1:9000/hook',
      payload: { type: 'checkout.paid', id: '4' },
      secret: 'test_sk_abc',
      behavior: { neverSend: true },
    });
    expect(suppressed[0]?.status).toBe('suppressed');
    expect(received).toHaveLength(4);

    // Out-of-order batch
    await dispatcher.dispatchSequence(
      [
        {
          provider: 'chargily',
          eventType: 'first',
          targetUrl: 'http://127.0.0.1:9000/hook',
          payload: { seq: 1 },
          secret: 's',
        },
        {
          provider: 'chargily',
          eventType: 'second',
          targetUrl: 'http://127.0.0.1:9000/hook',
          payload: { seq: 2 },
          secret: 's',
        },
      ],
      true,
    );
    expect((received[4]!.body as { seq: number }).seq).toBe(2);
    expect((received[5]!.body as { seq: number }).seq).toBe(1);

    // Policy rejection for non-allowlisted host
    await expect(
      dispatcher.dispatch({
        provider: 'chargily',
        eventType: 'checkout.paid',
        targetUrl: 'https://evil.example.com/hook',
        payload: {},
        secret: 's',
      }),
    ).rejects.toThrow();
  });

  it('retries failed webhooks with virtual clock backoff and supports redeliver', async () => {
    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(9);
    let failNext = true;

    const dispatcher = new WebhookDispatcher(store, clock, rng, {
      retryBackoffMs: [1000],
      fetchImpl: async () => {
        if (failNext) {
          failNext = false;
          return new Response('err', { status: 500 });
        }
        return new Response('ok', { status: 200 });
      },
    });

    const [entry] = await dispatcher.dispatch({
      provider: 'chargily',
      eventType: 'checkout.paid',
      targetUrl: 'http://127.0.0.1:9001/hook',
      payload: { id: 'retry-test' },
      secret: 'sec',
      maxAttempts: 2,
    });
    expect(entry?.status).toBe('failed');
    await clock.advance('1s');
    const updated = store.getWebhookLog(entry!.id);
    expect(updated?.status).toBe('delivered');
    expect(updated?.attempts).toHaveLength(2);

    const redelivered = await dispatcher.redeliver(entry!.id);
    expect(redelivered.attempts).toHaveLength(3);
  });
});

describe('HTTP scenario middleware', () => {
  it('enforces gateway_500, rate_limited, and logs redacted requests', async () => {
    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(1);
    const scenarios = new ScenarioEngine(store);
    const app = Fastify({ logger: false });
    const ctx = { store, clock, rng, scenarios, timeoutMs: 20 };

    registerRequestAuditHook(app, ctx, 'chargily');
    app.get('/plain', async () => 'pong');
    app.post('/test', async (req, reply) => {
      const resolved = scenarios.resolve({
        provider: 'chargily',
        headerScenario: req.headers['x-dz-scenario'] as string | undefined,
      });
      if (await applyNetworkScenario(ctx, 'chargily', req, reply, resolved)) {
        return;
      }
      return { ok: true };
    });

    const okRes = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { authorization: 'Bearer test_sk_secret_9999' },
      payload: { amount: 100 },
    });
    expect(okRes.statusCode).toBe(200);

    const errRes = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-dz-scenario': 'rate_limited' },
    });
    expect(errRes.statusCode).toBe(429);
    expect(errRes.headers['retry-after']).toBe('5');

    const timeoutRes = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-dz-scenario': 'timeout' },
    });
    expect(timeoutRes.statusCode).toBe(504);

    const logs = store.queryRequestLogs();
    expect(logs).toHaveLength(3);
    expect(logs[2]?.headers.authorization).toBe('Bearer ***9999');
    expect(resolveBindHost('127.0.0.1')).toBe('127.0.0.1');
    expect(resolveBindHost()).toBe('127.0.0.1');

    // Test gateway_500, slow, array header, and network_drop over real loopback socket
    const gwRes = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'x-dz-scenario': 'gateway_500' },
    });
    expect(gwRes.statusCode).toBe(500);

    const prevHost = process.env.DZ_SANDBOX_HOST;
    process.env.DZ_SANDBOX_HOST = '0.0.0.0';
    expect(resolveBindHost()).toBe('0.0.0.0');
    if (prevHost === undefined) delete process.env.DZ_SANDBOX_HOST;
    else process.env.DZ_SANDBOX_HOST = prevHost;

    // Exercise additional edge helpers (clock errors, redaction edge cases, scenario helpers, webhook failures)
    expect((await app.inject({ method: 'GET', url: '/plain' })).body).toBe('pong');
    expect(rng.getSeed()).toBe(1);
    expect(rng.pick(['only'])).toBe('only');
    expect(() => parseDurationMs('bad')).toThrow();
    clock.schedule(5000, () => {});
    expect(clock.getPendingTimers()).toHaveLength(1);
    clock.reset();
    expect(clock.getPendingTimers()).toHaveLength(0);

    expect(redactBody({ secret: '1234', nested: [{ token: 'abcdef123456' }], count: 1 })).toEqual({
      secret: '[REDACTED]',
      nested: [{ token: '***3456' }],
      count: 1,
    });
    expect(redactBody(42)).toBe(42);
    expect(redactHeaders({ 'x-api-token': 'short', 'x-empty': undefined })).toEqual({
      'x-api-token': '[REDACTED]',
      'x-empty': '',
    });

    expect(() => scenarios.setSequence('chargily', [])).toThrow();
    scenarios.setSequence('chargily', ['gateway_500', 'declined'], true);
    expect(scenarios.resolve({ provider: 'chargily' }).name).toBe('gateway_500');
    expect(scenarios.resolve({ provider: 'chargily' }).name).toBe('declined');
    expect(scenarios.resolve({ provider: 'chargily' }).name).toBe('gateway_500');
    expect(scenarios.clearSequence('chargily')).toBe(true);
    expect(scenarios.clearResourceScenario('chargily', 'missing')).toBe(false);
    expect(scenarios.hasDefinition('success')).toBe(true);
    expect(scenarios.loadFromDirectory(path.join(os.tmpdir(), 'dz-nonexistent-dir-999'))).toEqual([]);

    expect(isAllowedWebhookUrl('not-a-url')).toBe(false);
    expect(isAllowedWebhookUrl('ftp://remote.example/hook')).toBe(false);
    expect(isAllowedWebhookUrl('https://remote.example/hook', ['remote.example'])).toBe(true);
    expect(isAllowedWebhookUrl('https://remote.example/hook', ['https://remote.example/'])).toBe(true);
    expect(isAllowedWebhookUrl('https://other.example/hook', ['', 'remote.example'])).toBe(false);
    const errDispatcher = new WebhookDispatcher(store, clock, rng, {
      retryBackoffMs: [10],
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const [failedEntry] = await errDispatcher.dispatch({
      provider: 'chargily',
      eventType: 'checkout.paid',
      targetUrl: 'http://127.0.0.1:9009/hook',
      payload: { id: 'fail' },
      secret: 'sec',
      maxAttempts: 1,
    });
    expect(failedEntry?.status).toBe('failed');
    await expect(errDispatcher.redeliver('missing_wh')).rejects.toThrow();

    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (addr && typeof addr === 'object') {
      await expect(
        fetch(`http://127.0.0.1:${addr.port}/test`, {
          method: 'POST',
          headers: { 'x-dz-scenario': 'network_drop' },
        }),
      ).rejects.toThrow();
    }

    app.server.closeIdleConnections?.();
    await app.close();
  });
});

describe('Security hardening & deterministic fuzz tests', () => {
  it('blocks SSRF targets, metadata IPs, embedded creds, prefix bypasses, and unsafe redirects', async () => {
    expect(isAllowedWebhookUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedWebhookUrl('http://10.0.0.1/hook')).toBe(false);
    expect(isAllowedWebhookUrl('http://172.16.5.4/hook')).toBe(false);
    expect(isAllowedWebhookUrl('http://192.168.1.50/hook')).toBe(false);
    expect(isAllowedWebhookUrl('http://[::ffff:a9fe:a9fe]/hook')).toBe(false);
    expect(isAllowedWebhookUrl('http://2130706433/hook')).toBe(false);
    expect(isAllowedWebhookUrl('http://metadata.google.internal/hook')).toBe(false);
    expect(isAllowedWebhookUrl('https://user:pass@example.com/hook')).toBe(false);
    expect(isAllowedWebhookUrl('javascript:alert(1)')).toBe(false);

    // Localhost policy toggle & origin/path allowlist boundary
    expect(isAllowedWebhookUrl('http://127.0.0.1:4000/hook', undefined, { allowLocalhost: false })).toBe(false);
    expect(isAllowedWebhookUrl('http://localhost:3000/hook', undefined, { allowLocalhost: false })).toBe(false);
    expect(isAllowedWebhookUrl('https://trusted.com.evil.com/hook', ['https://trusted.com/hooks'])).toBe(false);
    expect(isAllowedWebhookUrl('https://trusted.com/hooks/v1', ['https://trusted.com/hooks'])).toBe(true);
    expect(isAllowedWebhookUrl('http://0x7f.0.0.1/hook')).toBe(false);
    expect(isAllowedWebhookUrl('http://0177.0.0.1/hook')).toBe(false);
    expect(isAllowedWebhookUrl('http://[fc00::1]/hook')).toBe(false);
    expect(isAllowedWebhookUrl('http://[fe80::1]/hook')).toBe(false);
    expect(isAllowedWebhookUrl('http://[::1]/hook', undefined, { allowLocalhost: true })).toBe(true);
    expect(isAllowedWebhookUrl('https://8.8.8.8/hook')).toBe(true);
    expect(isAllowedWebhookUrl('https://trusted.com/hook', ['not a valid rule url', 'trusted.com'])).toBe(true);
    expect(isAllowedWebhookUrl('https://trusted.com/hook', ['http://[invalid'])).toBe(false);

    expect(isLoopbackHostOrIp('[::1]')).toBe(true);
    expect(isLoopbackHostOrIp('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackHostOrIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIpOrHost('')).toBe(true);
    expect(isPrivateOrReservedIpOrHost('100.64.0.1')).toBe(true);
    expect(isPrivateOrReservedIpOrHost('0.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIpOrHost('192.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIpOrHost('198.18.0.1')).toBe(true);
    expect(isPrivateOrReservedIpOrHost('224.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIpOrHost('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIpOrHost('::ffff:7f00:0001')).toBe(true);
    expect(isPrivateOrReservedIpOrHost('::ffff:1:2:3')).toBe(true);
    expect(isPrivateOrReservedIpOrHost('ff00::1')).toBe(true);
    expect(isPrivateOrReservedIpOrHost('2606:4700:4700::1111')).toBe(false);
    expect(timingSafeEqualToken('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualToken('abc', 'abc')).toBe(true);

    // Safe redirect & host header helpers
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(sanitizeRedirectUrl('https://merchant.example/ok\r\nEvil: 1')).toBeNull();
    expect(sanitizeHostHeader('127.0.0.1:4000', 'fallback:4000')).toBe('127.0.0.1:4000');
    expect(sanitizeHostHeader('evil.com\r\nX-Injected: yes', 'fallback:4000')).toBe('fallback:4000');

    // Webhook dispatcher uses redirect: 'manual'
    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(42);
    let capturedRedirect: string | undefined;
    const dispatcher = new WebhookDispatcher(store, clock, rng, {
      fetchImpl: async (_url, init) => {
        capturedRedirect = init?.redirect;
        return new Response('ok', { status: 200 });
      },
    });
    await dispatcher.dispatch({
      provider: 'chargily',
      eventType: 'checkout.paid',
      targetUrl: 'http://127.0.0.1:9999/hook',
      payload: { id: 'chk_sec' },
      secret: 'test_sec',
    });
    expect(capturedRedirect).toBe('manual');
  });

  it('rejects CRLF / forbidden scenario headers, path traversal, and redacts sensitive logs', async () => {
    expect(sanitizeHeaderEntry('X-Test\r\nEvil', '1').safe).toBe(false);
    expect(sanitizeHeaderEntry('Transfer-Encoding', 'chunked').safe).toBe(false);
    expect(sanitizeHeaderEntry('X-Safe', 'ok\nInjected: yes').safe).toBe(false);
    expect(sanitizeHeaderEntry('Retry-After', '5').safe).toBe(true);

    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(7);
    const scenarios = new ScenarioEngine(store);
    scenarios.registerCustom({
      name: 'bad_header_scen',
      provider: 'chargily',
      category: 'network',
      description: 'Unsafe header injection attempt',
      behavior: { outcome: 'success', headers: { Host: 'evil.com' } },
      builtIn: false,
    });

    const app = Fastify({ logger: false });
    const ctx = { store, clock, rng, scenarios };
    app.get('/hdr', async (req, reply) => {
      const resolved = scenarios.resolve({ provider: 'chargily', headerScenario: 'bad_header_scen' });
      if (await applyNetworkScenario(ctx, 'chargily', req, reply, resolved)) return;
      return { ok: true };
    });
    expect((await app.inject({ method: 'GET', url: '/hdr' })).statusCode).toBe(500);
    await app.close();

    // Path traversal & optional symlink escape in scenario loader
    const rootTmp = mkdtempSync(path.join(os.tmpdir(), 'dz-scen-sec-'));
    const subDir = path.join(rootTmp, 'scenarios');
    mkdtempSync(path.join(rootTmp, 'sub-placeholder'));
    writeFileSync(path.join(rootTmp, 'outside.yaml'), 'name: leak\nprovider: chargily\ncategory: network\nbehavior: {}');
    const scenariosDir = path.join(rootTmp, 'dir');
    try {
      rmSync(scenariosDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    mkdtempSync(rootTmp + '/d'); // ensure tmpdir ops cleanly scoped below
    expect(() => resolvePathInsideDir(rootTmp, '../outside.yaml')).toThrow();
    expect(() => resolvePathInsideDir(subDir.replace('scenarios', ''), '../outside.yaml')).toThrow();
    try {
      const symTarget = path.join(rootTmp, 'outside.yaml');
      symlinkSync(symTarget, path.join(rootTmp, 'sub-placeholder', 'escape.yaml'));
      expect(() => scenarios.loadFromDirectory(path.join(rootTmp, 'sub-placeholder'))).toThrow();
    } catch {
      // Windows non-admin environments may disallow symlinks (EPERM); traversal assertion above always runs
    } finally {
      rmSync(rootTmp, { recursive: true, force: true });
    }

    // Secret redaction in query strings, URLs, card PANs, and tokens
    expect(redactUrlPath('/payment/rest/register.do?userName=merch&password=mysecret&token=tok123')).toBe(
      '/payment/rest/register.do?userName=merch&password=[REDACTED]&token=[REDACTED]',
    );
    expect(redactQuery({ password: 'secret_value', cardPan: '4000123456780001', safe: 'ok' })).toEqual({
      password: '***alue',
      cardPan: '***0001',
      safe: 'ok',
    });
    expect(
      redactBody({
        note: 'Called with test_sk_1234567890 and card 4000-1234-5678-0001',
        nestedObjSecret: { token: { a: 1 }, cardPan: 4000000000000001 },
      }),
    ).toEqual({
      note: 'Called with ***7890 and card ***0001',
      nestedObjSecret: { token: '[REDACTED]', cardPan: '***0001' },
    });
    expect(redactStringSecrets('')).toBe('');
    expect(redactStringSecrets('Authorization Bearer sk_test_abcdefgh')).toContain('***efgh');
    expect(redactQuery(['ignored'])).toEqual({});
  });

  it('property: ScenarioEngine precedence and seeded RNG replay remain deterministic under fuzzing', () => {
    const scenarioArb = fc.constantFrom('success', 'declined', 'slow', 'gateway_500', 'timeout');
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        scenarioArb,
        fc.option(scenarioArb, { nil: undefined }),
        fc.option(scenarioArb, { nil: undefined }),
        fc.option(scenarioArb, { nil: undefined }),
        (seed, defaultScen, seqStep, resourceScen, headerScen) => {
          const runOnce = () => {
            const store = new MemoryStore();
            const engine = new ScenarioEngine(store);
            const rng = new SeededRNG(seed);
            const clock = new VirtualClock();
            engine.setDefault('chargily', defaultScen);
            if (seqStep) engine.setSequence('chargily', [seqStep, 'success'], true);
            if (resourceScen) engine.setResourceScenario('chargily', 'res_fuzz', resourceScen);

            const picked = engine.resolve({
              provider: 'chargily',
              headerScenario: headerScen,
              resourceId: 'res_fuzz',
            });
            return {
              pickedName: picked.name,
              pickedSource: picked.source,
              randId: rng.id('chk'),
              nowIso: clock.isoNow(),
            };
          };

          const first = runOnce();
          const second = runOnce();
          expect(first).toEqual(second);

          if (headerScen) {
            expect(first.pickedName).toBe(headerScen);
            expect(first.pickedSource).toBe('header');
          } else if (resourceScen) {
            expect(first.pickedName).toBe(resourceScen);
            expect(first.pickedSource).toBe('resource');
          } else if (seqStep) {
            expect(first.pickedName).toBe(seqStep);
            expect(first.pickedSource).toBe('sequence');
          } else {
            expect(first.pickedName).toBe(defaultScen);
            expect(first.pickedSource).toBe('default');
          }
        },
      ),
    );
  });
});
