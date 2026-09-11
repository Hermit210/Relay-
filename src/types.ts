/**
 * Relay — shared types
 *
 * CONFIRMED from Moove's real OpenAPI spec (https://api.moove.xyz/openapi.json,
 * verified 2026-09-11) and https://docs.moove.xyz/api-reference/introduction.
 * This replaces an earlier reconstructed guess — see git history / README for
 * what changed. Two real, load-bearing facts this schema encodes:
 *
 *  1. There is NO payee/destination field anywhere in the request schema.
 *     Per the docs: "The link settles to the authenticated user's default
 *     wallet, in that wallet's chain and token; toAmount is denominated in
 *     that token. The destination cannot be specified by the caller." A
 *     single API key (and therefore a single Relay deployment) can only ever
 *     collect payments for the ONE wallet behind that key — there is no
 *     multi-payee routing.
 *
 *  2. There is NO `GET /v1/payment-link/{id}` endpoint. The only read path is
 *     `GET /v1/payment-link` (paginated list, filterable by `status`). Looking
 *     up one link by id means paging through the list and matching client-side
 *     — see mooveClient.ts's getPaymentLink for the real (awkward) mechanics.
 *
 * Chain identity: TokenData.chain.id is an unconstrained string in the spec
 * (Moove does not publish an enum of real chain-id values), so this codebase
 * cannot honestly hardcode real per-chain ids. The only confirmed discriminator
 * is `chainType`, a real enum: EVM | SVM | TVM | BVM. Finality heuristics are
 * keyed off that instead — see safety/finalityChecker.ts.
 */

/** Confirmed enum from ChainData.chainType in the real OpenAPI spec. */
export type ChainType = "EVM" | "SVM" | "TVM" | "BVM";

export interface ChainData {
  id: string;
  name: string;
  symbol: string;
  chainType: ChainType;
  logo: string;
}

export interface TokenData {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  logo?: string | null;
  isNative?: boolean | null;
  isStablecoin?: boolean | null;
  currencyCode?: string | null;
  commodityCode?: string | null;
  chain: ChainData;
  priceUsd?: string | null;
  isVerified?: boolean | null;
}

/** Confirmed enum from PaymentLinkData.status. Note: no "expired" value —
 * "inactive" is the closest real status to what this codebase previously
 * called "expired" (a link no longer accepting payments). */
export type PaymentLinkStatus = "active" | "completed" | "inactive";

/** Real response shape of `PaymentLinkData` (full link object, returned only
 * from the list endpoint — the create endpoint returns the narrower
 * PaymentLinkCreationData below). */
export interface MoovePaymentLink {
  id: string;
  userId: string;
  toAmount: string;
  destinationAddress: string;
  url: string;
  dateCreated: string;
  token: TokenData;
  status: PaymentLinkStatus;
  description?: string | null;
  maxUsage?: number | null;
  receivedAmount?: string | null;
  expirationDate?: string | null;
  transactionUrl?: string | null;
}

/** Real response shape of `POST /v1/payment-link` — deliberately narrow. */
export interface PaymentLinkCreationData {
  id: string;
  url: string;
}

/** Real request body shape of `POST /v1/payment-link`. No payee/destination
 * field exists — see the file-level note above. */
export interface CreatePaymentLinkParams {
  toAmount: string;
  description?: string;
  maxUsage?: number;
  expirationDate?: string; // ISO 8601
}

/** Real response shape of `GET /v1/payment-link`. */
export interface PaginatedPaymentLinks {
  data: MoovePaymentLink[];
  limit: number;
  offset: number;
  nextOffset: number | null;
}

/**
 * Idempotency is NOT a Moove API concept (no idempotency-key parameter exists
 * in the real request schema). This remains a Relay-side-only safeguard: the
 * caller supplies a key, and Relay's own IdempotencyStore (not Moove) returns
 * the same link instead of creating a new one within the dedupe window. This
 * is the direct fix for the "agent retries, double-pays" failure mode
 * documented across the x402 ecosystem (duplicate-settlement races).
 */
export interface IdempotentCreateParams extends CreatePaymentLinkParams {
  idempotencyKey: string;
}
