import { createRequire } from 'node:module';
import type {
  RequestLogEntry,
  RequestLogFilter,
  ScenarioDefinition,
  SequenceState,
  WebhookLogEntry,
  WebhookLogFilter,
} from './types.js';

export interface SqlStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes?: number | bigint };
}

export interface SqlDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
}

export interface SqliteDriverOptions {
  loadBuiltin?: () => { DatabaseSync: new (path: string) => SqlDatabase };
  loadBetterSqlite3?: () => new (path: string) => SqlDatabase;
  logger?: { warn: (msg: string) => void; info?: (msg: string) => void };
}

const require = createRequire(import.meta.url);

export function openSqliteDatabase(
  dbPath: string,
  options: SqliteDriverOptions = {},
): SqlDatabase {
  const warn = options.logger?.warn ?? ((msg: string) => console.warn(msg));
  const loadBuiltin =
    options.loadBuiltin ??
    (() =>
      require('node:sqlite') as {
        DatabaseSync: new (path: string) => SqlDatabase;
      });
  const loadBetter =
    options.loadBetterSqlite3 ??
    (() => require('better-sqlite3') as new (path: string) => SqlDatabase);

  try {
    const sqlite = loadBuiltin();
    return new sqlite.DatabaseSync(dbPath);
  } catch (builtinErr) {
    warn(
      `[dz-sandbox] node:sqlite unavailable (${(builtinErr as Error).message}); falling back to better-sqlite3.`,
    );
    const BetterSqlite3 = loadBetter();
    return new BetterSqlite3(dbPath);
  }
}

export interface SandboxStore {
  readonly kind: 'memory' | 'sqlite';

  // Resources keyed by namespace (e.g. "chargily:checkouts") -> id -> payload
  getResource<T>(namespace: string, id: string): T | undefined;
  setResource<T>(namespace: string, id: string, value: T): void;
  deleteResource(namespace: string, id: string): boolean;
  listResources<T>(namespace: string): T[];
  exportAllResources(): Record<string, Record<string, unknown>>;
  importAllResources(resources: Record<string, Record<string, unknown>>): void;

  // Scenario bindings
  getDefaultScenario(provider: string): string | undefined;
  setDefaultScenario(provider: string, scenario: string): void;
  listDefaultScenarios(): Record<string, string>;

  getResourceScenario(provider: string, resourceId: string): string | undefined;
  setResourceScenario(provider: string, resourceId: string, scenario: string): void;
  deleteResourceScenario(provider: string, resourceId: string): boolean;
  listResourceScenarios(): Record<string, Record<string, string>>;

  getSequenceScenario(provider: string): SequenceState | undefined;
  setSequenceScenario(provider: string, state: SequenceState): void;
  deleteSequenceScenario(provider: string): boolean;
  listSequenceScenarios(): Record<string, SequenceState>;

  getCustomScenario(name: string): ScenarioDefinition | undefined;
  setCustomScenario(scenario: ScenarioDefinition): void;
  listCustomScenarios(): ScenarioDefinition[];
  clearCustomScenarios(): void;

  // Request logs
  appendRequestLog(entry: RequestLogEntry): void;
  queryRequestLogs(filter?: RequestLogFilter): RequestLogEntry[];
  countRequestLogs(): number;

  // Webhook logs
  appendWebhookLog(entry: WebhookLogEntry): void;
  updateWebhookLog(entry: WebhookLogEntry): void;
  getWebhookLog(id: string): WebhookLogEntry | undefined;
  queryWebhookLogs(filter?: WebhookLogFilter): WebhookLogEntry[];
  countWebhookLogs(): number;

  // Lifecycle
  reset(): void;
  close(): void;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryStore implements SandboxStore {
  readonly kind = 'memory' as const;
  private resources = new Map<string, Map<string, unknown>>();
  private defaults = new Map<string, string>();
  private resourceScenarios = new Map<string, Map<string, string>>();
  private sequenceScenarios = new Map<string, SequenceState>();
  private customScenarios = new Map<string, ScenarioDefinition>();
  private requestLogs: RequestLogEntry[] = [];
  private webhookLogs: WebhookLogEntry[] = [];

  getResource<T>(namespace: string, id: string): T | undefined {
    const val = this.resources.get(namespace)?.get(id);
    return val === undefined ? undefined : clone(val as T);
  }

  setResource<T>(namespace: string, id: string, value: T): void {
    let bucket = this.resources.get(namespace);
    if (!bucket) {
      bucket = new Map<string, unknown>();
      this.resources.set(namespace, bucket);
    }
    bucket.set(id, clone(value));
  }

  deleteResource(namespace: string, id: string): boolean {
    return this.resources.get(namespace)?.delete(id) ?? false;
  }

  listResources<T>(namespace: string): T[] {
    const bucket = this.resources.get(namespace);
    if (!bucket) return [];
    return Array.from(bucket.values()).map((v) => clone(v as T));
  }

  exportAllResources(): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [ns, bucket] of this.resources.entries()) {
      out[ns] = {};
      for (const [id, value] of bucket.entries()) {
        out[ns][id] = clone(value);
      }
    }
    return out;
  }

  importAllResources(resources: Record<string, Record<string, unknown>>): void {
    this.resources.clear();
    for (const [ns, bucket] of Object.entries(resources)) {
      const map = new Map<string, unknown>();
      for (const [id, value] of Object.entries(bucket)) {
        map.set(id, clone(value));
      }
      this.resources.set(ns, map);
    }
  }

  getDefaultScenario(provider: string): string | undefined {
    return this.defaults.get(provider);
  }

  setDefaultScenario(provider: string, scenario: string): void {
    this.defaults.set(provider, scenario);
  }

  listDefaultScenarios(): Record<string, string> {
    return Object.fromEntries(this.defaults.entries());
  }

  getResourceScenario(provider: string, resourceId: string): string | undefined {
    return this.resourceScenarios.get(provider)?.get(resourceId);
  }

  setResourceScenario(provider: string, resourceId: string, scenario: string): void {
    let bucket = this.resourceScenarios.get(provider);
    if (!bucket) {
      bucket = new Map<string, string>();
      this.resourceScenarios.set(provider, bucket);
    }
    bucket.set(resourceId, scenario);
  }

  deleteResourceScenario(provider: string, resourceId: string): boolean {
    return this.resourceScenarios.get(provider)?.delete(resourceId) ?? false;
  }

  listResourceScenarios(): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    for (const [provider, bucket] of this.resourceScenarios.entries()) {
      out[provider] = Object.fromEntries(bucket.entries());
    }
    return out;
  }

  getSequenceScenario(provider: string): SequenceState | undefined {
    const state = this.sequenceScenarios.get(provider);
    return state ? clone(state) : undefined;
  }

  setSequenceScenario(provider: string, state: SequenceState): void {
    this.sequenceScenarios.set(provider, clone(state));
  }

  deleteSequenceScenario(provider: string): boolean {
    return this.sequenceScenarios.delete(provider);
  }

  listSequenceScenarios(): Record<string, SequenceState> {
    const out: Record<string, SequenceState> = {};
    for (const [provider, state] of this.sequenceScenarios.entries()) {
      out[provider] = clone(state);
    }
    return out;
  }

  getCustomScenario(name: string): ScenarioDefinition | undefined {
    const def = this.customScenarios.get(name);
    return def ? clone(def) : undefined;
  }

  setCustomScenario(scenario: ScenarioDefinition): void {
    this.customScenarios.set(scenario.name, clone(scenario));
  }

  listCustomScenarios(): ScenarioDefinition[] {
    return Array.from(this.customScenarios.values()).map((s) => clone(s));
  }

  clearCustomScenarios(): void {
    this.customScenarios.clear();
  }

  appendRequestLog(entry: RequestLogEntry): void {
    this.requestLogs.push(clone(entry));
  }

  queryRequestLogs(filter: RequestLogFilter = {}): RequestLogEntry[] {
    let list = this.requestLogs;
    if (filter.provider) {
      list = list.filter((e) => e.provider === filter.provider);
    }
    if (filter.statusCode !== undefined) {
      list = list.filter((e) => e.statusCode === filter.statusCode);
    }
    if (filter.since) {
      list = list.filter((e) => e.timestamp >= filter.since!);
    }
    if (filter.until) {
      list = list.filter((e) => e.timestamp <= filter.until!);
    }
    const ordered = [...list].reverse();
    if (filter.limit !== undefined && filter.limit >= 0) {
      return ordered.slice(0, filter.limit).map((e) => clone(e));
    }
    return ordered.map((e) => clone(e));
  }

  countRequestLogs(): number {
    return this.requestLogs.length;
  }

  appendWebhookLog(entry: WebhookLogEntry): void {
    this.webhookLogs.push(clone(entry));
  }

  updateWebhookLog(entry: WebhookLogEntry): void {
    const idx = this.webhookLogs.findIndex((w) => w.id === entry.id);
    if (idx === -1) {
      this.webhookLogs.push(clone(entry));
    } else {
      this.webhookLogs[idx] = clone(entry);
    }
  }

  getWebhookLog(id: string): WebhookLogEntry | undefined {
    const found = this.webhookLogs.find((w) => w.id === id);
    return found ? clone(found) : undefined;
  }

  queryWebhookLogs(filter: WebhookLogFilter = {}): WebhookLogEntry[] {
    let list = this.webhookLogs;
    if (filter.provider) {
      list = list.filter((e) => e.provider === filter.provider);
    }
    if (filter.status) {
      list = list.filter((e) => e.status === filter.status);
    }
    const ordered = [...list].reverse();
    if (filter.limit !== undefined && filter.limit >= 0) {
      return ordered.slice(0, filter.limit).map((e) => clone(e));
    }
    return ordered.map((e) => clone(e));
  }

  countWebhookLogs(): number {
    return this.webhookLogs.length;
  }

  reset(): void {
    this.resources.clear();
    this.defaults.clear();
    this.resourceScenarios.clear();
    this.sequenceScenarios.clear();
    this.requestLogs = [];
    this.webhookLogs = [];
  }

  close(): void {
    // No-op for memory store
  }
}

export class SqliteStore implements SandboxStore {
  readonly kind = 'sqlite' as const;
  private db: SqlDatabase;

  constructor(dbPath = ':memory:', driverOptions?: SqliteDriverOptions) {
    this.db = openSqliteDatabase(dbPath, driverOptions);
    if (dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }
    this.migrate();
  }

  private runTransaction(fn: () => void): void {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resources (
        namespace TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (namespace, id)
      );
      CREATE TABLE IF NOT EXISTS default_scenarios (
        provider TEXT PRIMARY KEY,
        scenario TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resource_scenarios (
        provider TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        scenario TEXT NOT NULL,
        PRIMARY KEY (provider, resource_id)
      );
      CREATE TABLE IF NOT EXISTS sequence_scenarios (
        provider TEXT PRIMARY KEY,
        state TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS custom_scenarios (
        name TEXT PRIMARY KEY,
        definition TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS request_logs (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL,
        provider TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        entry TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_req_provider ON request_logs(provider);
      CREATE INDEX IF NOT EXISTS idx_req_status ON request_logs(status_code);
      CREATE TABLE IF NOT EXISTS webhook_logs (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        entry TEXT NOT NULL
      );
    `);
  }

  getResource<T>(namespace: string, id: string): T | undefined {
    const row = this.db
      .prepare('SELECT data FROM resources WHERE namespace = ? AND id = ?')
      .get(namespace, id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }

  setResource<T>(namespace: string, id: string, value: T): void {
    this.db
      .prepare(
        'INSERT INTO resources (namespace, id, data) VALUES (?, ?, ?) ON CONFLICT(namespace, id) DO UPDATE SET data = excluded.data',
      )
      .run(namespace, id, JSON.stringify(value));
  }

  deleteResource(namespace: string, id: string): boolean {
    const info = this.db
      .prepare('DELETE FROM resources WHERE namespace = ? AND id = ?')
      .run(namespace, id);
    return Number(info.changes ?? 0) > 0;
  }

  listResources<T>(namespace: string): T[] {
    const rows = this.db
      .prepare('SELECT data FROM resources WHERE namespace = ? ORDER BY rowid ASC')
      .all(namespace) as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data) as T);
  }

  exportAllResources(): Record<string, Record<string, unknown>> {
    const rows = this.db
      .prepare('SELECT namespace, id, data FROM resources ORDER BY rowid ASC')
      .all() as Array<{ namespace: string; id: string; data: string }>;
    const out: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      if (!out[row.namespace]) {
        out[row.namespace] = {};
      }
      out[row.namespace]![row.id] = JSON.parse(row.data) as unknown;
    }
    return out;
  }

  importAllResources(resources: Record<string, Record<string, unknown>>): void {
    this.runTransaction(() => {
      this.db.prepare('DELETE FROM resources').run();
      const stmt = this.db.prepare('INSERT INTO resources (namespace, id, data) VALUES (?, ?, ?)');
      for (const [ns, bucket] of Object.entries(resources)) {
        for (const [id, value] of Object.entries(bucket)) {
          stmt.run(ns, id, JSON.stringify(value));
        }
      }
    });
  }

  getDefaultScenario(provider: string): string | undefined {
    const row = this.db
      .prepare('SELECT scenario FROM default_scenarios WHERE provider = ?')
      .get(provider) as { scenario: string } | undefined;
    return row?.scenario;
  }

  setDefaultScenario(provider: string, scenario: string): void {
    this.db
      .prepare(
        'INSERT INTO default_scenarios (provider, scenario) VALUES (?, ?) ON CONFLICT(provider) DO UPDATE SET scenario = excluded.scenario',
      )
      .run(provider, scenario);
  }

  listDefaultScenarios(): Record<string, string> {
    const rows = this.db
      .prepare('SELECT provider, scenario FROM default_scenarios')
      .all() as Array<{ provider: string; scenario: string }>;
    const out: Record<string, string> = {};
    for (const row of rows) {
      out[row.provider] = row.scenario;
    }
    return out;
  }

  getResourceScenario(provider: string, resourceId: string): string | undefined {
    const row = this.db
      .prepare('SELECT scenario FROM resource_scenarios WHERE provider = ? AND resource_id = ?')
      .get(provider, resourceId) as { scenario: string } | undefined;
    return row?.scenario;
  }

  setResourceScenario(provider: string, resourceId: string, scenario: string): void {
    this.db
      .prepare(
        'INSERT INTO resource_scenarios (provider, resource_id, scenario) VALUES (?, ?, ?) ON CONFLICT(provider, resource_id) DO UPDATE SET scenario = excluded.scenario',
      )
      .run(provider, resourceId, scenario);
  }

  deleteResourceScenario(provider: string, resourceId: string): boolean {
    const info = this.db
      .prepare('DELETE FROM resource_scenarios WHERE provider = ? AND resource_id = ?')
      .run(provider, resourceId);
    return Number(info.changes ?? 0) > 0;
  }

  listResourceScenarios(): Record<string, Record<string, string>> {
    const rows = this.db
      .prepare('SELECT provider, resource_id, scenario FROM resource_scenarios')
      .all() as Array<{ provider: string; resource_id: string; scenario: string }>;
    const out: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      if (!out[row.provider]) {
        out[row.provider] = {};
      }
      out[row.provider]![row.resource_id] = row.scenario;
    }
    return out;
  }

  getSequenceScenario(provider: string): SequenceState | undefined {
    const row = this.db
      .prepare('SELECT state FROM sequence_scenarios WHERE provider = ?')
      .get(provider) as { state: string } | undefined;
    return row ? (JSON.parse(row.state) as SequenceState) : undefined;
  }

  setSequenceScenario(provider: string, state: SequenceState): void {
    this.db
      .prepare(
        'INSERT INTO sequence_scenarios (provider, state) VALUES (?, ?) ON CONFLICT(provider) DO UPDATE SET state = excluded.state',
      )
      .run(provider, JSON.stringify(state));
  }

  deleteSequenceScenario(provider: string): boolean {
    const info = this.db
      .prepare('DELETE FROM sequence_scenarios WHERE provider = ?')
      .run(provider);
    return Number(info.changes ?? 0) > 0;
  }

  listSequenceScenarios(): Record<string, SequenceState> {
    const rows = this.db
      .prepare('SELECT provider, state FROM sequence_scenarios')
      .all() as Array<{ provider: string; state: string }>;
    const out: Record<string, SequenceState> = {};
    for (const row of rows) {
      out[row.provider] = JSON.parse(row.state) as SequenceState;
    }
    return out;
  }

  getCustomScenario(name: string): ScenarioDefinition | undefined {
    const row = this.db
      .prepare('SELECT definition FROM custom_scenarios WHERE name = ?')
      .get(name) as { definition: string } | undefined;
    return row ? (JSON.parse(row.definition) as ScenarioDefinition) : undefined;
  }

  setCustomScenario(scenario: ScenarioDefinition): void {
    this.db
      .prepare(
        'INSERT INTO custom_scenarios (name, definition) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET definition = excluded.definition',
      )
      .run(scenario.name, JSON.stringify(scenario));
  }

  listCustomScenarios(): ScenarioDefinition[] {
    const rows = this.db
      .prepare('SELECT definition FROM custom_scenarios ORDER BY rowid ASC')
      .all() as Array<{ definition: string }>;
    return rows.map((r) => JSON.parse(r.definition) as ScenarioDefinition);
  }

  clearCustomScenarios(): void {
    this.db.prepare('DELETE FROM custom_scenarios').run();
  }

  appendRequestLog(entry: RequestLogEntry): void {
    this.db
      .prepare(
        'INSERT INTO request_logs (id, provider, status_code, timestamp, entry) VALUES (?, ?, ?, ?, ?)',
      )
      .run(entry.id, entry.provider, entry.statusCode, entry.timestamp, JSON.stringify(entry));
  }

  queryRequestLogs(filter: RequestLogFilter = {}): RequestLogEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.provider) {
      conditions.push('provider = ?');
      params.push(filter.provider);
    }
    if (filter.statusCode !== undefined) {
      conditions.push('status_code = ?');
      params.push(filter.statusCode);
    }
    if (filter.since) {
      conditions.push('timestamp >= ?');
      params.push(filter.since);
    }
    if (filter.until) {
      conditions.push('timestamp <= ?');
      params.push(filter.until);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause =
      filter.limit !== undefined && filter.limit >= 0 ? `LIMIT ${Math.floor(filter.limit)}` : '';
    const rows = this.db
      .prepare(`SELECT entry FROM request_logs ${whereClause} ORDER BY seq DESC ${limitClause}`)
      .all(...params) as Array<{ entry: string }>;
    return rows.map((r) => JSON.parse(r.entry) as RequestLogEntry);
  }

  countRequestLogs(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM request_logs').get() as {
      count: number;
    };
    return row.count;
  }

  appendWebhookLog(entry: WebhookLogEntry): void {
    this.db
      .prepare(
        'INSERT INTO webhook_logs (id, provider, status, entry) VALUES (?, ?, ?, ?)',
      )
      .run(entry.id, entry.provider, entry.status, JSON.stringify(entry));
  }

  updateWebhookLog(entry: WebhookLogEntry): void {
    this.db
      .prepare(
        'INSERT INTO webhook_logs (id, provider, status, entry) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, entry = excluded.entry',
      )
      .run(entry.id, entry.provider, entry.status, JSON.stringify(entry));
  }

  getWebhookLog(id: string): WebhookLogEntry | undefined {
    const row = this.db
      .prepare('SELECT entry FROM webhook_logs WHERE id = ?')
      .get(id) as { entry: string } | undefined;
    return row ? (JSON.parse(row.entry) as WebhookLogEntry) : undefined;
  }

  queryWebhookLogs(filter: WebhookLogFilter = {}): WebhookLogEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.provider) {
      conditions.push('provider = ?');
      params.push(filter.provider);
    }
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause =
      filter.limit !== undefined && filter.limit >= 0 ? `LIMIT ${Math.floor(filter.limit)}` : '';
    const rows = this.db
      .prepare(`SELECT entry FROM webhook_logs ${whereClause} ORDER BY seq DESC ${limitClause}`)
      .all(...params) as Array<{ entry: string }>;
    return rows.map((r) => JSON.parse(r.entry) as WebhookLogEntry);
  }

  countWebhookLogs(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM webhook_logs').get() as {
      count: number;
    };
    return row.count;
  }

  reset(): void {
    this.runTransaction(() => {
      this.db.prepare('DELETE FROM resources').run();
      this.db.prepare('DELETE FROM default_scenarios').run();
      this.db.prepare('DELETE FROM resource_scenarios').run();
      this.db.prepare('DELETE FROM sequence_scenarios').run();
      this.db.prepare('DELETE FROM request_logs').run();
      this.db.prepare('DELETE FROM webhook_logs').run();
    });
  }

  close(): void {
    this.db.close();
  }
}

export function createStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  driverOptions?: SqliteDriverOptions,
): SandboxStore {
  const mode = (env.DZ_STORE ?? 'memory').toLowerCase();
  if (mode === 'sqlite') {
    const dbPath = env.DZ_SQLITE_PATH ?? './dz-sandbox.db';
    const warn = driverOptions?.logger?.warn ?? ((msg: string) => console.warn(msg));
    try {
      return new SqliteStore(dbPath, driverOptions);
    } catch (err) {
      warn(
        `[dz-sandbox] Unable to initialize SQLite store (${(err as Error).message}); falling back to MemoryStore (state will not persist across restarts).`,
      );
      return new MemoryStore();
    }
  }
  return new MemoryStore();
}
