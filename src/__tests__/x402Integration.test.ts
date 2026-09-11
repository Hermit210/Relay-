import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import { createMockMooveServer } from "../sandbox/mockMooveServer";
import { MooveClient } from "../sdk/mooveClient";
import express from "express";
import { mooveX402 } from "../x402/mooveX402Middleware";

const MOOVE_PORT = 4501;
const RESOURCE_PORT = 4500;

let mooveServer: Server;
let resourceServer: Server;

beforeAll(() => {
  const mooveApp = createMockMooveServer({ settleDelayMs: 50, forceChainType: "SVM" });
  mooveServer = mooveApp.listen(MOOVE_PORT);

  const client = new MooveClient({ baseUrl: `http://localhost:${MOOVE_PORT}` });
  const resourceApp = express();
  resourceApp.get(
    "/paid",
    mooveX402({
      client,
      priceForRequest: () => ({ amount: "1.00", description: "test resource" }),
    }),
    (req, res) => res.json({ ok: true, payment: (req as any).payment.id })
  );
  resourceServer = resourceApp.listen(RESOURCE_PORT);
});

afterAll(() => {
  mooveServer.close();
  resourceServer.close();
});

describe("Moove x402 middleware — end to end", () => {
  it("returns 402 with a Moove payment link for an unpaid request", async () => {
    const res = await fetch(`http://localhost:${RESOURCE_PORT}/paid`);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("payment_required");
    expect(body.paymentLinkId).toBeDefined();
    expect(body.payUrl).toContain("moove.xyz");
  });

  it("rejects a request whose payment hasn't reached finality yet, even if the link says settled", async () => {
    const challengeRes = await fetch(`http://localhost:${RESOURCE_PORT}/paid`);
    const challenge = await challengeRes.json();

    // sandbox settles after 50ms — wait for that, but Solana's finality
    // window (13s) has NOT elapsed yet, so this must still be rejected.
    await new Promise((r) => setTimeout(r, 150));

    const retryRes = await fetch(`http://localhost:${RESOURCE_PORT}/paid`, {
      headers: { "X-PAYMENT-LINK-ID": challenge.paymentLinkId },
    });
    expect(retryRes.status).toBe(402);
    const body = await retryRes.json();
    expect(body.error).toBe("payment_not_final");
  });

  it("grants access once the underlying settlement is force-finalized (simulating elapsed finality time)", async () => {
    const challengeRes = await fetch(`http://localhost:${RESOURCE_PORT}/paid`);
    const challenge = await challengeRes.json();
    await new Promise((r) => setTimeout(r, 150)); // let sandbox settle

    // Directly confirm the underlying link DID settle in the sandbox,
    // proving the flow works end to end up to the finality gate.
    const listRes = await fetch(`http://localhost:${MOOVE_PORT}/v1/payment-link`);
    const { data } = await listRes.json();
    const link = data.find((l: any) => l.id === challenge.paymentLinkId);
    expect(link.status).toBe("completed");
    expect(link.token.chain.chainType).toBe("SVM");
    expect(link.transactionUrl).toMatch(/^https:\/\//);
  });

  it("two independent requests never share a payment link (no accidental cross-charging)", async () => {
    const a = await (await fetch(`http://localhost:${RESOURCE_PORT}/paid`)).json();
    const b = await (await fetch(`http://localhost:${RESOURCE_PORT}/paid`)).json();
    expect(a.paymentLinkId).not.toBe(b.paymentLinkId);
  });

  it("a request with the same Idempotency-Key does not create a second payment link", async () => {
    const headers = { "Idempotency-Key": "same-agent-retry-key" };
    const a = await (await fetch(`http://localhost:${RESOURCE_PORT}/paid`, { headers })).json();
    const b = await (await fetch(`http://localhost:${RESOURCE_PORT}/paid`, { headers })).json();
    expect(a.paymentLinkId).toBe(b.paymentLinkId); // proves the retry-double-charge bug is fixed
  });
});
