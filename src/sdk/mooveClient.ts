/**
 * Moove SDK client — the piece that doesn't exist publicly for Moove today.
 * Confirmed from their own docs: "Not yet. The API is a plain HTTP API."
 *
 * Talks to the real, confirmed surface (https://api.moove.xyz/openapi.json,
 * verified 2026-09-11): `POST /v1/payment-link` to create, `GET
 * /v1/payment-link` to list. Two real API gaps this client has to work
 * around, both load-bearing enough to call out here rather than bury in a
 * diff:
 *
 *  1. NO `GET /v1/payment-link/{id}`. The only read path is the paginated
 *     list. `getPaymentLink` below pages through it looking for a match.
 *     This is a real cost of Moove's current API, not a Relay design choice
 *     — it gets slower as an account accumulates payment links. Capped at
 *     MAX_LOOKUP_PAGES so a lookup fails loudly instead of hanging forever.
 *
 *  2. NO settlement timestamp field anywhere in PaymentLinkData. There is no
 *     way to ask Moove "when did this settle" — only "what's its status
 *     right now". So finality timing can't be measured from server data; it
 *     is measured from the first time THIS CLIENT observed status flip to
 *     "completed" (see `observedCompletedAt` below). Every extra second
 *     between real settlement and this client's first poll only makes the
 *     finality check MORE conservative, never less — so this is a safe
 *     approximation, not a hidden risk, but it's still an approximation
 *     Moove's real schema forces on any integrator, not just Relay.
 */

import type { MoovePaymentLink, CreatePaymentLinkParams, PaymentLinkCreationData, PaginatedPaymentLinks } from "../types";
import { isFinal, FINALITY_RULES } from "../safety/finalityChecker";

const MAX_LOOKUP_PAGES = 20;

export interface MooveClientOptions {
  baseUrl: string; // point at sandbox during dev, https://api.moove.xyz in production
  /** Required against the real API (header `X-API-Key`, format `mk_live_...`).
   * Optional against the sandbox, which doesn't enforce auth. */
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class MooveClient {
  private baseUrl: string;
  private apiKey?: string;
  private fetchImpl: typeof fetch;
  // Client-side-only observation clock — see file header, gap #2.
  private observedCompletedAt = new Map<string, number>();

  constructor(opts: MooveClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      ...extra,
      ...(this.apiKey ? { "X-API-Key": this.apiKey } : {}),
    };
  }

  /** Real endpoint: `POST /v1/payment-link`. Note the response is
   * deliberately narrow (`{id, url}` only) — it is NOT a full PaymentLinkData,
   * so this does not return status/token/etc. Fetch the list to get those. */
  async createPaymentLink(params: CreatePaymentLinkParams): Promise<PaymentLinkCreationData> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/payment-link`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`createPaymentLink failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<PaymentLinkCreationData>;
  }

  async listPaymentLinks(opts: { status?: MoovePaymentLink["status"]; offset?: number } = {}): Promise<PaginatedPaymentLinks> {
    const qs = new URLSearchParams();
    if (opts.status) qs.set("status", opts.status);
    if (opts.offset) qs.set("offset", String(opts.offset));
    const res = await this.fetchImpl(`${this.baseUrl}/v1/payment-link?${qs.toString()}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`listPaymentLinks failed (${res.status})`);
    }
    return res.json() as Promise<PaginatedPaymentLinks>;
  }

  /**
   * Moove has no get-by-id endpoint (see file header, gap #1) — this pages
   * through the list looking for a match. Throws if not found within
   * MAX_LOOKUP_PAGES pages, rather than scanning an account's entire history
   * forever.
   */
  async getPaymentLink(id: string): Promise<MoovePaymentLink> {
    let offset: number | null = 0;
    for (let page = 0; page < MAX_LOOKUP_PAGES && offset !== null; page++) {
      const result: PaginatedPaymentLinks = await this.listPaymentLinks({ offset });
      const found = result.data.find((link) => link.id === id);
      if (found) return found;
      offset = result.nextOffset;
    }
    throw new Error(
      `Payment link ${id} not found after scanning ${MAX_LOOKUP_PAGES} pages — Moove's API has no get-by-id endpoint, so lookups are list scans; either it doesn't exist or the account has more links than this cap covers.`
    );
  }

  /**
   * Poll until the link is genuinely, safely done — not the moment `status`
   * flips to "completed", but the moment its settlement chain-type has
   * reached a safe confirmation depth, measured from THIS CLIENT's first
   * observation of completion (see file header, gap #2) since Moove's API
   * exposes no settlement timestamp to measure from directly.
   *
   * Throws on timeout rather than silently returning a maybe-final payment —
   * callers should treat a timeout as "unconfirmed", not "failed".
   */
  async waitForSettlement(
    id: string,
    opts: { pollIntervalMs?: number; timeoutMs?: number } = {}
  ): Promise<MoovePaymentLink> {
    const pollIntervalMs = opts.pollIntervalMs ?? 1000;
    const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const link = await this.getPaymentLink(id);

      if (link.status === "completed") {
        if (!this.observedCompletedAt.has(id)) {
          this.observedCompletedAt.set(id, Date.now());
        }
        const observedAt = this.observedCompletedAt.get(id)!;
        if (isFinal(link.token.chain.chainType, new Date(observedAt).toISOString())) {
          return link;
        }
        // Completed per Moove, but not yet past this chain-type's safe
        // finality window (measured from our own observation) — keep polling.
      }

      if (link.status === "inactive") {
        throw new Error(`Payment link ${id} went inactive before completing`);
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    throw new Error(
      `Timed out waiting for ${id} to reach safe finality (rules: ${JSON.stringify(FINALITY_RULES)})`
    );
  }
}
