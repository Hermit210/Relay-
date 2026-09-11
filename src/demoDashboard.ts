/**
 * Browser-viewable visual demo — NOT a separate product, a visualization
 * layer on top of the real one. This stands up the same sandbox + x402
 * protected resource server as demo.ts, drives the same agent flow as
 * demoAgent.ts against them through the real MooveClient/mooveX402
 * middleware, and streams each real step to a browser page over
 * Server-Sent Events so the flow can be watched live instead of read from
 * terminal logs.
 *
 * The one deliberate liberty this file takes for visualization purposes:
 * the on-screen finality countdown is produced by polling the sandbox
 * directly (agent-side visibility) for display only. In the real API this
 * poll wouldn't be available to an external paying agent — Moove's list
 * endpoint requires the MERCHANT's own API key ("returns the payment links
 * belonging to the authenticated user"), so only the resource server itself
 * can watch its own links this way. The actual pass/fail decision for
 * unlocking the resource is never taken from this display poll — it always
 * comes from retrying the real protected endpoint and letting the real
 * mooveX402 middleware (with its own independent finality check) decide,
 * exactly like demoAgent.ts does. If the display poll and the real
 * middleware disagree about timing, the retry loop below just keeps
 * retrying until the middleware actually grants access — nothing here
 * fakes success.
 */

import express, { Request, Response } from "express";
import { createMockMooveServer } from "./sandbox/mockMooveServer";
import { MooveClient } from "./sdk/mooveClient";
import { mooveX402 } from "./x402/mooveX402Middleware";
import { isFinal, secondsUntilFinal } from "./safety/finalityChecker";

const MOOVE_SANDBOX_PORT = 4521;
const RESOURCE_SERVER_PORT = 4520;
const DASHBOARD_PORT = 4002;
const PAYMENT_HEADER = "X-PAYMENT-LINK-ID";
const RESOURCE_URL = `http://localhost:${RESOURCE_SERVER_PORT}/premium-market-data`;

const sseClients = new Set<Response>();

function broadcast(event: Record<string, unknown>) {
  const payload = `data: ${JSON.stringify({ ts: Date.now(), ...event })}\n\n`;
  for (const res of sseClients) res.write(payload);
}

async function runAgentFlow() {
  // Agent-side client, deliberately a SEPARATE instance from the resource
  // server's own client — see file header on why this is display-only.
  const agentClient = new MooveClient({ baseUrl: `http://localhost:${MOOVE_SANDBOX_PORT}` });

  broadcast({ step: "requesting" });
  const first = await fetch(RESOURCE_URL);
  if (first.status !== 402) {
    broadcast({ step: "error", message: `Expected a 402 challenge but got ${first.status}` });
    return;
  }
  const challenge = await first.json();
  broadcast({
    step: "challenge",
    paymentLinkId: challenge.paymentLinkId,
    payUrl: challenge.payUrl,
    amount: challenge.amount,
  });

  broadcast({ step: "settling" });

  // Display-only progress poll (see file header) — runs until the real
  // unlock loop below succeeds, then this is torn down.
  let displayPollActive = true;
  const displayPoll = (async () => {
    let observedCompletedAt: number | null = null;
    while (displayPollActive) {
      try {
        const link = await agentClient.getPaymentLink(challenge.paymentLinkId);
        if (link.status === "completed") {
          const chainType = link.token.chain.chainType;
          if (observedCompletedAt === null) {
            observedCompletedAt = Date.now();
            broadcast({ step: "settled_not_final", chain: link.token.chain.name, transactionUrl: link.transactionUrl });
          }
          const observedIso = new Date(observedCompletedAt).toISOString();
          broadcast({
            step: "countdown",
            chain: link.token.chain.name,
            secondsRemaining: Math.ceil(secondsUntilFinal(chainType, observedIso)),
            final: isFinal(chainType, observedIso),
          });
        }
      } catch {
        // link not visible yet (e.g. sandbox hasn't indexed it this tick) — keep polling
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  })();

  // The REAL unlock loop — identical in spirit to demoAgent.ts. This, not
  // the display poll above, is what actually determines success.
  let unlockedPayload: unknown = null;
  for (let attempt = 0; attempt < 60 && !unlockedPayload; attempt++) {
    const retry = await fetch(RESOURCE_URL, { headers: { [PAYMENT_HEADER]: challenge.paymentLinkId } });
    if (retry.status === 200) {
      unlockedPayload = await retry.json();
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  displayPollActive = false;
  await displayPoll;

  if (!unlockedPayload) {
    broadcast({ step: "error", message: "Gave up waiting for the real middleware to grant access." });
    return;
  }

  broadcast({ step: "final" });
  broadcast({ step: "unlocked", data: unlockedPayload });

  // Duplicate-protection demo: same Idempotency-Key -> same link, not a new one.
  broadcast({ step: "dedupe_demo_start" });
  const dedupeKey = "dashboard-demo-key";
  const a = await (await fetch(RESOURCE_URL, { headers: { "Idempotency-Key": dedupeKey } })).json();
  const b = await (await fetch(RESOURCE_URL, { headers: { "Idempotency-Key": dedupeKey } })).json();
  broadcast({
    step: "dedupe_demo_result",
    firstLinkId: a.paymentLinkId,
    secondLinkId: b.paymentLinkId,
    same: a.paymentLinkId === b.paymentLinkId,
  });

  broadcast({ step: "done" });
}

async function main() {
  // 1. Sandbox + protected resource server — the exact same real modules
  // demo.ts uses, just on dedicated ports so this file runs standalone.
  const mooveSandbox = createMockMooveServer({ settleDelayMs: 3000, forceChainType: "SVM" });
  mooveSandbox.listen(MOOVE_SANDBOX_PORT);

  const serverClient = new MooveClient({ baseUrl: `http://localhost:${MOOVE_SANDBOX_PORT}` });
  const resourceApp = express();
  resourceApp.use(express.json());
  resourceApp.get(
    "/premium-market-data",
    mooveX402({
      client: serverClient,
      priceForRequest: () => ({ amount: "0.05", description: "Relay dashboard demo — premium market data" }),
    }),
    (req, res) => {
      const payment = (req as any).payment;
      res.json({
        data: { btc: 111234.5, sol: 233.1, eth: 4820.7 },
        paidWith: { linkId: payment.id, chain: payment.token.chain.name, transactionUrl: payment.transactionUrl },
      });
    }
  );
  resourceApp.listen(RESOURCE_SERVER_PORT);

  // 2. Dashboard: one static page + one SSE stream. No build step, no framework.
  // CORS is open here because the frontend/ Vite dev server (a different
  // origin/port) also consumes this same /events and /run — this is a local
  // dev demo server, not a production API.
  const dashboardApp = express();
  dashboardApp.use((_req: Request, res: Response, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST");
    next();
  });

  dashboardApp.get("/", (_req: Request, res: Response) => {
    res.type("html").send(DASHBOARD_HTML);
  });

  dashboardApp.get("/events", (req: Request, res: Response) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
  });

  // Lets a fresh page load (or a manual refresh) kick off a new run.
  dashboardApp.post("/run", (_req: Request, res: Response) => {
    runAgentFlow().catch((err) => broadcast({ step: "error", message: (err as Error).message }));
    res.status(202).end();
  });

  dashboardApp.listen(DASHBOARD_PORT, () => {
    console.log(`[dashboard] Open http://localhost:${DASHBOARD_PORT} in your browser`);
    runAgentFlow().catch((err) => broadcast({ step: "error", message: (err as Error).message }));
  });
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Relay — live demo</title>
<style>
  :root { color-scheme: dark; }
  body {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    background: #0b0f14; color: #d8e1e8; max-width: 720px;
    margin: 40px auto; padding: 0 20px 60px;
  }
  h1 { font-size: 18px; color: #7fd1ff; margin-bottom: 4px; }
  .sub { color: #7a8ca0; font-size: 13px; margin-bottom: 24px; }
  button {
    background: #14202c; color: #7fd1ff; border: 1px solid #2a3542; border-radius: 4px;
    padding: 6px 12px; font: inherit; cursor: pointer; margin-bottom: 20px;
  }
  button:hover { border-color: #7fd1ff; }
  .step {
    padding: 10px 14px; margin: 8px 0; border-left: 3px solid #2a3542;
    opacity: 0.35; transition: opacity .3s, border-color .3s; border-radius: 2px;
    background: #0f1620;
  }
  .step.active { opacity: 1; border-color: #4fd18b; }
  .step.error { border-color: #ff5f5f; }
  .step h3 { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
  .step pre {
    margin: 6px 0 0; font-size: 12px; color: #9fb3c8; white-space: pre-wrap;
    word-break: break-all;
  }
  .bar { height: 8px; background: #1c2530; border-radius: 4px; overflow: hidden; margin-top: 8px; }
  .bar div { height: 100%; background: #4fd18b; width: 0%; transition: width .4s linear; }
</style>
</head>
<body>
<h1>Relay — live x402 + Moove payment demo</h1>
<p class="sub">Every step below is the real flow (src/demoDashboard.ts driving the real mooveX402 middleware and MooveClient against the sandbox Moove server) — not a scripted animation.</p>
<button id="rerun">Run again</button>
<div id="steps"></div>
<script>
  const LABELS = {
    requesting: "1. Agent requests the protected resource",
    challenge: "2. 402 Payment Required — Moove payment link issued",
    settling: "3. Payment settling (sandbox auto-settles, like a real payer taking a moment)",
    settled_not_final: "4. Settled on-chain — waiting for safe finality",
    final: "5. Finality reached — middleware granted access",
    unlocked: "6. Resource unlocked",
    dedupe_demo_start: "7. Duplicate-protection check (same Idempotency-Key)",
    dedupe_demo_result: "7. Duplicate-protection check (same Idempotency-Key)",
    done: "Done",
    error: "Error",
  };
  const ORDER = ["requesting","challenge","settling","settled_not_final","final","unlocked","dedupe_demo_start","dedupe_demo_result","done"];
  const container = document.getElementById("steps");
  const els = {};

  function reset() {
    container.innerHTML = "";
    for (const key in els) delete els[key];
  }

  function ensureStep(id) {
    if (els[id]) return els[id];
    const div = document.createElement("div");
    div.className = "step";
    div.innerHTML = "<h3>" + (LABELS[id] || id) + "</h3><pre></pre>";
    const order = ORDER.indexOf(id);
    const before = Object.keys(els).map(k => ({k, o: ORDER.indexOf(k)})).find(x => x.o > order);
    container.insertBefore(div, before ? els[before.k] : null);
    els[id] = div;
    return div;
  }

  function connect() {
    const es = new EventSource("/events");
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      const step = data.step;

      if (step === "countdown") {
        const el = els["settled_not_final"];
        if (!el) return;
        let bar = el.querySelector(".bar");
        if (!bar) {
          bar = document.createElement("div");
          bar.className = "bar";
          bar.innerHTML = "<div></div>";
          el.appendChild(bar);
        }
        el.querySelector("pre").textContent = data.chain + " — " + data.secondsRemaining + "s until safe finality" + (data.final ? " (final)" : "");
        const max = Number(bar.dataset.max || data.secondsRemaining || 1) || 1;
        bar.dataset.max = String(max);
        const pct = 100 - Math.min(100, (data.secondsRemaining / max) * 100);
        bar.querySelector("div").style.width = pct + "%";
        return;
      }

      const el = ensureStep(step);
      el.classList.add("active");
      if (step === "error") el.classList.add("error");
      el.querySelector("pre").textContent = JSON.stringify(data, null, 2);
    };
  }

  document.getElementById("rerun").addEventListener("click", async () => {
    reset();
    await fetch("/run", { method: "POST" });
  });

  connect();
</script>
</body>
</html>`;

main();
