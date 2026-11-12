import { z } from 'zod';

export type ProviderId = 'chargily' | 'satim' | 'yalidine' | (string & {});

export type ScenarioCategory = 'payment' | 'delivery' | 'network';

export const WebhookBehaviorSchema = z.object({
  count: z.number().int().min(0).max(10).optional(),
  delayMs: z.number().int().min(0).optional(),
  outOfOrder: z.boolean().optional(),
  badSignature: z.boolean().optional(),
  neverSend: z.boolean().optional(),
});

export type WebhookBehavior = z.infer<typeof WebhookBehaviorSchema>;

export const ScenarioBehaviorSchema = z.object({
  httpStatus: z.number().int().min(100).max(599).optional(),
  outcome: z.string().min(1).optional(),
  latencyMs: z.number().int().min(0).optional(),
  timeoutMs: z.number().int().min(0).optional(),
  dropSocket: z.boolean().optional(),
  errorCode: z.union([z.string(), z.number()]).optional(),
  errorMessage: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  webhook: WebhookBehaviorSchema.optional(),
  sequence: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ScenarioBehavior = z.infer<typeof ScenarioBehaviorSchema>;

export const ScenarioDefinitionSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_:-]+$/i, 'Scenario name must be alphanumeric with _ : -'),
  provider: z.string().min(1).default('all'),
  category: z.enum(['payment', 'delivery', 'network']).default('payment'),
  description: z.string().default('Custom scenario'),
  behavior: ScenarioBehaviorSchema,
  builtIn: z.boolean().optional().default(false),
});

export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;

export interface RequestLogEntry {
  id: string;
  provider: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
  statusCode: number;
  responseBody: unknown;
  scenario: string;
  durationMs: number;
  timestamp: string;
}

export interface RequestLogFilter {
  provider?: string;
  statusCode?: number;
  since?: string;
  until?: string;
  limit?: number;
}

export interface WebhookAttempt {
  attemptNumber: number;
  timestamp: string;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  durationMs: number;
}

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'suppressed';

export interface WebhookLogEntry {
  id: string;
  provider: string;
  eventType: string;
  targetUrl: string;
  payload: unknown;
  signature: string;
  signatureValid: boolean;
  headers: Record<string, string>;
  status: WebhookDeliveryStatus;
  scheduledAt: string;
  attempts: WebhookAttempt[];
  createdAt: string;
}

export interface WebhookLogFilter {
  provider?: string;
  status?: WebhookDeliveryStatus;
  limit?: number;
}

export interface SequenceState {
  steps: string[];
  index: number;
  loop?: boolean;
}

export interface SandboxBundle {
  version: 1;
  exportedAt: string;
  clockMs: number;
  seed: number;
  defaults: Record<string, string>;
  resourceScenarios: Record<string, Record<string, string>>;
  sequenceScenarios: Record<string, SequenceState>;
  customScenarios: ScenarioDefinition[];
  resources: Record<string, Record<string, unknown>>;
}

export interface SandboxStateSnapshot {
  clockIso: string;
  clockMs: number;
  pendingTimers: number;
  seed: number;
  defaults: Record<string, string>;
  resourceScenarios: Record<string, Record<string, string>>;
  sequenceScenarios: Record<string, SequenceState>;
  requestCount: number;
  webhookCount: number;
  storeType: 'memory' | 'sqlite';
}
