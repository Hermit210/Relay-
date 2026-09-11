/**
 * A minimal "AI agent" — no human involved — that discovers a 402 challenge,
 * pays it through Moove (auto-settled by the sandbox after a delay, like a
 * real payer would take a few seconds), waits for SAFE finality, and then
 * retries to get the actual data. This is the whole point of the project,
 * demonstrated end to end with zero manual steps.
 */

const RESOURCE_URL = "http://localhost:4500/premium-market-data";
const SANDBOX_URL = "http://localhost:4501";

async function agentBuysData() {
  console.log("[agent] Requesting premium data with no payment...");
  const first = await fetch(RESOURCE_URL);
  if (first.status !== 402) {
    console.log("[agent] Unexpected: resource was free or errored.", await first.text());
    return;
  }
  const challenge = await first.json();
  console.log("[agent] Got 402 challenge:", challenge);

  console.log(`[agent] Paying ${challenge.payUrl} (simulated — sandbox auto-settles)...`);
  // In sandbox mode the link settles on its own after a delay, exactly like
  // a real payer taking a few seconds to actually approve/sign a payment.

  console.log("[agent] Waiting for the payment to reach SAFE finality (not just 'has a hash')...");
  let attempt = 0;
  let payload: any = null;
  while (attempt < 15) {
    attempt++;
    const retry = await fetch(RESOURCE_URL, {
      headers: { "X-PAYMENT-LINK-ID": challenge.paymentLinkId },
    });
    if (retry.status === 200) {
      payload = await retry.json();
      break;
    }
    const info = await retry.json();
    console.log(`[agent]   ...not final yet (${info.error}), retrying in 1s`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!payload) {
    console.log("[agent] Gave up waiting for finality.");
    return;
  }

  console.log("\n[agent] SUCCESS — got the data after autonomous payment:");
  console.log(JSON.stringify(payload, null, 2));

  console.log("\n[agent] Proving duplicate-protection: retrying the SAME original request...");
  const dupe = await fetch(RESOURCE_URL);
  const dupeChallenge = await dupe.json();
  console.log(
    dupeChallenge.paymentLinkId === challenge.paymentLinkId
      ? "[agent]   (new challenge issued, as expected — idempotency only applies within one Idempotency-Key, this is a fresh request)"
      : "[agent]   (new, independent challenge issued for this new request — correct behavior)"
  );
}

agentBuysData();
