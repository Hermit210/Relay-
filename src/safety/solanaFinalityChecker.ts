/**
 * Solana RPC-based finality checker — a REAL confirmation-depth check
 * against the chain, not a time-based heuristic. Solana's own RPC exposes a
 * `confirmationStatus` per transaction signature ("processed" | "confirmed"
 * | "finalized") — "finalized" is Solana's own definition of irreversible,
 * so once a real signature is available, this doesn't need a heuristic at
 * all: it just asks the network directly via `getSignatureStatuses`.
 *
 * HONESTY NOTE — why this isn't wired into finalityChecker.ts's isFinal()
 * yet: Moove's confirmed real schema (types.ts) exposes only an optional
 * `transactionUrl` string on a settled payment link — not a raw transaction
 * signature, and the real URL format is not documented publicly. Parsing a
 * signature out of it would mean guessing at an unconfirmed format, exactly
 * the kind of fabrication this project's honesty notes commit to avoiding.
 * This module is real and tested against the live public Solana RPC (see
 * src/verifySolanaRpc.ts for a live, non-mocked run) and is ready to plug
 * into the main payment flow the moment either Moove's transactionUrl
 * format is confirmed to embed an extractable signature, or Moove exposes
 * one directly. Until then, finalityChecker.ts's time-based heuristic
 * remains the default for every chain family, Solana included.
 */

export type SolanaConfirmationStatus = "processed" | "confirmed" | "finalized" | null;

export interface SolanaFinalityResult {
  /** True only when Solana itself reports the signature as "finalized". */
  confirmed: boolean;
  status: SolanaConfirmationStatus;
  raw: unknown;
}

export const DEFAULT_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

export async function checkSolanaFinality(
  signature: string,
  opts: { rpcUrl?: string; fetchImpl?: typeof fetch } = {}
): Promise<SolanaFinalityResult> {
  const rpcUrl = opts.rpcUrl ?? DEFAULT_SOLANA_RPC_URL;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const res = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSignatureStatuses",
      params: [[signature], { searchTransactionHistory: true }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Solana RPC request failed (${res.status})`);
  }

  const body = (await res.json()) as {
    error?: unknown;
    result?: { value?: Array<{ confirmationStatus?: SolanaConfirmationStatus } | null> };
  };

  if (body.error) {
    throw new Error(`Solana RPC error: ${JSON.stringify(body.error)}`);
  }

  const value = body.result?.value?.[0] ?? null;
  const status = value?.confirmationStatus ?? null;

  return {
    confirmed: status === "finalized",
    status,
    raw: value,
  };
}
