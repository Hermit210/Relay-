import { describe, it, expect } from "vitest";
import { isFinal, secondsUntilFinal, FINALITY_RULES } from "../safety/finalityChecker";
import { IdempotencyStore } from "../safety/idempotencyStore";

describe("finalityChecker", () => {
  it("does NOT treat a just-settled Solana-family (SVM) payment as final (status != finality)", () => {
    const justNow = new Date().toISOString();
    expect(isFinal("SVM", justNow)).toBe(false);
  });

  it("treats an SVM payment as final after its safe window elapses", () => {
    const past = new Date(Date.now() - (FINALITY_RULES.SVM + 1) * 1000).toISOString();
    expect(isFinal("SVM", past)).toBe(true);
  });

  it("requires much longer for BVM (Bitcoin-family) than SVM — different chain types, different rules", () => {
    const eightMinutesAgo = new Date(Date.now() - 8 * 60 * 1000).toISOString();
    expect(isFinal("SVM", eightMinutesAgo)).toBe(true); // SVM: final in ~13s
    expect(isFinal("BVM", eightMinutesAgo)).toBe(false); // BVM: needs ~60min
  });

  it("fails safe (never final) for an unmodeled chain type", () => {
    expect(isFinal("XVM" as any, new Date(0).toISOString())).toBe(false);
  });

  it("reports remaining seconds correctly", () => {
    const settled = new Date(Date.now() - 5000).toISOString();
    const remaining = secondsUntilFinal("SVM", settled);
    expect(remaining).toBeLessThanOrEqual(FINALITY_RULES.SVM);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
});

describe("IdempotencyStore — the duplicate-payment protection (Flowrge/DecentralWatch-inspired)", () => {
  it("returns undefined for a never-seen key", () => {
    const store = new IdempotencyStore();
    expect(store.check("agent-request-1")).toBeUndefined();
  });

  it("returns the SAME result id for a repeated key — this is what stops double-charging on retry", () => {
    const store = new IdempotencyStore();
    store.remember("agent-request-1", "link-abc");
    expect(store.check("agent-request-1")).toBe("link-abc");
    expect(store.check("agent-request-1")).toBe("link-abc"); // stable across repeated checks
  });

  it("expires old records after the TTL, so keys aren't held forever", () => {
    const store = new IdempotencyStore(10); // 10ms TTL for the test
    store.remember("agent-request-1", "link-abc");
    expect(store.check("agent-request-1")).toBe("link-abc");
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(store.check("agent-request-1")).toBeUndefined();
        resolve(null);
      }, 30);
    });
  });

  it("different keys never collide", () => {
    const store = new IdempotencyStore();
    store.remember("req-1", "link-A");
    store.remember("req-2", "link-B");
    expect(store.check("req-1")).toBe("link-A");
    expect(store.check("req-2")).toBe("link-B");
  });
});
