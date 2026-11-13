import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CapturedExchangeSchema,
  createRecorderProxy,
  createReplayServer,
  isPathInsideFixtures,
  loadCapturedFixturesForProvider,
  MemoryStore,
  redactCapturedData,
  sanitizeCapturedExchange,
  sanitizeHeaderAllowlist,
  ScenarioEngine,
  SeededRNG,
  validateFixturesDirectory,
  VirtualClock,
} from './index.js';

describe('record and replay engine', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it('redacts secrets, PII, headers, cards, and query tokens deterministically', () => {
    const cleanHeaders = sanitizeHeaderAllowlist({
      'Content-Type': 'application/json',
      Authorization: 'Bearer live_sk_supersecret',
      'X-API-TOKEN': 'tok_123456',
      'Set-Cookie': 'sid=abc',
      'X-Request-Id': ['req-1', 'req-2'],
    });
    expect(cleanHeaders).toEqual({
      'content-type': 'application/json',
      'x-request-id': 'req-1, req-2',
    });

    const redacted = redactCapturedData({
      email: 'buyer@company.dz',
      phone: '+213551234567',
      altPhone: '0661234567',
      firstname: 'Amina',
      address: '12 Rue Didouche Mourad',
      secretKey: 'test_sk_abcdef1234',
      jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3OCJ9.signature_abcdef12',
      cardNumber: '4111 1111 1111 1234',
      note: 'Call +213551234567 or buyer@company.dz Bearer tok_xyz123456 paid with 4111 1111 1111 1234',
      items: ['test_sk_abcdef1234', 'ok-42'],
      shortDigits: '12345',
    }) as Record<string, unknown>;

    expect(redacted.email).toBe('<REDACTED_EMAIL_1>');
    expect(redacted.phone).toBe('<REDACTED_PHONE_1>');
    expect(redacted.altPhone).toBe('<REDACTED_PHONE_2>');
    expect(redacted.firstname).toBe('<REDACTED_NAME_1>');
    expect(redacted.address).toBe('<REDACTED_ADDRESS_1>');
    expect(redacted.secretKey).toBe('<REDACTED_SECRET>');
    expect(redacted.jwt).toBe('<REDACTED_JWT>');
    expect(redacted.cardNumber).toBe('<REDACTED_SECRET>');
    expect(String(redacted.note)).toContain('<REDACTED_PHONE_1>');
    expect(String(redacted.note)).toContain('<REDACTED_EMAIL_1>');
    expect(String(redacted.note)).toContain('Bearer <REDACTED_SECRET>');
    expect(String(redacted.note)).toContain('<REDACTED_CARD_1234>');
    expect(redacted.shortDigits).toBe('12345');

    const exchange = sanitizeCapturedExchange({
      provider: 'satim',
      upstreamHost: 'sandbox.satim.example',
      captureDate: '2026-11-12',
      method: 'post',
      path: '/payment/rest/register.do?userName=merch1&password=pw999&amount=1000',
      query: { userName: 'merch1', password: 'pw999', amount: '1000' },
      reqHeaders: { authorization: 'Bearer test_sk_secret123', 'content-type': 'application/json' },
      reqBody: { name: 'Karim', phone: '0551234567' },
      status: 200,
      resHeaders: { 'content-type': 'application/json', 'set-cookie': 'secret=1; Secure; HttpOnly' },
      resBody: { orderId: 'ord_1', status: 'ok' },
    });

    expect(exchange.verified).toBe(true);
    expect(exchange.source).toBe('captured 2026-11-12');
    expect(exchange.request.path).toContain('password=<REDACTED_SECRET>');
    expect(exchange.request.path).toContain('userName=<REDACTED_SECRET>');
    expect(exchange.request.headers.authorization).toBeUndefined();
    expect(exchange.response.headers['set-cookie']).toBeUndefined();
    expect(CapturedExchangeSchema.parse(exchange).provider).toBe('satim');
  });

  it('validates clean fixtures and rejects leaked secrets, phones, emails, cards, and bad schemas', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dz-fixtures-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));

    expect(validateFixturesDirectory(path.join(dir, 'missing')).valid).toBe(false);

    mkdirSync(path.join(dir, 'nested'), { recursive: true });
    writeFileSync(
      path.join(dir, 'nested', 'good-seed.json'),
      JSON.stringify({ provider: 'chargily', verified: false, source: 'seed', cases: [{ id: 1 }] }),
    );
    const cleanCaptured = sanitizeCapturedExchange({
      provider: 'chargily',
      upstreamHost: 'pay.chargily.net',
      captureDate: '2026-11-12',
      method: 'GET',
      path: '/test/api/v2/balance',
      query: {},
      reqHeaders: {},
      status: 200,
      resHeaders: { 'content-type': 'application/json' },
      resBody: { balance: 1000, contactEmail: 'sandbox@example.com' },
    });
    writeFileSync(path.join(dir, 'good-captured.json'), JSON.stringify(cleanCaptured));

    const okRes = validateFixturesDirectory(dir);
    expect(okRes.valid).toBe(true);
    expect(okRes.capturedCount).toBe(1);
    expect(okRes.seedCount).toBe(1);

    // Bad files trigger clear errors
    writeFileSync(path.join(dir, 'broken.json'), '{not-json');
    writeFileSync(
      path.join(dir, 'bad-seed.json'),
      JSON.stringify({ provider: 'chargily', verified: true, source: '   ', cases: [] }),
    );
    writeFileSync(
      path.join(dir, 'bad-captured.json'),
      JSON.stringify({
        provider: 'chargily',
        verified: true,
        source: '  ',
        captureDate: '2026-11-12',
        upstreamHost: 'pay.chargily.net',
        request: {
          method: 'POST',
          path: '/x',
          headers: { authorization: 'Bearer real_secret_value_here' },
          body: { email: 'realuser@gmail.com', phone: '0551234567', card: '4111111111111234', token: 'plain_tok' },
        },
        response: { status: 200, headers: {}, body: ['4111 1111 1111 1234'] },
      }),
    );

    const badRes = validateFixturesDirectory(dir);
    expect(badRes.valid).toBe(false);
    expect(badRes.errors.some((e) => e.includes('invalid JSON'))).toBe(true);
    expect(badRes.errors.some((e) => e.includes('unredacted Bearer secret'))).toBe(true);
    expect(badRes.errors.some((e) => e.includes('unredacted email'))).toBe(true);
    expect(badRes.errors.some((e) => e.includes('unredacted card-like number'))).toBe(true);
    expect(badRes.errors.some((e) => e.includes('unredacted secret value'))).toBe(true);
  });

  it('records HTTP exchanges against a local fake upstream, enforces SSRF & no-redact guards, and replays deterministically', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'dz-rec-'));
    cleanups.push(() => rmSync(outDir, { recursive: true, force: true }));

    // Guard tests
    expect(() =>
      createRecorderProxy({ provider: 'x', upstreamUrl: 'ftp://example.com', outDir }),
    ).toThrow(/Invalid upstream URL/);
    expect(() =>
      createRecorderProxy({
        provider: 'x',
        upstreamUrl: 'http://127.0.0.1:9999',
        outDir,
        allowLocalhostUpstream: false,
      }),
    ).toThrow(/Loopback upstream disallowed/);
    expect(() =>
      createRecorderProxy({ provider: 'x', upstreamUrl: 'http://169.254.169.254/latest', outDir }),
    ).toThrow(/SSRF policy/);
    expect(() =>
      createRecorderProxy({ provider: 'x', upstreamUrl: 'http://127.0.0.1:9999', outDir, redact: false }),
    ).toThrow(/--confirm-unredacted/);
    expect(isPathInsideFixtures('/tmp/repo/fixtures/chargily/captured')).toBe(true);
    expect(() =>
      createRecorderProxy({
        provider: 'x',
        upstreamUrl: 'http://127.0.0.1:9999',
        outDir: path.join(outDir, 'fixtures', 'chargily', 'captured'),
        redact: false,
        confirmUnredacted: true,
      }),
    ).toThrow(/Refusing to write unredacted captures into fixtures/);

    // Boot fake upstream server
    const upstream = Fastify({ logger: false });
    let hitCount = 0;
    upstream.post('/v2/checkouts', async (req, reply) => {
      hitCount++;
      const body = req.body as Record<string, unknown>;
      return reply
        .header('set-cookie', 'upstream_secret=1; Secure; HttpOnly')
        .header('retry-after', '10')
        .code(201)
        .send({
          id: `chk_live_${hitCount}`,
          amount: body.amount,
          customer_email: body.email,
          customer_phone: '+213551234567',
          api_token: 'test_sk_upstreamsecret123',
        });
    });
    upstream.get('/v2/text', async (_req, reply) => reply.type('text/plain').send('pong-text'));
    const upstreamUrl = await upstream.listen({ host: '127.0.0.1', port: 0 });
    cleanups.push(() => upstream.close());

    const recOut = path.join(outDir, 'captured');
    const recorder = createRecorderProxy({
      provider: 'chargily',
      upstreamUrl: `${upstreamUrl}/v2`,
      outDir: recOut,
    });
    const recUrl = await recorder.app.listen({ host: '127.0.0.1', port: 0 });
    cleanups.push(() => recorder.app.close());

    const health = (await fetch(`${recUrl}/__recorder/health`).then((r) => r.json())) as {
      status: string;
      redact: boolean;
    };
    expect(health.status).toBe('ok');
    expect(health.redact).toBe(true);

    const postRes = await fetch(`${recUrl}/checkouts?token=secret_q`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test_sk_client1234',
      },
      body: JSON.stringify({
        amount: 2500,
        email: 'amina@realmerchant.dz',
        phone: '+213551234567',
      }),
    });
    expect(postRes.status).toBe(201);

    const textRes = await fetch(`${recUrl}/text`);
    expect(textRes.status).toBe(200);
    expect(await textRes.text()).toBe('pong-text');

    const saved = recorder.getCapturedFiles();
    expect(saved).toHaveLength(2);
    expect(existsSync(saved[0]!)).toBe(true);

    const savedContent = readFileSync(saved[0]!, 'utf8');
    expect(savedContent).not.toContain('test_sk_client1234');
    expect(savedContent).not.toContain('test_sk_upstreamsecret123');
    expect(savedContent).not.toContain('amina@realmerchant.dz');
    expect(savedContent).not.toContain('551234567');
    expect(savedContent).not.toContain('upstream_secret=1');

    expect(validateFixturesDirectory(recOut).valid).toBe(true);
    expect(loadCapturedFixturesForProvider('chargily', recOut)).toHaveLength(2);

    // Replay offline with scenario middleware active
    const store = new MemoryStore();
    const clock = new VirtualClock();
    const rng = new SeededRNG(42);
    const scenarios = new ScenarioEngine(store);
    const ctx = { store, clock, rng, scenarios };
    cleanups.push(() => store.close());

    const replay = createReplayServer({
      provider: 'chargily',
      fixturesDir: recOut,
      ctx,
    });
    const replayUrl = await replay.app.listen({ host: '127.0.0.1', port: 0 });
    cleanups.push(() => replay.app.close());

    const replayHealth = (await fetch(`${replayUrl}/health`).then((r) => r.json())) as {
      fixtureCount: number;
    };
    expect(replayHealth.fixtureCount).toBe(2);

    const replayed = await fetch(`${replayUrl}/checkouts?token=other`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 2500 }),
    });
    expect(replayed.status).toBe(201);
    const replayedBody = (await replayed.json()) as { id: string; api_token: string };
    expect(replayedBody.id).toBe('chk_live_1');
    expect(replayedBody.api_token).toBe('<REDACTED_SECRET>');

    const miss = await fetch(`${replayUrl}/does-not-exist`);
    expect(miss.status).toBe(404);

    // Scenario engine can override replay responses deterministically
    ctx.scenarios.setDefault('chargily', 'gateway_500');
    const err500 = await fetch(`${replayUrl}/checkouts`, { method: 'POST', body: '{}' });
    expect(err500.status).toBe(500);

    // Explicit unredacted opt-in outside fixtures/ works with warning & plain replay without ctx
    const unredactedDir = path.join(outDir, 'unredacted-tmp');
    const unredactedProxy = createRecorderProxy({
      provider: 'chargily',
      upstreamUrl,
      outDir: unredactedDir,
      redact: false,
      confirmUnredacted: true,
    });
    const unredactedUrl = await unredactedProxy.app.listen({ host: '127.0.0.1', port: 0 });
    cleanups.push(() => unredactedProxy.app.close());
    await fetch(`${unredactedUrl}/v2/text`);
    expect(unredactedProxy.getCapturedFiles()).toHaveLength(1);

    expect(() => loadCapturedFixturesForProvider('chargily', path.join(outDir, 'nope'))).toThrow(
      /not found/,
    );
    const replayPlain = createReplayServer({ provider: 'chargily', fixturesDir: recOut });
    const replayPlainUrl = await replayPlain.app.listen({ host: '127.0.0.1', port: 0 });
    cleanups.push(() => replayPlain.app.close());
    const plainRes = await fetch(`${replayPlainUrl}/text`);
    expect(plainRes.status).toBe(200);
  });
});
