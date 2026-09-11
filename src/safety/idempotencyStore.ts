/**
 * Idempotency store — inspired by two patterns from Pratik Kale's work:
 *  - Flowrge's Gateway: keeps on-chain/off-chain state in sync with
 *    replay protection built in, not bolted on after.
 *  - DecentralWatch: independent, provable status tracking rather than
 *    a single trust-me source of truth.
 *
 * WHY THIS MATTERS FOR MOOVE SPECIFICALLY: agents retry on timeout. This is
 * a documented, real failure mode in the wider x402/agentic-payments space —
 * independent security research reproduced duplicate settlement in 6% of
 * concurrent-retry test rounds against a major facilitator. Moove has no
 * documented idempotency guarantee today (their docs describe polling only).
 * This store is the client-side belt to match the sandbox's server-side
 * suspenders (see sandbox/mockMooveServer.ts).
 */

interface IdempotencyRecord {
  key: string;
  resultId: string; // the Moove payment-link id this key resolved to
  createdAt: number;
}

export class IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();
  private ttlMs: number;

  constructor(ttlMs = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /** Returns the existing result id for this key, if one hasn't expired. */
  check(key: string): string | undefined {
    const record = this.records.get(key);
    if (!record) return undefined;
    if (Date.now() - record.createdAt > this.ttlMs) {
      this.records.delete(key);
      return undefined;
    }
    return record.resultId;
  }

  remember(key: string, resultId: string): void {
    this.records.set(key, { key, resultId, createdAt: Date.now() });
  }

  size(): number {
    return this.records.size;
  }
}
