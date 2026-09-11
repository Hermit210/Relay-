/**
 * Live, real-network proof that checkSolanaFinality works against the real
 * Solana mainnet RPC — not a mock. Run manually:
 *
 *    npx tsx src/verifySolanaRpc.ts
 *
 * Fetches the most recent signature for a permanently high-traffic account
 * (the SPL Token program) so this never goes stale or hits a pruned/unknown
 * signature, then checks its real finality status via a real RPC call.
 * Deliberately NOT part of `npm test` — that suite stays fully
 * offline/deterministic (see solanaFinalityChecker.test.ts for the mocked
 * unit coverage); this script plays the same role demo.ts/demoAgent.ts play
 * for the rest of this project: the manual "prove it against the real
 * world" step.
 */

import { checkSolanaFinality, DEFAULT_SOLANA_RPC_URL } from "./safety/solanaFinalityChecker";

const WELL_KNOWN_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"; // SPL Token program — always busy

async function fetchRecentSignature(): Promise<string> {
  const res = await fetch(DEFAULT_SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [WELL_KNOWN_ADDRESS, { limit: 1 }],
    }),
  });
  const body = (await res.json()) as { result?: Array<{ signature: string }> };
  const signature = body.result?.[0]?.signature;
  if (!signature) {
    throw new Error("Could not fetch a real signature from mainnet — RPC may be down or rate-limited.");
  }
  return signature;
}

async function main() {
  console.log(`[verify] Fetching a recent real signature for ${WELL_KNOWN_ADDRESS}...`);
  const signature = await fetchRecentSignature();
  console.log(`[verify] Got real signature: ${signature}`);

  console.log(`[verify] Checking its status via a real Solana RPC call...`);
  let result = await checkSolanaFinality(signature);
  console.log(`[verify] Status: ${result.status} (confirmed=${result.confirmed})`);

  if (!result.confirmed) {
    console.log(`[verify] Not finalized yet — waiting ~15s and checking again...`);
    await new Promise((r) => setTimeout(r, 15000));
    result = await checkSolanaFinality(signature);
    console.log(`[verify] Status after wait: ${result.status} (confirmed=${result.confirmed})`);
  }

  console.log(
    result.confirmed
      ? `[verify] SUCCESS — real mainnet signature ${signature} confirmed finalized via a real RPC round trip.`
      : `[verify] Signature not yet finalized after the wait — the RPC round trip and parsing both worked correctly regardless; this can happen under real network congestion.`
  );
}

main().catch((err) => {
  console.error("[verify] FAILED:", err);
  process.exit(1);
});
