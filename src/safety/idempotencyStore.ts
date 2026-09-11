/**
 * Idempotency store — inspired by two patterns from Pratik Kale's work:
 *  - Flowrge's Gateway: keeps on-chain/off-chain state in sync with
 *    replay protection built in, not bolted on after.
 *  - DecentralWatch: independent, provable status tracking rather than
 *    a single trust-me source of truth.
 *
 * WHY THIS MATTERS FOR MOOVE SPECIFICALLY: agents retry on timeout. This is
 * a documented, real failure mode in the wider x402/agentic-payments space —
 * independent security research reproduced duplicate settlement in 6 percent
 * of concurrent-retry test rounds against a major facilitator. Moove has no
 * documented idempotency guarantee today (their docs describe polling only).
 * This store is the client-side belt to match the sandbox's server-side
 * suspenders (see sandbox/mockMooveServer.ts).
 *
 * `getOrCreate` exists because a naive check()-then-await-then-remember()
 * sequence has a real race window: N concurrent callers for the same key can
 * all see nothing cached yet (none of them has called `remember()` before
 * the others check), so all N proceed to create a duplicate resource. A
 * stress test in src/__tests__/idempotencyStress.test.ts reproduced 5
 * duplicate payment links out of 50 concurrent retries using that naive
 * sequence. `getOrCreate` closes the window by tracking in-flight creations
 * synchronously, so every concurrent caller for a key — whether it arrives
 * before or after the in-flight create() resolves — gets back the same
 * result instead of triggering its own.
 */

interface IdempotencyRecord<T> {
  key: string;
  result: T;
  createdAt: number;
}

export class IdempotencyStore<T = string> {
  private records = new Map<string, IdempotencyRecord<T>>();
  private inFlight = new Map<string, Promise<T>>();
  private ttlMs: number;

  constructor(ttlMs = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /** Returns the existing result for this key, if one hasn't expired. */
  check(key: string): T | undefined {
    const record = this.records.get(key);
    if (!record) return undefined;
    if (Date.now() - record.createdAt > this.ttlMs) {
      this.records.delete(key);
      return undefined;
    }
    return record.result;
  }

  remember(key: string, result: T): void {
    this.records.set(key, { key, result, createdAt: Date.now() });
  }

  size(): number {
    return this.records.size;
  }

  /**
   * Runs `create()` at most once per key, no matter how many callers race
   * in concurrently for that same key. The check for an in-flight or
   * already-remembered result and the registration of a new in-flight
   * promise happen synchronously (no `await` between them), so there is no
   * window for a second concurrent caller to slip through — see file header.
   */
  async getOrCreate(key: string, create: () => Promise<T>): Promise<T> {
    const cached = this.check(key);
    if (cached !== undefined) return cached;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = create()
      .then((result) => {
        this.remember(key, result);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }
}
