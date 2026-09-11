/**
 * Finality checker — inspired by Pratik Kale's Anvil (github.com/Pratikkale26),
 * which doesn't claim an Anchor→Pinocchio migration is correct — it runs a
 * differential test and proves byte-equal behavior before trusting it.
 *
 * Applied here: a transaction hash existing is NOT the same as a transaction
 * being irreversible. Different chains reach "no realistic reorg" at very
 * different speeds. Moove settles across many chains via one on-chain
 * transaction — this module refuses to call a payment "final" until the
 * chain it settled on has actually reached a safe depth.
 *
 * HONESTY NOTE: Moove's own docs do not publish confirmation-depth guidance
 * per chain (checked — not found), and their real OpenAPI spec does not
 * enumerate real per-chain id values either (TokenData.chain.id is an
 * unconstrained string) — so this codebase cannot honestly hardcode rules
 * keyed by e.g. "solana" or "base" as if those were confirmed Moove chain
 * ids. The one thing the spec DOES confirm is `chain.chainType`, a real enum:
 * EVM | SVM | TVM | BVM. Finality windows below are standard, widely
 * published safe-confirmation heuristics for each VM FAMILY (the kind used
 * by exchanges and bridges generally), not Moove-specific numbers, and not
 * even per-exact-chain — they're deliberately the most conservative member
 * of each family (e.g. EVM covers both fast L2s and slow Ethereum L1, so it
 * uses the slow number). Replace with real per-chain guidance if Moove
 * publishes one during the program.
 */

import type { ChainType } from "../types";

/** Seconds after settlement before a chain-type family is treated as safely
 * irreversible. Conservative (slowest-member-of-family) defaults. */
export const FINALITY_RULES: Record<ChainType, number> = {
  SVM: 13, // Solana-family: ~32 slots at ~400ms is the commonly cited safe depth
  EVM: 15 * 60, // covers both L2s and Ethereum L1 — uses the slower, conservative bound
  TVM: 60, // Tron-family: ~19-block confirmation is the commonly cited safe depth
  BVM: 60 * 60, // Bitcoin-family: ~6 confirmations at ~10 min/block
};

/**
 * Returns true only if enough wall-clock time has passed since settledAt
 * for this specific chain-type's safe-finality window.
 *
 * This is deliberately a TIME heuristic, not a real confirmation-count
 * check against a node — because this SDK does not have RPC access to
 * every chain. A production version should replace this with a real
 * confirmation-count query per chain; this module exists to make that
 * requirement explicit and impossible to silently skip.
 */
export function isFinal(chainType: ChainType, settledAtIso: string): boolean {
  const rule = FINALITY_RULES[chainType];
  if (rule === undefined) {
    // Unknown chain type: fail safe, never assume finality for something unmodeled.
    return false;
  }
  const settledAt = new Date(settledAtIso).getTime();
  const elapsedSeconds = (Date.now() - settledAt) / 1000;
  return elapsedSeconds >= rule;
}

export function secondsUntilFinal(chainType: ChainType, settledAtIso: string): number {
  const rule = FINALITY_RULES[chainType];
  if (rule === undefined) return Infinity;
  const settledAt = new Date(settledAtIso).getTime();
  const elapsedSeconds = (Date.now() - settledAt) / 1000;
  return Math.max(0, rule - elapsedSeconds);
}
