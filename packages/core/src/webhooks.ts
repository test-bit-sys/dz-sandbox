import type { VirtualClock } from './clock.js';
import type { SeededRNG } from './rng.js';
import { signHmacSha256 } from './signer.js';
import type { SandboxStore } from './store.js';
import type {
  WebhookAttempt,
  WebhookBehavior,
  WebhookLogEntry,
} from './types.js';

export interface WebhookDispatchRequest {
  provider: string;
  eventType: string;
  targetUrl: string;
  payload: unknown;
  secret: string;
  signatureHeader?: string;
  extraHeaders?: Record<string, string>;
  behavior?: WebhookBehavior;
  maxAttempts?: number;
}

export interface WebhookDispatcherOptions {
  allowlist?: string[];
  fetchImpl?: typeof fetch;
  defaultSecret?: string;
  retryBackoffMs?: number[];
}

export function isAllowedWebhookUrl(targetUrl: string, allowlist?: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  if (!allowlist || allowlist.length === 0) {
    return true;
  }
  return allowlist.some((rule) => {
    const trimmed = rule.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return targetUrl.startsWith(trimmed);
    }
    return parsed.hostname === trimmed || parsed.host === trimmed;
  });
}

export class WebhookDispatcher {
  private readonly fetchImpl: typeof fetch;
  private readonly retryBackoffMs: number[];
  private readonly allowlist: string[] | undefined;

  constructor(
    private readonly store: SandboxStore,
    private readonly clock: VirtualClock,
    private readonly rng: SeededRNG,
    options: WebhookDispatcherOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retryBackoffMs = options.retryBackoffMs ?? [1000, 5000, 15000];
    this.allowlist =
      options.allowlist ??
      (process.env.DZ_WEBHOOK_ALLOWLIST
        ? process.env.DZ_WEBHOOK_ALLOWLIST.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined);
  }

  /**
   * Dispatches one or more webhook events according to scenario behavior:
   * - neverSend: records a 'suppressed' entry without making HTTP calls
   * - badSignature: flips signature to an invalid hex digest
   * - count > 1 (duplicate_webhook): delivers identical event N times
   * - delayMs (delayed_webhook): schedules delivery on VirtualClock
   */
  async dispatch(req: WebhookDispatchRequest): Promise<WebhookLogEntry[]> {
    if (!isAllowedWebhookUrl(req.targetUrl, this.allowlist)) {
      throw new Error(`Webhook target URL rejected by policy: ${req.targetUrl}`);
    }

    const behavior = req.behavior ?? {};
    const signatureHeader = req.signatureHeader ?? 'signature';
    const rawPayload = JSON.stringify(req.payload);
    const validSignature = signHmacSha256(rawPayload, req.secret);
    const signature = behavior.badSignature
      ? `0000deadbeef${validSignature.slice(12)}`
      : validSignature;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [signatureHeader]: signature,
      'X-DZ-Sandbox': 'true',
      ...(req.extraHeaders ?? {}),
    };

    if (behavior.neverSend) {
      const entry: WebhookLogEntry = {
        id: this.rng.id('wh'),
        provider: req.provider,
        eventType: req.eventType,
        targetUrl: req.targetUrl,
        payload: req.payload,
        signature,
        signatureValid: !behavior.badSignature,
        headers,
        status: 'suppressed',
        scheduledAt: this.clock.isoNow(),
        attempts: [],
        createdAt: this.clock.isoNow(),
      };
      this.store.appendWebhookLog(entry);
      return [entry];
    }

    const deliveryCount = Math.max(1, behavior.count ?? 1);
    const createdEntries: WebhookLogEntry[] = [];

    for (let i = 0; i < deliveryCount; i++) {
      const entry: WebhookLogEntry = {
        id: this.rng.id('wh'),
        provider: req.provider,
        eventType: req.eventType,
        targetUrl: req.targetUrl,
        payload: req.payload,
        signature,
        signatureValid: !behavior.badSignature,
        headers,
        status: 'pending',
        scheduledAt: new Date(this.clock.now() + (behavior.delayMs ?? 0)).toISOString(),
        attempts: [],
        createdAt: this.clock.isoNow(),
      };
      this.store.appendWebhookLog(entry);
      createdEntries.push(entry);

      if (behavior.delayMs && behavior.delayMs > 0) {
        this.clock.schedule(
          behavior.delayMs,
          async () => {
            await this.deliverEntry(entry.id, req.maxAttempts ?? 1);
          },
          `webhook:${req.provider}:${req.eventType}`,
        );
      } else {
        await this.deliverEntry(entry.id, req.maxAttempts ?? 1);
      }
    }

    return createdEntries.map((e) => this.store.getWebhookLog(e.id) ?? e);
  }

  /**
   * Dispatches a batch of events, reversing order when outOfOrder is set.
   */
  async dispatchSequence(
    events: WebhookDispatchRequest[],
    outOfOrder = false,
  ): Promise<WebhookLogEntry[]> {
    const ordered = outOfOrder ? [...events].reverse() : events;
    const entries: WebhookLogEntry[] = [];
    for (const ev of ordered) {
      const res = await this.dispatch(ev);
      entries.push(...res);
    }
    return entries;
  }

  async redeliver(webhookId: string): Promise<WebhookLogEntry> {
    const existing = this.store.getWebhookLog(webhookId);
    if (!existing) {
      throw new Error(`Webhook log not found: ${webhookId}`);
    }
    await this.deliverEntry(webhookId, 1);
    return this.store.getWebhookLog(webhookId) ?? existing;
  }

  private async deliverEntry(webhookId: string, maxAttempts: number): Promise<void> {
    const entry = this.store.getWebhookLog(webhookId);
    if (!entry) return;

    const attemptNumber = entry.attempts.length + 1;
    const started = Date.now();
    let attempt: WebhookAttempt;

    try {
      const response = await this.fetchImpl(entry.targetUrl, {
        method: 'POST',
        headers: entry.headers,
        body: JSON.stringify(entry.payload),
      });
      const responseText = await response.text();
      const durationMs = Math.max(1, Date.now() - started);

      attempt = {
        attemptNumber,
        timestamp: this.clock.isoNow(),
        statusCode: response.status,
        responseBody: responseText.slice(0, 1024),
        durationMs,
      };
      entry.attempts.push(attempt);
      entry.status = response.ok ? 'delivered' : 'failed';
    } catch (error) {
      const durationMs = Math.max(1, Date.now() - started);
      attempt = {
        attemptNumber,
        timestamp: this.clock.isoNow(),
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      };
      entry.attempts.push(attempt);
      entry.status = 'failed';
    }

    this.store.updateWebhookLog(entry);

    if (entry.status === 'failed' && attemptNumber < maxAttempts) {
      const delay = this.retryBackoffMs[Math.min(attemptNumber - 1, this.retryBackoffMs.length - 1)] ?? 5000;
      this.clock.schedule(
        delay,
        async () => {
          await this.deliverEntry(webhookId, maxAttempts);
        },
        `webhook-retry:${webhookId}:${attemptNumber + 1}`,
      );
    }
  }
}
