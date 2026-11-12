/**
 * Mulberry32 deterministic pseudo-random number generator.
 * Ensures reproducible IDs, fees, and failure simulations when seeded.
 */
export class SeededRNG {
  private initialSeed: number;
  private state: number;

  constructor(seed = 1337) {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed;
  }

  getSeed(): number {
    return this.initialSeed;
  }

  reseed(seed: number): void {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed;
  }

  reset(): void {
    this.state = this.initialSeed;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) {
      throw new Error(`Invalid int range: [${min}, ${max}]`);
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty array');
    }
    const index = this.int(0, items.length - 1);
    const value = items[index];
    if (value === undefined) {
      throw new Error('Unexpected undefined element');
    }
    return value;
  }

  hex(length = 16): string {
    let out = '';
    for (let i = 0; i < length; i++) {
      out += this.int(0, 15).toString(16);
    }
    return out;
  }

  id(prefix: string, length = 16): string {
    return `${prefix}_${this.hex(length)}`;
  }
}
