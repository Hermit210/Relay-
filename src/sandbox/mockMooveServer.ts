/**
 * Sandbox: a mock of Moove's real payment-link API.
 *
 * WHY THIS EXISTS: Moove's own docs are explicit that there is no sandbox —
 * "The API is live and serving production traffic" (docs.moove.xyz/api-reference/
 * introduction, verified 2026-09-11). This module fakes that surface so you
 * (or any other builder) can develop and test against realistic behavior —
 * including realistic DELAY before settlement — without spending anything real.
 *
 * Mirrors the REAL, confirmed endpoint shape (https://api.moove.xyz/openapi.json):
 * `POST /v1/payment-link` (create, narrow `{id,url}` response) and
 * `GET /v1/payment-link` (paginated list, filterable by status) — there is no
 * get-by-id endpoint in the real API, so this sandbox deliberately doesn't
 * add one either; the SDK's list-scan behavior needs a sandbox that behaves
 * like the real gap, not one that papers over it.
 *
 * This is intentionally NOT a guess at Moove's real internals beyond the
 * documented contract. Swap the base URL to the real api.moove.xyz once you
 * have program API access, and the SDK layer (sdk/mooveClient.ts) doesn't
 * change at all.
 */

import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import type { MoovePaymentLink, CreatePaymentLinkParams, ChainType, TokenData } from "../types";

interface SandboxOptions {
  /** ms to wait before a link auto-settles, simulating real chain latency. Randomized per-chain-type if omitted. */
  settleDelayMs?: number;
  /** force every created link to settle on this chain type, for deterministic tests */
  forceChainType?: ChainType;
}

const CHAIN_TYPE_POOL: ChainType[] = ["SVM", "EVM", "TVM", "BVM"];

const FAKE_TOKENS: Record<ChainType, TokenData> = {
  SVM: {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
    isNative: false,
    isStablecoin: true,
    chain: { id: "solana", name: "Solana", symbol: "SOL", chainType: "SVM", logo: "" },
  },
  EVM: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
    isNative: false,
    isStablecoin: true,
    chain: { id: "base", name: "Base", symbol: "ETH", chainType: "EVM", logo: "" },
  },
  TVM: {
    address: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
    decimals: 6,
    symbol: "USDT",
    name: "Tether USD",
    isNative: false,
    isStablecoin: true,
    chain: { id: "tron", name: "Tron", symbol: "TRX", chainType: "TVM", logo: "" },
  },
  BVM: {
    address: "native",
    decimals: 8,
    symbol: "BTC",
    name: "Bitcoin",
    isNative: true,
    isStablecoin: false,
    chain: { id: "bitcoin", name: "Bitcoin", symbol: "BTC", chainType: "BVM", logo: "" },
  },
};

function fakeTxUrl(): string {
  return "https://explorer.example/tx/" + randomUUID().replace(/-/g, "");
}

export function createMockMooveServer(opts: SandboxOptions = {}) {
  const app = express();
  app.use(express.json());

  const links = new Map<string, MoovePaymentLink>();

  app.post("/v1/payment-link", (req: Request, res: Response) => {
    const body = req.body as CreatePaymentLinkParams;

    if (body.toAmount === undefined || body.toAmount === null) {
      return res.status(400).json({ error: "toAmount is required" });
    }

    const id = randomUUID();
    const now = new Date();
    const chainType = opts.forceChainType ?? CHAIN_TYPE_POOL[Math.floor(Math.random() * CHAIN_TYPE_POOL.length)];

    const link: MoovePaymentLink = {
      id,
      userId: "sandbox-user",
      toAmount: body.toAmount,
      destinationAddress: "sandbox-destination-wallet",
      url: `https://moove.xyz/pay/${id}`,
      dateCreated: now.toISOString(),
      token: FAKE_TOKENS[chainType],
      status: "active",
      description: body.description ?? null,
      maxUsage: body.maxUsage ?? 1,
      receivedAmount: null,
      expirationDate: body.expirationDate ?? null,
      transactionUrl: null,
    };

    links.set(id, link);

    // Simulate real settlement asynchronously, like a real payer would take
    // a few seconds/minutes to actually pay the link in production.
    const delay = opts.settleDelayMs ?? 1500 + Math.random() * 2000;
    setTimeout(() => {
      const current = links.get(id);
      if (!current || current.status !== "active") return;
      current.status = "completed";
      current.receivedAmount = current.toAmount;
      current.transactionUrl = fakeTxUrl();
      links.set(id, current);
    }, delay);

    // Real endpoint's response is deliberately narrow: {id, url} only.
    return res.status(200).json({ id, url: link.url });
  });

  app.get("/v1/payment-link", (req: Request, res: Response) => {
    const status = req.query.status as MoovePaymentLink["status"] | undefined;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const limit = 20;

    let all = Array.from(links.values()).sort((a, b) => a.dateCreated.localeCompare(b.dateCreated));
    if (status) all = all.filter((l) => l.status === status);

    const page = all.slice(offset, offset + limit);
    const nextOffset = offset + limit < all.length ? offset + limit : null;

    return res.json({ data: page, limit, offset, nextOffset });
  });

  // Test-only escape hatch: force-settle a link immediately, useful for
  // deterministic unit tests that shouldn't wait on real timers. Not part of
  // Moove's real API — a sandbox-only convenience.
  app.post("/__test__/settle/:id", (req: Request<{ id: string }>, res: Response) => {
    const link = links.get(req.params.id);
    if (!link) return res.status(404).json({ error: "not found" });
    link.status = "completed";
    link.receivedAmount = link.toAmount;
    link.transactionUrl = fakeTxUrl();
    return res.json(link);
  });

  return app;
}
