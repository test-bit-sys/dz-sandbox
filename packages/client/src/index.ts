export interface WaitForWebhookOptions {
  provider?: string;
  eventType?: string;
  count?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface WebhookLogRecord {
  id: string;
  provider: string;
  eventType: string;
  targetUrl: string;
  payload: unknown;
  signature: string;
  signatureValid: boolean;
  status: 'pending' | 'delivered' | 'failed' | 'suppressed';
  attempts: Array<{
    attemptNumber: number;
    timestamp: string;
    statusCode?: number;
    error?: string;
  }>;
  createdAt: string;
}

export interface SandboxClientOptions {
  controlUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface SandboxClient {
  readonly controlUrl: string;
  reset(): Promise<{ ok: boolean; clockIso: string; seed: number }>;
  state(): Promise<Record<string, unknown>>;
  scenario(provider: string, name: string): Promise<{ ok: boolean }>;
  resourceScenario(provider: string, resourceId: string, name: string): Promise<{ ok: boolean }>;
  sequence(provider: string, steps: string[], loop?: boolean): Promise<{ ok: boolean }>;
  waitForWebhook(options?: WaitForWebhookOptions): Promise<WebhookLogRecord[]>;
  webhooks(filter?: { provider?: string; status?: string }): Promise<WebhookLogRecord[]>;
  requests(filter?: { provider?: string; statusCode?: number; limit?: number }): Promise<unknown[]>;
  redeliverWebhook(id: string): Promise<WebhookLogRecord>;
  trigger(
    provider: string,
    eventType: string,
    opts?: { targetUrl?: string; payload?: unknown; secret?: string; resourceId?: string },
  ): Promise<unknown>;
  exportBundle(): Promise<unknown>;
  importBundle(bundle: unknown): Promise<{ ok: boolean }>;
  clock: {
    advance(duration: number | string): Promise<{ ok: boolean; newMs: number; newIso: string; firedCount: number }>;
    reset(): Promise<{ ok: boolean; clockMs: number; clockIso: string }>;
  };
}

export function createSandboxClient(options: SandboxClientOptions = {}): SandboxClient {
  const controlUrl = (
    options.controlUrl ??
    process.env.DZ_CONTROL_URL ??
    `http://127.0.0.1:${process.env.DZ_CONTROL_PORT ?? '4000'}`
  ).replace(/\/$/, '');
  const fetchFn = options.fetchImpl ?? fetch;

  async function req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchFn(`${controlUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`dz-sandbox control request ${path} failed (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  }

  return {
    controlUrl,
    reset: () => req('/__control/reset', { method: 'POST' }),
    state: () => req('/__control/state'),
    scenario: (provider, name) =>
      req(`/__control/scenario/${encodeURIComponent(provider)}`, {
        method: 'PUT',
        body: JSON.stringify({ scenario: name }),
      }),
    resourceScenario: (provider, resourceId, name) =>
      req(
        `/__control/scenario/${encodeURIComponent(provider)}/${encodeURIComponent(resourceId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ scenario: name }),
        },
      ),
    sequence: (provider, steps, loop = false) =>
      req(`/__control/scenario/${encodeURIComponent(provider)}`, {
        method: 'PUT',
        body: JSON.stringify({ sequence: steps, loop }),
      }),
    async webhooks(filter = {}) {
      const qs = new URLSearchParams();
      if (filter.provider) qs.set('provider', filter.provider);
      if (filter.status) qs.set('status', filter.status);
      const q = qs.toString();
      const data = await req<{ webhooks: WebhookLogRecord[] }>(
        `/__control/webhooks${q ? `?${q}` : ''}`,
      );
      return data.webhooks;
    },
    async waitForWebhook(opts = {}) {
      const count = opts.count ?? 1;
      const timeoutMs = opts.timeoutMs ?? 5000;
      const pollIntervalMs = opts.pollIntervalMs ?? 50;
      const deadline = Date.now() + timeoutMs;

      while (true) {
        const list = await this.webhooks({ provider: opts.provider });
        const matched = opts.eventType
          ? list.filter((w) => w.eventType === opts.eventType)
          : list;
        if (matched.length >= count) {
          return matched;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `Timed out waiting for ${count} webhook(s) after ${timeoutMs}ms (found ${matched.length})`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    },
    async requests(filter = {}) {
      const qs = new URLSearchParams();
      if (filter.provider) qs.set('provider', filter.provider);
      if (filter.statusCode !== undefined) qs.set('statusCode', String(filter.statusCode));
      if (filter.limit !== undefined) qs.set('limit', String(filter.limit));
      const q = qs.toString();
      const data = await req<{ requests: unknown[] }>(`/__control/requests${q ? `?${q}` : ''}`);
      return data.requests;
    },
    async redeliverWebhook(id) {
      const data = await req<{ webhook: WebhookLogRecord }>(
        `/__control/webhooks/${encodeURIComponent(id)}/redeliver`,
        { method: 'POST' },
      );
      return data.webhook;
    },
    trigger: (provider, eventType, opts = {}) =>
      req(
        `/__control/trigger/${encodeURIComponent(provider)}/${encodeURIComponent(eventType)}`,
        {
          method: 'POST',
          body: JSON.stringify(opts),
        },
      ),
    exportBundle: () => req('/__control/export'),
    importBundle: (bundle) =>
      req('/__control/import', {
        method: 'POST',
        body: JSON.stringify(bundle),
      }),
    clock: {
      advance: (duration) =>
        req('/__control/clock/advance', {
          method: 'POST',
          body: JSON.stringify({ duration }),
        }),
      reset: () => req('/__control/clock/reset', { method: 'POST' }),
    },
  };
}

/**
 * Helper for official @chargily/chargily-pay `ChargilyClient` instances whose constructor
 * hardcodes https://pay.chargily.net/test/api/v2.
 */
export function pointChargilyClientToSandbox<T extends object>(
  client: T,
  baseUrl = `http://127.0.0.1:${process.env.DZ_CHARGILY_PORT ?? '4001'}/api/v2`,
): T {
  (client as { base_url?: string }).base_url = baseUrl.replace(/\/$/, '');
  return client;
}

export const sandbox: SandboxClient = createSandboxClient();
