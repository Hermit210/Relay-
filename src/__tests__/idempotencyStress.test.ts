import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import express from "express";
import { createMockMooveServer } from "../sandbox/mockMooveServer";
import { MooveClient } from "../sdk/mooveClient";
import { mooveX402 } from "../x402/mooveX402Middleware";
import { IdempotencyStore } from "../safety/idempotencyStore";

const MOOVE_PORT = 4701;
const RESOURCE_PORT = 4700;

let mooveServer: Server;
let resourceServer: Server;

beforeAll(() => {
  const mooveApp = createMockMooveServer({ settleDelayMs: 5000, forceChainType: "SVM" });
  mooveServer = mooveApp.listen(MOOVE_PORT);

  const client = new MooveClient({ baseUrl: `http://localhost:${MOOVE_PORT}` });
  const resourceApp = express();
  resourceApp.get(
    "/paid",
    mooveX402({ client, priceForRequest: () => ({ amount: "1.00", description: "stress test" }) }),
    (req, res) => res.json({ ok: true })
  );
  resourceServer = resourceApp.listen(RESOURCE_PORT);
});

afterAll(() => {
  mooveServer.close();
  resourceServer.close();
});

describe("Idempotency under concurrent agent retries (stress test)", () => {
  it("50 concurrent requests with the SAME Idempotency-Key produce exactly ONE Moove payment link", async () => {
    const key = "concurrent-retry-key";
    const CONCURRENCY = 50;

    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        fetch(`http://localhost:${RESOURCE_PORT}/paid`, { headers: { "Idempotency-Key": key } }).then((r) => r.json())
      )
    );

    const linkIds = new Set(responses.map((r) => r.paymentLinkId));
    expect(linkIds.size).toBe(1); // exactly one link, no matter how many concurrent retries raced in

    const { data } = await (await fetch(`http://localhost:${MOOVE_PORT}/v1/payment-link`)).json();
    expect(data.length).toBe(1); // and the sandbox only ever saw ONE creation call
  });

  it("different Idempotency-Keys firing concurrently each get their own independent link", async () => {
    const CONCURRENCY = 20;
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        fetch(`http://localhost:${RESOURCE_PORT}/paid`, { headers: { "Idempotency-Key": `key-${i}` } }).then((r) => r.json())
      )
    );
    const linkIds = new Set(responses.map((r) => r.paymentLinkId));
    expect(linkIds.size).toBe(CONCURRENCY); // no cross-key collisions
  });

  it("IdempotencyStore.getOrCreate invokes the underlying create() exactly once under 100 concurrent callers", async () => {
    const store = new IdempotencyStore<string>();
    let createCalls = 0;
    const create = async () => {
      createCalls++;
      await new Promise((r) => setTimeout(r, 20));
      return "result-A";
    };

    const results = await Promise.all(Array.from({ length: 100 }, () => store.getOrCreate("same-key", create)));
    expect(createCalls).toBe(1);
    expect(results.every((r) => r === "result-A")).toBe(true);
  });
});
