import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  applyNetworkScenario,
  getScenarioHeader,
  registerRequestAuditHook,
  type SandboxContext,
} from './http.js';
import { isLoopbackHostOrIp, isPrivateOrReservedIpOrHost, isSafeHttpUrl } from './security.js';

export const ALLOWED_CAPTURED_HEADERS = new Set([
  'content-type',
  'accept',
  'content-length',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-request-id',
  'x-correlation-id',
  'cache-control',
  'signature',
]);

export const CapturedExchangeSchema = z.object({
  provider: z.string().min(1),
  verified: z.boolean(),
  source: z.string().min(1),
  captureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  upstreamHost: z.string().min(1),
  request: z.object({
    method: z.string().min(1),
    path: z.string().min(1),
    query: z.record(z.unknown()).default({}),
    headers: z.record(z.string()).default({}),
    body: z.unknown().optional(),
  }),
  response: z.object({
    status: z.number().int().min(100).max(599),
    headers: z.record(z.string()).default({}),
    body: z.unknown().optional(),
  }),
});

export type CapturedExchange = z.infer<typeof CapturedExchangeSchema>;

const SeedFixtureSchema = z.object({
  provider: z.string().min(1),
  verified: z.boolean(),
  source: z.string(),
  cases: z.array(z.record(z.unknown())),
});

const SECRET_KEY_RE =
  /^(?:password|pass|pwd|secret|secret_?key|api_?key|api_?token|access_?token|refresh_?token|client_?secret|token|authorization|card_?number|cardpan|pan|cvv2?|cvc|otp|pin|rib|rip|ccp|username)$/i;
const EMAIL_KEY_RE = /^(?:e?mail|customer_?email|recipient_?email)$/i;
const PHONE_KEY_RE = /^(?:phone|contact_?phone|tel|telephone|mobile)$/i;
const NAME_KEY_RE = /^(?:firstname|familyname|first_?name|last_?name|full_?name|customer_?name|holder_?name)$/i;
const ADDRESS_KEY_RE = /^(?:address|street|adresse|street_address|shipping_address)$/i;

const EMAIL_VALUE_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const DZ_PHONE_VALUE_RE = /(?<!\d)(?:\+?213|00213|0)[567]\d{8}(?!\d)/g;
const SECRET_VALUE_RE =
  /\b(?:test_sk_|live_sk_|sk_live_|sk_test_|pk_live_|pk_test_|whsec_|xox[baprs]-|gh[pousr]_)[A-Za-z0-9._-]{4,}\b/g;
const JWT_VALUE_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const CARD_VALUE_RE = /\b(?:\d[ -]?){13,19}\b/g;

class PlaceholderTracker {
  private readonly maps = new Map<string, Map<string, string>>();

  get(kind: string, raw: string): string {
    let bucket = this.maps.get(kind);
    if (!bucket) {
      bucket = new Map();
      this.maps.set(kind, bucket);
    }
    const existing = bucket.get(raw);
    if (existing) return existing;
    const label = `<REDACTED_${kind}_${bucket.size + 1}>`;
    bucket.set(raw, label);
    return label;
  }
}

function scrubString(raw: string, tracker: PlaceholderTracker): string {
  let out = raw;
  out = out.replace(/([?&](?:password|pass|pwd|token|api_?key|api_?token|secret|secret_?key|username|userName)=)([^&#\s]+)/gi, '$1<REDACTED_SECRET>');
  out = out.replace(JWT_VALUE_RE, '<REDACTED_JWT>');
  out = out.replace(/\b(Bearer\s+)([A-Za-z0-9._~+/-]{4,}=*)/gi, '$1<REDACTED_SECRET>');
  out = out.replace(SECRET_VALUE_RE, '<REDACTED_SECRET>');
  out = out.replace(EMAIL_VALUE_RE, (m) => tracker.get('EMAIL', m));
  out = out.replace(DZ_PHONE_VALUE_RE, (m) => tracker.get('PHONE', m));
  out = out.replace(CARD_VALUE_RE, (m) => {
    const digits = m.replace(/[^0-9]/g, '');
    return digits.length >= 13 && digits.length <= 19 ? `<REDACTED_CARD_${digits.slice(-4)}>` : m;
  });
  return out;
}

export function sanitizeHeaderAllowlist(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (!ALLOWED_CAPTURED_HEADERS.has(lower)) continue;
    const raw = Array.isArray(v) ? v.join(', ') : String(v ?? '');
    if (raw) out[lower] = raw;
  }
  return out;
}

export function redactCapturedData(
  value: unknown,
  tracker = new PlaceholderTracker(),
  depth = 0,
): unknown {
  if (depth > 10 || value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return scrubString(value, tracker);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactCapturedData(item, tracker, depth + 1));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const hasPersonHints = Object.keys(obj).some(
      (k) => EMAIL_KEY_RE.test(k) || PHONE_KEY_RE.test(k) || NAME_KEY_RE.test(k),
    );
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (SECRET_KEY_RE.test(key)) {
        out[key] = typeof val === 'number' || typeof val === 'string' ? '<REDACTED_SECRET>' : '<REDACTED_SECRET>';
      } else if (EMAIL_KEY_RE.test(key) && typeof val === 'string') {
        out[key] = tracker.get('EMAIL', val);
      } else if (PHONE_KEY_RE.test(key) && typeof val === 'string') {
        out[key] = tracker.get('PHONE', val);
      } else if ((NAME_KEY_RE.test(key) || (key.toLowerCase() === 'name' && hasPersonHints)) && typeof val === 'string') {
        out[key] = tracker.get('NAME', val);
      } else if (ADDRESS_KEY_RE.test(key) && typeof val === 'string') {
        out[key] = tracker.get('ADDRESS', val);
      } else {
        out[key] = redactCapturedData(val, tracker, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function sanitizeCapturedExchange(params: {
  provider: string;
  upstreamHost: string;
  captureDate: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  reqHeaders: Record<string, unknown>;
  reqBody?: unknown;
  status: number;
  resHeaders: Record<string, unknown>;
  resBody?: unknown;
  redact?: boolean;
}): CapturedExchange {
  const shouldRedact = params.redact !== false;
  const tracker = new PlaceholderTracker();

  const cleanPath = shouldRedact ? scrubString(params.path, tracker) : params.path;
  const cleanQuery = shouldRedact
    ? (redactCapturedData(params.query, tracker) as Record<string, unknown>)
    : params.query;
  const cleanReqHeaders = shouldRedact
    ? sanitizeHeaderAllowlist(params.reqHeaders)
    : Object.fromEntries(Object.entries(params.reqHeaders).map(([k, v]) => [k, String(v ?? '')]));
  const cleanResHeaders = shouldRedact
    ? sanitizeHeaderAllowlist(params.resHeaders)
    : Object.fromEntries(Object.entries(params.resHeaders).map(([k, v]) => [k, String(v ?? '')]));
  const cleanReqBody = shouldRedact ? redactCapturedData(params.reqBody, tracker) : params.reqBody;
  const cleanResBody = shouldRedact ? redactCapturedData(params.resBody, tracker) : params.resBody;

  return {
    provider: params.provider,
    verified: true,
    source: `captured ${params.captureDate}`,
    captureDate: params.captureDate,
    upstreamHost: params.upstreamHost,
    request: {
      method: params.method.toUpperCase(),
      path: cleanPath,
      query: cleanQuery,
      headers: cleanReqHeaders,
      ...(cleanReqBody !== undefined ? { body: cleanReqBody } : {}),
    },
    response: {
      status: params.status,
      headers: cleanResHeaders,
      ...(cleanResBody !== undefined ? { body: cleanResBody } : {}),
    },
  };
}

export function isPathInsideFixtures(targetDir: string): boolean {
  const normalized = path.resolve(targetDir).replace(/\\/g, '/').toLowerCase();
  return /(?:^|\/)fixtures(?:\/|$)/.test(normalized);
}

const DISALLOWED_LEAK_RE = [
  { label: 'live API secret prefix', re: /\b(?:sk_live_|live_sk_|pk_live_|whsec_live)[A-Za-z0-9._-]{4,}\b/ },
  { label: 'JWT token', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { label: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const CAPTURED_LEAK_RE = [
  { label: 'unredacted Bearer secret', re: /\bBearer\s+(?!<REDACTED_SECRET>)[A-Za-z0-9._~+/-]{8,}/i },
  { label: 'unredacted secret prefix', re: /\b(?:test_sk_|sk_test_|pk_test_|sk_live_|live_sk_|whsec_)[A-Za-z0-9._-]{4,}\b/ },
  { label: 'unredacted phone number', re: /(?<!\d)(?:\+?213|00213|0)[567]\d{8}(?!\d)/ },
];

function findCapturedObjectLeaks(val: unknown, prefix: string, errs: string[]): void {
  if (typeof val === 'string') {
    const emails = val.match(EMAIL_VALUE_RE) ?? [];
    for (const email of emails) {
      if (!/@(?:example\.(?:com|dz|org)|redacted\.invalid)$/i.test(email)) {
        errs.push(`${prefix}: unredacted email detected (${email})`);
      }
    }
    const cards = val.match(CARD_VALUE_RE) ?? [];
    for (const card of cards) {
      const digits = card.replace(/[^0-9]/g, '');
      if (digits.length >= 13 && digits.length <= 19) {
        errs.push(`${prefix}: unredacted card-like number detected`);
      }
    }
    return;
  }
  if (Array.isArray(val)) {
    val.forEach((item, idx) => findCapturedObjectLeaks(item, `${prefix}[${idx}]`, errs));
    return;
  }
  if (val && typeof val === 'object') {
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(k) && typeof v === 'string' && !v.startsWith('<REDACTED')) {
        errs.push(`${prefix}.${k}: unredacted secret value`);
      }
      if ((k === 'authorization' || k === 'cookie' || k === 'set-cookie' || k === 'x-api-token' || k === 'x-api-key') && typeof v === 'string' && !v.startsWith('<REDACTED')) {
        errs.push(`${prefix}.${k}: sensitive header retained in captured fixture`);
      }
      findCapturedObjectLeaks(v, `${prefix}.${k}`, errs);
    }
  }
}

export interface FixtureValidationResult {
  valid: boolean;
  filesChecked: number;
  capturedCount: number;
  seedCount: number;
  errors: string[];
}

export function validateFixturesDirectory(rootDir: string): FixtureValidationResult {
  const resolvedRoot = path.resolve(rootDir);
  if (!existsSync(resolvedRoot)) {
    return {
      valid: false,
      filesChecked: 0,
      capturedCount: 0,
      seedCount: 0,
      errors: [`Directory does not exist: ${resolvedRoot}`],
    };
  }

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) files.push(full);
    }
  };
  walk(resolvedRoot);

  const errors: string[] = [];
  let capturedCount = 0;
  let seedCount = 0;

  for (const file of files) {
    const rel = path.relative(resolvedRoot, file) || path.basename(file);
    let raw: string;
    let parsedJson: unknown;
    try {
      raw = readFileSync(file, 'utf8');
      parsedJson = JSON.parse(raw) as unknown;
    } catch (err) {
      errors.push(`${rel}: invalid JSON (${(err as Error).message})`);
      continue;
    }

    for (const rule of DISALLOWED_LEAK_RE) {
      if (rule.re.test(raw)) {
        errors.push(`${rel}: contains ${rule.label}`);
      }
    }

    if (parsedJson && typeof parsedJson === 'object' && 'request' in parsedJson && 'response' in parsedJson) {
      const chk = CapturedExchangeSchema.safeParse(parsedJson);
      if (!chk.success) {
        errors.push(`${rel}: invalid captured fixture schema (${chk.error.issues[0]?.message ?? 'unknown'})`);
        continue;
      }
      if (chk.data.verified && !chk.data.source.trim()) {
        errors.push(`${rel}: verified=true requires non-empty source`);
      }
      for (const rule of CAPTURED_LEAK_RE) {
        if (rule.re.test(raw)) {
          errors.push(`${rel}: captured fixture contains ${rule.label}`);
        }
      }
      findCapturedObjectLeaks(chk.data.request, `${rel}.request`, errors);
      findCapturedObjectLeaks(chk.data.response, `${rel}.response`, errors);
      capturedCount++;
    } else {
      const chk = SeedFixtureSchema.safeParse(parsedJson);
      if (!chk.success) {
        errors.push(`${rel}: invalid seed fixture schema (${chk.error.issues[0]?.message ?? 'unknown'})`);
        continue;
      }
      if (chk.data.verified && !chk.data.source.trim()) {
        errors.push(`${rel}: verified=true requires non-empty source`);
      }
      seedCount++;
    }
  }

  return {
    valid: errors.length === 0,
    filesChecked: files.length,
    capturedCount,
    seedCount,
    errors,
  };
}

export interface RecorderProxyOptions {
  provider: string;
  upstreamUrl: string;
  outDir: string;
  redact?: boolean;
  confirmUnredacted?: boolean;
  allowLocalhostUpstream?: boolean;
  fetchImpl?: typeof fetch;
}

export function createRecorderProxy(opts: RecorderProxyOptions): {
  app: FastifyInstance;
  getCapturedFiles: () => string[];
} {
  if (!isSafeHttpUrl(opts.upstreamUrl)) {
    throw new Error(`Invalid upstream URL for recorder: ${opts.upstreamUrl}`);
  }
  const parsedUpstream = new URL(opts.upstreamUrl);
  const allowLocalhost = opts.allowLocalhostUpstream ?? true;
  if (isLoopbackHostOrIp(parsedUpstream.hostname)) {
    if (!allowLocalhost) {
      throw new Error(`Loopback upstream disallowed by recorder policy: ${opts.upstreamUrl}`);
    }
  } else if (isPrivateOrReservedIpOrHost(parsedUpstream.hostname)) {
    throw new Error(`Private/reserved upstream IP blocked by SSRF policy: ${opts.upstreamUrl}`);
  }

  const shouldRedact = opts.redact !== false;
  if (!shouldRedact) {
    if (!opts.confirmUnredacted) {
      throw new Error(
        'Refusing --no-redact without explicit confirmation flag (--confirm-unredacted).',
      );
    }
    if (isPathInsideFixtures(opts.outDir)) {
      throw new Error(
        `Refusing to write unredacted captures into fixtures directory: ${opts.outDir}`,
      );
    }
    console.warn(
      '[dz-sandbox] WARNING: --no-redact active! Sensitive API keys and PII will be saved UNREDACTED. NEVER commit these files or place them under fixtures/.',
    );
  }

  mkdirSync(path.resolve(opts.outDir), { recursive: true });

  const fetchFn = opts.fetchImpl ?? fetch;
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  const capturedFiles: string[] = [];
  let seq = 0;

  app.get('/__recorder/health', async () => ({
    status: 'ok',
    service: 'recorder',
    provider: opts.provider,
    upstream: parsedUpstream.origin,
    redact: shouldRedact,
    capturedCount: capturedFiles.length,
  }));

  app.all('/*', async (request, reply) => {
    const upstreamTarget = new URL(request.url, parsedUpstream.origin);
    const basePath = parsedUpstream.pathname.replace(/\/+$/, '');
    if (basePath && !upstreamTarget.pathname.startsWith(basePath)) {
      upstreamTarget.pathname = `${basePath}${upstreamTarget.pathname}`;
    }

    const forwardHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(request.headers)) {
      const lower = k.toLowerCase();
      if (lower === 'host' || lower === 'content-length' || lower === 'connection') continue;
      if (v !== undefined) {
        forwardHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
      }
    }

    let reqBodyText: string | undefined;
    if (!['GET', 'HEAD'].includes(request.method.toUpperCase()) && request.body !== undefined) {
      reqBodyText = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    }

    const upstreamRes = await fetchFn(upstreamTarget.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body: reqBodyText,
      redirect: 'manual',
    });

    const rawResText = await upstreamRes.text();
    let parsedResBody: unknown = rawResText;
    try {
      parsedResBody = rawResText ? (JSON.parse(rawResText) as unknown) : undefined;
    } catch {
      parsedResBody = rawResText;
    }

    const resHeadersObj: Record<string, string> = {};
    upstreamRes.headers.forEach((val, key) => {
      resHeadersObj[key] = val;
    });

    const captureDate = new Date().toISOString().slice(0, 10);
    const exchange = sanitizeCapturedExchange({
      provider: opts.provider,
      upstreamHost: parsedUpstream.host,
      captureDate,
      method: request.method,
      path: request.url,
      query: (request.query as Record<string, unknown>) ?? {},
      reqHeaders: forwardHeaders,
      reqBody: request.body,
      status: upstreamRes.status,
      resHeaders: resHeadersObj,
      resBody: parsedResBody,
      redact: shouldRedact,
    });

    seq++;
    const slug = (request.url.split('?')[0] ?? '/')
      .replace(/^\/+/, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .slice(0, 40) || 'root';
    const fileName = `${captureDate}-${String(seq).padStart(4, '0')}-${request.method.toLowerCase()}-${slug}.json`;
    const fullOut = path.resolve(opts.outDir, fileName);
    writeFileSync(fullOut, `${JSON.stringify(exchange, null, 2)}\n`, 'utf8');
    capturedFiles.push(fullOut);

    const outType = resHeadersObj['content-type'] ?? 'application/json; charset=utf-8';
    reply.code(upstreamRes.status).type(outType);
    if (resHeadersObj['retry-after']) {
      reply.header('retry-after', resHeadersObj['retry-after']);
    }
    return parsedResBody ?? '';
  });

  return {
    app,
    getCapturedFiles: () => [...capturedFiles],
  };
}

export interface ReplayServerOptions {
  provider: string;
  fixturesDir: string;
  ctx?: SandboxContext;
}

export function loadCapturedFixturesForProvider(
  provider: string,
  fixturesDir: string,
): CapturedExchange[] {
  const dir = path.resolve(fixturesDir);
  if (!existsSync(dir)) {
    throw new Error(`Replay fixtures directory not found: ${dir}`);
  }
  const validation = validateFixturesDirectory(dir);
  if (!validation.valid) {
    throw new Error(`Invalid captured fixtures:\n${validation.errors.join('\n')}`);
  }

  const out: CapturedExchange[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) {
        const parsed = JSON.parse(readFileSync(full, 'utf8')) as unknown;
        const chk = CapturedExchangeSchema.safeParse(parsed);
        if (chk.success && chk.data.provider === provider) {
          out.push(chk.data);
        }
      }
    }
  };
  walk(dir);
  return out;
}

export function createReplayServer(opts: ReplayServerOptions): {
  app: FastifyInstance;
  exchanges: CapturedExchange[];
} {
  const exchanges = loadCapturedFixturesForProvider(opts.provider, opts.fixturesDir);
  const app = Fastify({ logger: false, bodyLimit: 512 * 1024 });
  if (opts.ctx) {
    registerRequestAuditHook(app, opts.ctx, opts.provider);
  }

  const cursors = new Map<string, number>();

  app.get('/health', async () => ({
    status: 'ok',
    service: `replay-${opts.provider}`,
    fixtureCount: exchanges.length,
  }));

  app.all('/*', async (request, reply) => {
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

    const reqMethod = request.method.toUpperCase();
    const reqFull = request.url;
    const reqPathname = reqFull.split('?')[0] ?? reqFull;

    let matches = exchanges.filter(
      (ex) => ex.request.method === reqMethod && ex.request.path === reqFull,
    );
    if (matches.length === 0) {
      matches = exchanges.filter(
        (ex) =>
          ex.request.method === reqMethod &&
          (ex.request.path.split('?')[0] ?? ex.request.path) === reqPathname,
      );
    }

    if (matches.length === 0) {
      return reply.code(404).send({
        error: 'NO_MATCHING_FIXTURE',
        provider: opts.provider,
        method: reqMethod,
        path: reqFull,
      });
    }

    const key = `${reqMethod}:${reqPathname}`;
    const idx = cursors.get(key) ?? 0;
    const picked = matches[idx % matches.length]!;
    cursors.set(key, idx + 1);

    for (const [hk, hv] of Object.entries(picked.response.headers)) {
      if (hk !== 'content-length') {
        reply.header(hk, hv);
      }
    }
    return reply.code(picked.response.status).send(picked.response.body ?? '');
  });

  return { app, exchanges };
}
