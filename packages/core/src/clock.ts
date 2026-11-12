export interface ScheduledTimer {
  id: string;
  fireAtMs: number;
  label: string;
  callback: () => Promise<void> | void;
}

const DURATION_PATTERN = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i;

const MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parses duration strings like "2h", "30m", "15s", "500ms", "1d" or numeric milliseconds.
 */
export function parseDurationMs(input: number | string): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) {
      throw new Error(`Invalid duration number: ${input}`);
    }
    return Math.round(input);
  }
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  const match = DURATION_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid duration format: "${input}". Expected e.g. "500ms", "10s", "5m", "2h", "1d".`);
  }
  const amount = Number.parseFloat(match[1] ?? '0');
  const unit = (match[2] ?? 'ms').toLowerCase();
  const multiplier = MULTIPLIERS[unit];
  if (multiplier === undefined || !Number.isFinite(amount) || amount < 0) {
    throw new Error(`Unsupported duration: "${input}"`);
  }
  return Math.round(amount * multiplier);
}

export const DEFAULT_INITIAL_CLOCK_MS = Date.UTC(2026, 0, 1, 9, 0, 0, 0);

/**
 * Controllable virtual clock for deterministic time-dependent tests
 * (delayed webhooks, timeouts, delivery lifecycle simulation).
 */
export class VirtualClock {
  private currentMs: number;
  private readonly initialMs: number;
  private timers: ScheduledTimer[] = [];
  private timerSeq = 0;

  constructor(initialMs = DEFAULT_INITIAL_CLOCK_MS) {
    this.initialMs = initialMs;
    this.currentMs = initialMs;
  }

  now(): number {
    return this.currentMs;
  }

  nowDate(): Date {
    return new Date(this.currentMs);
  }

  isoNow(): string {
    return new Date(this.currentMs).toISOString();
  }

  setNow(ms: number): void {
    this.currentMs = ms;
  }

  schedule(delayMs: number, callback: () => Promise<void> | void, label = 'timer'): string {
    const safeDelay = Math.max(0, Math.round(delayMs));
    const id = `vt_${++this.timerSeq}`;
    this.timers.push({
      id,
      fireAtMs: this.currentMs + safeDelay,
      label,
      callback,
    });
    this.timers.sort((a, b) => a.fireAtMs - b.fireAtMs);
    return id;
  }

  cancel(id: string): boolean {
    const idx = this.timers.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.timers.splice(idx, 1);
    return true;
  }

  getPendingTimers(): Array<{ id: string; fireAtMs: number; fireAtIso: string; label: string }> {
    return this.timers.map((t) => ({
      id: t.id,
      fireAtMs: t.fireAtMs,
      fireAtIso: new Date(t.fireAtMs).toISOString(),
      label: t.label,
    }));
  }

  /**
   * Advances the virtual clock and executes every scheduled timer due up to target time
   * in chronological order (including timers newly scheduled by earlier callbacks).
   */
  async advance(duration: number | string): Promise<{ newMs: number; newIso: string; firedCount: number }> {
    const delta = parseDurationMs(duration);
    const targetMs = this.currentMs + delta;
    let firedCount = 0;

    while (true) {
      this.timers.sort((a, b) => a.fireAtMs - b.fireAtMs);
      const next = this.timers[0];
      if (!next || next.fireAtMs > targetMs) {
        break;
      }
      this.timers.shift();
      if (next.fireAtMs > this.currentMs) {
        this.currentMs = next.fireAtMs;
      }
      await next.callback();
      firedCount++;
    }

    this.currentMs = targetMs;
    return {
      newMs: this.currentMs,
      newIso: this.isoNow(),
      firedCount,
    };
  }

  reset(initialMs = this.initialMs): void {
    this.currentMs = initialMs;
    this.timers = [];
  }
}
