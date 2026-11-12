import { existsSync, readdirSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import type { SandboxStore } from './store.js';
import {
  ScenarioDefinitionSchema,
  type ScenarioDefinition,
  type SequenceState,
} from './types.js';

export const BUILT_IN_SCENARIOS: ScenarioDefinition[] = [
  // Payment scenarios
  {
    name: 'success',
    provider: 'all',
    category: 'payment',
    description: 'Happy path: payment succeeds and signed webhook is delivered once.',
    behavior: { outcome: 'success' },
    builtIn: true,
  },
  {
    name: 'declined',
    provider: 'all',
    category: 'payment',
    description: 'Card/issuer declines the transaction.',
    behavior: { outcome: 'declined', errorCode: 'CARD_DECLINED', errorMessage: 'Transaction declined by issuer' },
    builtIn: true,
  },
  {
    name: 'insufficient_funds',
    provider: 'all',
    category: 'payment',
    description: 'Account or card has insufficient balance.',
    behavior: { outcome: 'insufficient_funds', errorCode: 'INSUFFICIENT_FUNDS', errorMessage: 'Insufficient funds' },
    builtIn: true,
  },
  {
    name: 'expired_card',
    provider: 'all',
    category: 'payment',
    description: 'Submitted card is expired.',
    behavior: { outcome: 'expired_card', errorCode: 'EXPIRED_CARD', errorMessage: 'Card has expired' },
    builtIn: true,
  },
  {
    name: 'user_cancelled',
    provider: 'all',
    category: 'payment',
    description: 'Customer cancels payment on the hosted checkout page.',
    behavior: { outcome: 'user_cancelled', errorCode: 'USER_CANCELLED', errorMessage: 'Cancelled by user' },
    builtIn: true,
  },
  {
    name: 'timeout',
    provider: 'all',
    category: 'network',
    description: 'Hangs request for N ms (default 30000ms, configurable via DZ_TIMEOUT_MS).',
    behavior: { outcome: 'timeout', timeoutMs: 30_000 },
    builtIn: true,
  },
  {
    name: 'slow',
    provider: 'all',
    category: 'network',
    description: 'Adds artificial latency before responding (default 1500ms).',
    behavior: { outcome: 'success', latencyMs: 1500 },
    builtIn: true,
  },
  {
    name: 'gateway_500',
    provider: 'all',
    category: 'network',
    description: 'Gateway returns HTTP 500 internal error.',
    behavior: {
      httpStatus: 500,
      outcome: 'gateway_500',
      errorCode: 'GATEWAY_ERROR',
      errorMessage: 'Simulated upstream 500 Internal Server Error',
    },
    builtIn: true,
  },
  {
    name: 'network_drop',
    provider: 'all',
    category: 'network',
    description: 'Abruptly closes TCP socket before sending HTTP response.',
    behavior: { outcome: 'network_drop', dropSocket: true },
    builtIn: true,
  },
  {
    name: 'duplicate_webhook',
    provider: 'all',
    category: 'payment',
    description: 'Payment succeeds and sends the identical webhook event 2 times.',
    behavior: { outcome: 'success', webhook: { count: 2 } },
    builtIn: true,
  },
  {
    name: 'delayed_webhook',
    provider: 'all',
    category: 'payment',
    description: 'Delivers webhook after 30s on the virtual clock.',
    behavior: { outcome: 'success', webhook: { delayMs: 30_000 } },
    builtIn: true,
  },
  {
    name: 'out_of_order_webhooks',
    provider: 'all',
    category: 'payment',
    description: 'Sends multiple lifecycle webhooks in reverse chronological order.',
    behavior: { outcome: 'success', webhook: { outOfOrder: true } },
    builtIn: true,
  },
  {
    name: 'webhook_bad_signature',
    provider: 'all',
    category: 'payment',
    description: 'Delivers webhook with an invalid HMAC signature.',
    behavior: { outcome: 'success', webhook: { badSignature: true } },
    builtIn: true,
  },
  {
    name: 'webhook_never_sent',
    provider: 'all',
    category: 'payment',
    description: 'Payment completes on gateway, but webhook is suppressed (tests polling fallback).',
    behavior: { outcome: 'success', webhook: { neverSend: true } },
    builtIn: true,
  },
  {
    name: 'double_charge_attempt',
    provider: 'all',
    category: 'payment',
    description: 'Simulates duplicate charge / already-paid conflict on repeat confirmation.',
    behavior: {
      httpStatus: 409,
      outcome: 'double_charge_attempt',
      errorCode: 'ALREADY_PAID',
      errorMessage: 'Order has already been paid',
    },
    builtIn: true,
  },
  {
    name: 'partial_refund',
    provider: 'all',
    category: 'payment',
    description: 'Processes a partial refund instead of full refund.',
    behavior: { outcome: 'partial_refund' },
    builtIn: true,
  },
  {
    name: 'refund_failure',
    provider: 'all',
    category: 'payment',
    description: 'Refund request fails at acquiring bank.',
    behavior: {
      httpStatus: 422,
      outcome: 'refund_failure',
      errorCode: 'REFUND_REJECTED',
      errorMessage: 'Refund rejected by acquiring bank',
    },
    builtIn: true,
  },
  // Delivery scenarios
  {
    name: 'created_ok',
    provider: 'yalidine',
    category: 'delivery',
    description: 'Parcel created cleanly in Yalidine simulation.',
    behavior: { outcome: 'created_ok' },
    builtIn: true,
  },
  {
    name: 'invalid_wilaya',
    provider: 'yalidine',
    category: 'delivery',
    description: 'Rejects parcel because wilaya ID or name is invalid.',
    behavior: {
      httpStatus: 422,
      outcome: 'invalid_wilaya',
      errorCode: 'INVALID_WILAYA',
      errorMessage: 'Unknown or unsupported wilaya',
    },
    builtIn: true,
  },
  {
    name: 'invalid_commune',
    provider: 'yalidine',
    category: 'delivery',
    description: 'Rejects parcel because commune does not belong to destination wilaya.',
    behavior: {
      httpStatus: 422,
      outcome: 'invalid_commune',
      errorCode: 'INVALID_COMMUNE',
      errorMessage: 'Commune does not match destination wilaya',
    },
    builtIn: true,
  },
  {
    name: 'phone_rejected',
    provider: 'yalidine',
    category: 'delivery',
    description: 'Rejects recipient phone number format.',
    behavior: {
      httpStatus: 422,
      outcome: 'phone_rejected',
      errorCode: 'INVALID_PHONE',
      errorMessage: 'Invalid Algerian phone number (expected 05/06/07xxxxxxxx)',
    },
    builtIn: true,
  },
  {
    name: 'rate_limited',
    provider: 'all',
    category: 'network',
    description: 'Returns HTTP 429 Too Many Requests with Retry-After header.',
    behavior: {
      httpStatus: 429,
      outcome: 'rate_limited',
      errorCode: 'RATE_LIMITED',
      errorMessage: 'API rate limit exceeded',
      headers: { 'Retry-After': '5', 'X-RateLimit-Remaining': '0' },
    },
    builtIn: true,
  },
  {
    name: 'auth_failed',
    provider: 'all',
    category: 'network',
    description: 'Forces HTTP 401 unauthorized regardless of credentials.',
    behavior: {
      httpStatus: 401,
      outcome: 'auth_failed',
      errorCode: 'UNAUTHORIZED',
      errorMessage: 'Invalid API credentials',
    },
    builtIn: true,
  },
  {
    name: 'lifecycle_fast',
    provider: 'yalidine',
    category: 'delivery',
    description: 'Schedules parcel progression pending -> in_transit -> delivered on compressed virtual clock timers.',
    behavior: { outcome: 'lifecycle_fast' },
    builtIn: true,
  },
  {
    name: 'returned_to_sender',
    provider: 'yalidine',
    category: 'delivery',
    description: 'Parcel transitions through failed delivery and returns to sender.',
    behavior: { outcome: 'returned_to_sender' },
    builtIn: true,
  },
  {
    name: 'delivery_failed_retry',
    provider: 'yalidine',
    category: 'delivery',
    description: 'First delivery attempt fails, second attempt succeeds.',
    behavior: { outcome: 'delivery_failed_retry' },
    builtIn: true,
  },
  {
    name: 'status_stuck',
    provider: 'yalidine',
    category: 'delivery',
    description: 'Parcel stays stuck in preparation/in-transit without advancing.',
    behavior: { outcome: 'status_stuck' },
    builtIn: true,
  },
];

const ScenarioFileSchema = z.union([
  ScenarioDefinitionSchema,
  z.object({ scenarios: z.array(ScenarioDefinitionSchema) }),
  z.array(ScenarioDefinitionSchema),
]);

export interface ResolvedScenario {
  name: string;
  source: 'header' | 'resource' | 'sequence' | 'default' | 'fallback';
  definition: ScenarioDefinition;
}

export class ScenarioEngine {
  private readonly builtIns = new Map<string, ScenarioDefinition>();
  private watcher: FSWatcher | undefined;

  constructor(private readonly store: SandboxStore) {
    for (const def of BUILT_IN_SCENARIOS) {
      this.builtIns.set(def.name, def);
    }
  }

  listAll(): ScenarioDefinition[] {
    const merged = new Map<string, ScenarioDefinition>();
    for (const def of this.builtIns.values()) {
      merged.set(def.name, def);
    }
    for (const custom of this.store.listCustomScenarios()) {
      merged.set(custom.name, custom);
    }
    return Array.from(merged.values());
  }

  getDefinition(name: string): ScenarioDefinition {
    const custom = this.store.getCustomScenario(name);
    if (custom) return custom;
    const builtIn = this.builtIns.get(name);
    if (builtIn) return builtIn;
    // Unknown scenario names fall back cleanly to a generic outcome with that name
    return {
      name,
      provider: 'all',
      category: 'payment',
      description: `Dynamic scenario "${name}"`,
      behavior: { outcome: name },
      builtIn: false,
    };
  }

  hasDefinition(name: string): boolean {
    return this.store.getCustomScenario(name) !== undefined || this.builtIns.has(name);
  }

  registerCustom(input: unknown): ScenarioDefinition {
    const parsed = ScenarioDefinitionSchema.parse(input);
    const def: ScenarioDefinition = { ...parsed, builtIn: false };
    this.store.setCustomScenario(def);
    return def;
  }

  setDefault(provider: string, scenarioName: string): void {
    this.store.setDefaultScenario(provider, scenarioName);
  }

  setResourceScenario(provider: string, resourceId: string, scenarioName: string): void {
    this.store.setResourceScenario(provider, resourceId, scenarioName);
  }

  clearResourceScenario(provider: string, resourceId: string): boolean {
    return this.store.deleteResourceScenario(provider, resourceId);
  }

  setSequence(provider: string, steps: string[], loop = false): SequenceState {
    if (steps.length === 0) {
      throw new Error('Sequence must have at least one scenario step');
    }
    const state: SequenceState = { steps, index: 0, loop };
    this.store.setSequenceScenario(provider, state);
    return state;
  }

  clearSequence(provider: string): boolean {
    return this.store.deleteSequenceScenario(provider);
  }

  /**
   * Resolves active scenario in strict precedence:
   * 1) X-DZ-Scenario header
   * 2) Per-resource scenario
   * 3) Sequence scenario (advances step index)
   * 4) Provider default
   * 5) Fallback ("created_ok" for yalidine, "success" otherwise)
   */
  resolve(opts: {
    provider: string;
    headerScenario?: string;
    resourceId?: string;
    advanceSequence?: boolean;
  }): ResolvedScenario {
    const header = opts.headerScenario?.trim();
    if (header) {
      return {
        name: header,
        source: 'header',
        definition: this.getDefinition(header),
      };
    }

    if (opts.resourceId) {
      const resourceScenario = this.store.getResourceScenario(opts.provider, opts.resourceId);
      if (resourceScenario) {
        return {
          name: resourceScenario,
          source: 'resource',
          definition: this.getDefinition(resourceScenario),
        };
      }
    }

    const seq = this.store.getSequenceScenario(opts.provider);
    if (seq && seq.steps.length > 0) {
      const clampedIdx = Math.min(seq.index, seq.steps.length - 1);
      const stepName = seq.steps[clampedIdx] ?? 'success';
      if (opts.advanceSequence !== false) {
        const nextIndex = seq.loop
          ? (seq.index + 1) % seq.steps.length
          : Math.min(seq.index + 1, seq.steps.length - 1);
        this.store.setSequenceScenario(opts.provider, {
          ...seq,
          index: nextIndex,
        });
      }
      return {
        name: stepName,
        source: 'sequence',
        definition: this.getDefinition(stepName),
      };
    }

    const providerDefault = this.store.getDefaultScenario(opts.provider);
    if (providerDefault) {
      const def = this.getDefinition(providerDefault);
      if (def.behavior.sequence && def.behavior.sequence.length > 0) {
        this.setSequence(opts.provider, def.behavior.sequence, false);
        return this.resolve(opts);
      }
      return {
        name: providerDefault,
        source: 'default',
        definition: def,
      };
    }

    const fallback = opts.provider === 'yalidine' ? 'created_ok' : 'success';
    return {
      name: fallback,
      source: 'fallback',
      definition: this.getDefinition(fallback),
    };
  }

  loadFromDirectory(dirPath: string): ScenarioDefinition[] {
    if (!existsSync(dirPath)) {
      return [];
    }
    const loaded: ScenarioDefinition[] = [];
    const files = readdirSync(dirPath).filter((f) => /\.(ya?ml|json)$/i.test(f));

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const raw = readFileSync(fullPath, 'utf8');
      const parsedRaw = file.endsWith('.json') ? (JSON.parse(raw) as unknown) : (YAML.parse(raw) as unknown);
      const validated = ScenarioFileSchema.parse(parsedRaw);
      const list = Array.isArray(validated)
        ? validated
        : 'scenarios' in validated
          ? validated.scenarios
          : [validated];
      for (const item of list) {
        loaded.push(this.registerCustom(item));
      }
    }
    return loaded;
  }

  watchDirectory(dirPath: string, onReload?: (loaded: ScenarioDefinition[]) => void): void {
    this.stopWatching();
    if (!existsSync(dirPath)) {
      return;
    }
    this.watcher = watch(dirPath, () => {
      try {
        this.store.clearCustomScenarios();
        const loaded = this.loadFromDirectory(dirPath);
        onReload?.(loaded);
      } catch {
        // Keep last valid custom scenarios if user saves mid-edit
      }
    });
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }
}
