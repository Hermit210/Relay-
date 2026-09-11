/**
 * Relay MCP wrapper — lets agents built on Claude or other MCP-native stacks
 * consume a Relay/Moove x402-protected resource without implementing raw
 * x402 HTTP semantics (parsing a 402 body, resending the right header,
 * polling for finality) themselves.
 *
 * HONESTY NOTE: this wraps the PAYER/CONSUMER side, not the merchant side —
 * turning a resource into a paid one is still done via
 * `x402/mooveX402Middleware.ts` on an Express server, which is a more natural
 * fit for a merchant than an MCP tool. Also: Moove's only live agent is the
 * Receive Agent (confirmed — Send/Swap/Ramp are disabled in the product
 * picker). There is no autonomous way for code to actually move funds
 * against Moove today. So `relay_request_resource` cannot pay a link itself
 * — it surfaces the challenge (payUrl, amount, instructions) so whoever
 * holds the wallet (a human, or a future Send Agent) can complete payment
 * out of band, then `relay_complete_payment` picks up from there: it retries
 * the original request with proof of payment and polls until Relay's
 * safe-finality check passes.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MooveClient } from "../sdk/mooveClient";

const PAYMENT_HEADER = "X-PAYMENT-LINK-ID";

function textResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function createRelayMcpServer(opts: { fetchImpl?: typeof fetch } = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const server = new McpServer({ name: "relay-moove-x402", version: "1.0.0" });

  server.registerTool(
    "relay_request_resource",
    {
      description:
        "Request a Relay/Moove x402-protected resource. Returns the data directly if the resource is free, or a payment challenge (paymentLinkId, payUrl, amount, instructions) if payment is required. This tool cannot pay the link itself — Moove's Send Agent isn't live — so hand payUrl to whoever holds the wallet, then call relay_complete_payment once it's paid.",
      inputSchema: { url: z.string().url() },
    },
    async ({ url }) => {
      const res = await fetchImpl(url);
      if (res.status === 402) {
        const challenge = await res.json();
        return textResult({ status: "payment_required", ...challenge });
      }
      if (!res.ok) {
        return textResult({ status: "error", httpStatus: res.status, body: await res.text() }, true);
      }
      const data = await res.json().catch(() => null);
      return textResult({ status: "ok", data });
    }
  );

  server.registerTool(
    "relay_complete_payment",
    {
      description:
        "After a Moove payment link has been paid (e.g. via the payUrl from relay_request_resource), retries the original resource request with the payment proof header, polling until Relay confirms the payment has reached safe finality or the timeout elapses.",
      inputSchema: {
        url: z.string().url(),
        paymentLinkId: z.string(),
        pollIntervalMs: z.number().int().positive().optional(),
        timeoutMs: z.number().int().positive().optional(),
      },
    },
    async ({ url, paymentLinkId, pollIntervalMs, timeoutMs }) => {
      const interval = pollIntervalMs ?? 2000;
      const deadline = Date.now() + (timeoutMs ?? 60_000);
      let lastBody: unknown = null;

      while (true) {
        const res = await fetchImpl(url, { headers: { [PAYMENT_HEADER]: paymentLinkId } });
        lastBody = await res.json().catch(() => null);
        if (res.status === 200) {
          return textResult({ status: "ok", data: lastBody });
        }
        if (Date.now() >= deadline) {
          return textResult({ status: "timed_out", lastResponse: lastBody }, true);
        }
        await new Promise((r) => setTimeout(r, interval));
      }
    }
  );

  server.registerTool(
    "relay_check_payment_link",
    {
      description:
        "Look up a Moove payment link's current status directly, without hitting a specific protected resource. Note: Moove's real API has no get-by-id endpoint, so this pages through the account's link list to find a match — it can be slow on accounts with many links.",
      inputSchema: {
        baseUrl: z.string().url(),
        apiKey: z.string().optional(),
        paymentLinkId: z.string(),
      },
    },
    async ({ baseUrl, apiKey, paymentLinkId }) => {
      const client = new MooveClient({ baseUrl, apiKey, fetchImpl });
      try {
        const link = await client.getPaymentLink(paymentLinkId);
        return textResult(link);
      } catch (err) {
        return textResult({ error: (err as Error).message }, true);
      }
    }
  );

  return server;
}

export async function main() {
  const server = createRelayMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
