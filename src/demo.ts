/**
 * End-to-end demo: a "protected resource" server that charges an AI agent
 * via Relay, plus the sandbox Moove server it talks to. Run this to
 * see the entire flow live in your terminal.
 *
 *    npx tsx src/demo.ts
 *
 * Then in another terminal, run the demo agent:
 *
 *    npx tsx src/demoAgent.ts
 */

import express from "express";
import { createMockMooveServer } from "./sandbox/mockMooveServer";
import { MooveClient } from "./sdk/mooveClient";
import { mooveX402 } from "./x402/mooveX402Middleware";

const MOOVE_SANDBOX_PORT = 4501;
const RESOURCE_SERVER_PORT = 4500;

async function main() {
  // 1. Start the sandbox Moove server (fakes api.moove.xyz)
  const mooveSandbox = createMockMooveServer({ settleDelayMs: 3000, forceChainType: "SVM" });
  mooveSandbox.listen(MOOVE_SANDBOX_PORT, () => {
    console.log(`[sandbox]  Fake Moove API running on http://localhost:${MOOVE_SANDBOX_PORT}`);
  });

  // 2. Point our SDK client at the sandbox (swap to https://api.moove.xyz in prod)
  const client = new MooveClient({ baseUrl: `http://localhost:${MOOVE_SANDBOX_PORT}` });

  // 3. Build a resource server with ONE paid route, protected by Relay
  const app = express();
  app.use(express.json());

  app.get(
    "/premium-market-data",
    mooveX402({
      client,
      priceForRequest: () => ({
        amount: "0.05",
        description: "Relay demo — premium market data",
      }),
    }),
    (req, res) => {
      const payment = (req as any).payment;
      res.json({
        data: { btc: 111234.5, sol: 233.1, eth: 4820.7 },
        paidWith: {
          linkId: payment.id,
          chain: payment.token.chain.name,
          transactionUrl: payment.transactionUrl,
        },
      });
    }
  );

  app.listen(RESOURCE_SERVER_PORT, () => {
    console.log(`[resource] Paid API running on http://localhost:${RESOURCE_SERVER_PORT}/premium-market-data`);
    console.log(`\nNow run: npx tsx src/demoAgent.ts\n`);
  });
}

main();
