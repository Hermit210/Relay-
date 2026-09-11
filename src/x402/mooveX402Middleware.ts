/**
 * Moove x402 connector — THE CORE PRODUCT.
 *
 * This is what turns Moove's Receive Agent (the one live piece of
 * "Moove Agentic Payments") into something an autonomous AI agent can pay
 * WITHOUT a human clicking a link — using x402, the open standard already
 * used across the agent-payment ecosystem (Coinbase, Cloudflare, and dozens
 * of independent projects — confirmed via search, none of which target
 * Moove specifically).
 *
 * Flow (standard x402 shape, adapted to Moove's REAL, confirmed API):
 *  1. Agent requests a protected resource with no payment.
 *  2. Server creates a Moove payment link (`POST /v1/payment-link`) and
 *     responds 402 Payment Required with it as the payment instructions.
 *  3. Agent pays that Moove link — the checkout page at its `url` shows the
 *     actual chain/token to pay in, since Moove's real create-response is
 *     narrow (`{id, url}` only) and doesn't expose that upfront.
 *  4. Agent retries the request with proof of payment.
 *  5. Server verifies settlement — using the finality checker, not a raw
 *     status flag — then grants access.
 *
 * TWO REAL API CONSTRAINTS THAT SHAPE THIS FILE (see types.ts for sources):
 *
 *  - No payee/destination field exists in Moove's request schema — every
 *    link settles to the wallet behind the API key. One Relay deployment
 *    therefore always collects to the SAME wallet; there is no per-route
 *    payee. What used to be a payee-match anti-replay check is replaced
 *    below with a Relay-side-only "resource binding": each created link is
 *    remembered (in-memory, per middleware instance) against the resource
 *    path it was created for, so a paid link for route A can't unlock route
 *    B even if both happen to cost the same amount. This is Relay's own
 *    bookkeeping, not something Moove verifies or is aware of.
 *
 *  - No idempotency parameter exists in Moove's create endpoint. The
 *    Idempotency-Key handling below is entirely Relay-side (IdempotencyStore)
 *    — Moove never sees or knows about it.
 *
 * HONESTY NOTE: production x402 uses a signed payment payload the server
 * cryptographically verifies. Since Moove's real settlement-proof mechanics
 * only expose a status flag (via list-scan, no push/webhook), step 5 here
 * verifies via polling + finality check, which is the verification method
 * Moove's own API actually supports today. Swap in a signature-based check
 * if Moove ever exposes one.
 */

import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { MooveClient } from "../sdk/mooveClient";
import { IdempotencyStore } from "../safety/idempotencyStore";

export interface X402ChallengeOptions {
  /** Decimal string, denominated in whatever token the destination wallet
   * settles in — Moove's real API doesn't let the caller choose a currency
   * per request, so there is no `currency` field here. */
  amount: string;
  /** Shown to the human payer on Moove's checkout page. */
  description?: string;
  /** How long the agent has to pay before the challenge is abandoned. */
  expiresInSeconds?: number;
  /** Overrides the default resource-binding key (req.path) — set this if
   * one Express route serves multiple distinct priced resources (e.g. a
   * product id in the query string) and needs separate binding per one. */
  resourceId?: string;
}

export interface MooveX402Config {
  client: MooveClient;
  /** decide the price for a given request; return null to allow it free */
  priceForRequest: (req: Request) => X402ChallengeOptions | null;
}

const PAYMENT_HEADER = "X-PAYMENT-LINK-ID";

interface LinkContext {
  amount: string;
  resourceKey: string;
}

/**
 * Express middleware implementing the Moove-flavored x402 challenge/verify
 * flow. Mount this in front of any route an agent should pay to access.
 */
export function mooveX402(config: MooveX402Config) {
  const idempotency = new IdempotencyStore();
  // Relay-side-only resource binding — see file header. Not sent to Moove.
  const linkContexts = new Map<string, LinkContext>();

  return async function middleware(req: Request, res: Response, next: NextFunction) {
    const challenge = config.priceForRequest(req);
    if (!challenge) return next(); // free route, no payment required

    const resourceKey = challenge.resourceId ?? req.path;
    const providedLinkId = req.header(PAYMENT_HEADER);

    // ---- Step 4/5: agent is retrying with proof of payment ----
    if (providedLinkId) {
      const context = linkContexts.get(providedLinkId);
      if (!context || context.resourceKey !== resourceKey || context.amount !== challenge.amount) {
        return res.status(402).json({
          error: "payment_mismatch",
          message: "Provided payment link was not created for this resource/price.",
        });
      }

      try {
        const link = await config.client.waitForSettlement(providedLinkId, {
          timeoutMs: 200, // don't block long here; if not final yet, tell the agent to keep polling
        });

        (req as any).payment = link;
        return next(); // payment verified and final — grant access
      } catch (err) {
        // Not yet final, went inactive, or invalid — fall through to re-challenge below.
        return res.status(402).json({
          error: "payment_not_final",
          message: (err as Error).message,
          paymentLinkId: providedLinkId,
        });
      }
    }

    // ---- Step 2: no payment yet — issue a 402 challenge ----
    const idempotencyKey = req.header("Idempotency-Key") ?? randomUUID();
    const cachedLinkId = idempotency.check(idempotencyKey);

    let linkId: string;
    let payUrl: string;

    if (cachedLinkId) {
      linkId = cachedLinkId;
      const existing = linkContexts.get(linkId);
      payUrl = existing ? await config.client.getPaymentLink(linkId).then((l) => l.url) : "";
    } else {
      const created = await config.client.createPaymentLink({
        toAmount: challenge.amount,
        description: challenge.description,
        expirationDate: challenge.expiresInSeconds
          ? new Date(Date.now() + challenge.expiresInSeconds * 1000).toISOString()
          : undefined,
      });
      idempotency.remember(idempotencyKey, created.id);
      linkContexts.set(created.id, { amount: challenge.amount, resourceKey });
      linkId = created.id;
      payUrl = created.url;
    }

    return res.status(402).json({
      error: "payment_required",
      paymentLinkId: linkId,
      payUrl,
      amount: challenge.amount,
      instructions: `Pay ${payUrl} — the checkout page shows the exact chain/token to pay in — then retry this request with header '${PAYMENT_HEADER}: ${linkId}'.`,
    });
  };
}
