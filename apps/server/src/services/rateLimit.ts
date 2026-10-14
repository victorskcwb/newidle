/**
 * Fixed-window rate limiter kept in memory. Good for a single server process; moves to Redis
 * when the server scales out (milestone 4).
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts a hit for `key`; false when the key is over its limit for the current window. */
  hit(key: string): boolean {
    const now = this.now();
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      w = { start: now, count: 0 };
      this.windows.set(key, w);
      if (this.windows.size > 50_000) this.sweep(now);
    }
    w.count += 1;
    return w.count <= this.max;
  }

  private sweep(now: number): void {
    for (const [key, w] of this.windows)
      if (now - w.start >= this.windowMs) this.windows.delete(key);
  }
}
