import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server as HttpServer } from "http";
import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMockMooveServer } from "../sandbox/mockMooveServer";
import { MooveClient } from "../sdk/mooveClient";
import { mooveX402 } from "../x402/mooveX402Middleware";
import { createRelayMcpServer } from "../mcp/relayMcpServer";

const MOOVE_PORT = 4601;
const RESOURCE_PORT = 4600;
const RESOURCE_URL = `http://localhost:${RESOURCE_PORT}/paid`;
const FREE_URL = `http://localhost:${RESOURCE_PORT}/free`;

let mooveServer: HttpServer;
let resourceServer: HttpServer;
let mcpClient: Client;

function parse(result: Awaited<ReturnType<Client["callTool"]>>) {
  const first = (result.content as Array<{ type: string; text: string }>)[0];
  return JSON.parse(first.text);
}

beforeAll(async () => {
  const mooveApp = createMockMooveServer({ settleDelayMs: 50, forceChainType: "SVM" });
  mooveServer = mooveApp.listen(MOOVE_PORT);

  const client = new MooveClient({ baseUrl: `http://localhost:${MOOVE_PORT}` });
  const resourceApp = express();
  resourceApp.get("/free", (_req, res) => res.json({ ok: true, cost: 0 }));
  resourceApp.get(
    "/paid",
    mooveX402({
      client,
      priceForRequest: () => ({ amount: "1.00", description: "mcp test resource" }),
    }),
    (req, res) => res.json({ ok: true, payment: (req as any).payment.id })
  );
  resourceServer = resourceApp.listen(RESOURCE_PORT);

  const server = createRelayMcpServer();
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  mcpClient = new Client({ name: "relay-test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
});

afterAll(() => {
  mooveServer.close();
  resourceServer.close();
});

describe("Relay MCP server", () => {
  it("relay_request_resource returns data directly for a free resource", async () => {
    const result = await mcpClient.callTool({
      name: "relay_request_resource",
      arguments: { url: FREE_URL },
    });
    const body = parse(result);
    expect(body.status).toBe("ok");
    expect(body.data.ok).toBe(true);
  });

  it("relay_request_resource surfaces a payment challenge for a paid resource", async () => {
    const result = await mcpClient.callTool({
      name: "relay_request_resource",
      arguments: { url: RESOURCE_URL },
    });
    const body = parse(result);
    expect(body.status).toBe("payment_required");
    expect(body.paymentLinkId).toBeDefined();
    expect(body.payUrl).toContain("moove.xyz");
  });

  it("relay_complete_payment times out (isError) if the payment never reaches finality in time", async () => {
    const challenge = parse(
      await mcpClient.callTool({ name: "relay_request_resource", arguments: { url: RESOURCE_URL } })
    );

    const result = await mcpClient.callTool({
      name: "relay_complete_payment",
      arguments: { url: RESOURCE_URL, paymentLinkId: challenge.paymentLinkId, pollIntervalMs: 50, timeoutMs: 200 },
    });
    expect(result.isError).toBe(true);
    const body = parse(result);
    expect(body.status).toBe("timed_out");
  });

  it("relay_check_payment_link reflects a force-settled sandbox link", async () => {
    const created = await (
      await fetch(`http://localhost:${MOOVE_PORT}/v1/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toAmount: "2.00" }),
      })
    ).json();

    await fetch(`http://localhost:${MOOVE_PORT}/__test__/settle/${created.id}`, { method: "POST" });

    const result = await mcpClient.callTool({
      name: "relay_check_payment_link",
      arguments: { baseUrl: `http://localhost:${MOOVE_PORT}`, paymentLinkId: created.id },
    });
    const body = parse(result);
    expect(body.status).toBe("completed");
    expect(body.transactionUrl).toMatch(/^https:\/\//);
  });
});
