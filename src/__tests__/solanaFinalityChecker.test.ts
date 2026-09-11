import { describe, it, expect } from "vitest";
import { checkSolanaFinality } from "../safety/solanaFinalityChecker";

function mockFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;
}

describe("checkSolanaFinality", () => {
  it("reports confirmed=true when Solana reports the signature as finalized", async () => {
    const fetchImpl = mockFetch({ result: { value: [{ confirmationStatus: "finalized", err: null }] } });
    const result = await checkSolanaFinality("sig-final", { fetchImpl });
    expect(result.confirmed).toBe(true);
    expect(result.status).toBe("finalized");
  });

  it("reports confirmed=false when only 'confirmed', not yet 'finalized'", async () => {
    const fetchImpl = mockFetch({ result: { value: [{ confirmationStatus: "confirmed", err: null }] } });
    const result = await checkSolanaFinality("sig-confirmed", { fetchImpl });
    expect(result.confirmed).toBe(false);
    expect(result.status).toBe("confirmed");
  });

  it("reports confirmed=false when only 'processed'", async () => {
    const fetchImpl = mockFetch({ result: { value: [{ confirmationStatus: "processed", err: null }] } });
    const result = await checkSolanaFinality("sig-processed", { fetchImpl });
    expect(result.confirmed).toBe(false);
    expect(result.status).toBe("processed");
  });

  it("reports confirmed=false and status null for a signature unknown to the network", async () => {
    const fetchImpl = mockFetch({ result: { value: [null] } });
    const result = await checkSolanaFinality("unknown-sig", { fetchImpl });
    expect(result.confirmed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("throws on an RPC-level error response", async () => {
    const fetchImpl = mockFetch({ error: { code: -32602, message: "invalid params" } });
    await expect(checkSolanaFinality("bad-sig", { fetchImpl })).rejects.toThrow(/Solana RPC error/);
  });

  it("throws on an HTTP-level failure", async () => {
    const fetchImpl = mockFetch({}, false, 500);
    await expect(checkSolanaFinality("sig", { fetchImpl })).rejects.toThrow(/Solana RPC request failed/);
  });
});
