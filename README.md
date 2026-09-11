# Relay

**Lets an AI agent discover, pay, and get access to a Moove-protected resource — fully autonomously, no human click — using the x402 open payment standard on top of Moove's live Receive Agent.**

Built for the [Moove Developer Program](https://www.moove.xyz/news/moovexyz-launches-100000-moove-developer-fund-to-drive-agentic-payments).

## Why this exists

Moove's own announcement says: *"Now your AI agents can move money for you... Just agents transacting value on your behalf."* Today, there is no publicly available way for an external AI agent — built with any framework, anywhere — to actually do that against Moove. This project is that missing connector.

## What's actually in this repo

| Module | What it does | Why |
|---|---|---|
| `src/sandbox/mockMooveServer.ts` | Fakes Moove's payment-link API so you can build/test without spending real funds | Moove has no public sandbox today (confirmed absent from their FAQ) |
| `src/sdk/mooveClient.ts` | A minimal typed client for the payment-link API | No public SDK exists for Moove today |
| `src/x402/mooveX402Middleware.ts` | The core product — turns any Express route into one an AI agent can pay for via Moove, using the x402 `402 Payment Required` pattern | This is the actual deliverable |
| `src/safety/finalityChecker.ts` | Refuses to treat a payment as "done" the instant a hash appears — waits for the chain's real safe-finality window | Inspired by [Pratik Kale's Anvil](https://github.com/Pratikkale26) — prove correctness, don't just claim it |
| `src/safety/idempotencyStore.ts` | Stops a retrying agent from accidentally double-paying | Inspired by Pratik Kale's DecentralWatch / Flowrge Gateway — proof-based tracking, replay protection |
| `src/mcp/relayMcpServer.ts` | MCP tool wrapper (`relay_request_resource`, `relay_complete_payment`, `relay_check_payment_link`) so MCP-native agents (Claude, etc.) can consume a Relay-protected resource without a raw x402 HTTP client | Broadens "real users" (M4) beyond agents that already speak raw HTTP/x402 |

## Getting started in 5 minutes

```bash
npm install
npm test               # 14 automated tests, all passing
npm run build           # tsc — should complete with no errors
npm run demo:server     # starts the sandbox Moove API (port 4501) + a paid demo route (port 4500)
# in a second terminal:
npm run demo:agent      # a real script that autonomously discovers, pays, and unlocks the resource
```

You should see the agent get a `402`, "pay" the sandbox link (auto-settles after a few seconds, like a real payer taking a moment to sign), wait out Solana's finality window, then print the unlocked data. No real funds or API key are needed for this — the sandbox fakes Moove's payment-link API entirely.

To point Relay at the real API instead of the sandbox: get an API key from [moove.xyz/dashboard/api-keys](https://www.moove.xyz/dashboard/api-keys) (scoped to the Moove Receive Agent), then construct the client as `new MooveClient({ baseUrl: "https://api.moove.xyz", apiKey: "mk_live_..." })`. Nothing else in the codebase changes — every module talks to the `MooveClient`/`MoovePaymentLink` interface, not to raw HTTP shape.

The demo agent has **zero payment logic hardcoded** beyond "read the 402 challenge and retry with the header it asks for" — everything else (creating the Moove link, waiting for settlement, verifying finality, preventing double-charge) happens inside Relay.

### Using it from an MCP-native agent (Claude, etc.)

```bash
npm run mcp:server   # starts src/mcp/relayMcpServer.ts on stdio
```

Point an MCP client (e.g. Claude Desktop's config, or any MCP SDK client) at that command. It exposes three tools:
- `relay_request_resource(url)` — fetches a Relay-protected URL; returns the data if free, or a payment challenge (`paymentLinkId`, `payUrl`, `amount`) if payment is required. It cannot pay the link itself (Moove's Send Agent isn't live — see honesty notes below), so it hands `payUrl` back for whoever holds the wallet to complete.
- `relay_complete_payment(url, paymentLinkId)` — retries the resource with proof of payment, polling until Relay confirms safe finality (or timing out).
- `relay_check_payment_link(baseUrl, paymentLinkId, apiKey?)` — looks up a link's status directly, without going through a specific resource.

See `src/__tests__/mcp.test.ts` for a full example of driving all three over the real MCP protocol (via `InMemoryTransport`, not a mocked call).

## Honesty notes — what's confirmed vs. what's this project's own design

**Confirmed directly from Moove's real docs and OpenAPI spec (verified 2026-09-11, re-checked against `https://api.moove.xyz/openapi.json` and `docs.moove.xyz`):**
- The real, current surface is `POST /v1/payment-link` (create) and `GET /v1/payment-link` (paginated list, filterable by `status`). `types.ts` now reflects this schema directly — it is a confirmed contract, not a reconstruction.
- **There is no `GET /v1/payment-link/{id}` endpoint.** Looking up one link by id means paging through the list client-side — see `mooveClient.ts`'s `getPaymentLink`. This is a real cost of Moove's current API, not a Relay design choice.
- **There is no payee/destination field anywhere in the request schema.** Per the docs: "The link settles to the authenticated user's default wallet... The destination cannot be specified by the caller." One API key — and therefore one Relay deployment — can only ever collect payments for the single wallet behind that key. There is no multi-payee routing, and no per-request `currency` choice either (the settlement token is fixed by the wallet, not the caller).
- **There is no settlement timestamp field** in the response schema (`PaymentLinkData` has a status flag and no `settledAt`/`completedAt`). Relay's finality check therefore measures from the moment *this client first observes* `status: "completed"`, not from Moove's own record of when it happened — documented in `mooveClient.ts`. Any lag between real settlement and first observation only makes the check more conservative, never less.
- Auth is `X-API-Key` header, key format `mk_live_...`, obtained via a self-serve dashboard (`moove.xyz/dashboard/api-keys`, part of Moove Business, launched 10 Sept 2026) and scoped to `payment_link:create` / `payment_link:read`. No key-minting endpoint exists — keys can't issue other keys.
- The API is explicitly documented as "live and serving production traffic" with **no sandbox/test mode** — confirmed even more directly than at initial research (this is why `src/sandbox/mockMooveServer.ts` exists at all).
- Only the **Moove Receive Agent** is live. Send/Swap/Ramp agents are "announced and appear disabled in the picker" (Moove's own FAQ wording, still true as of the last check).
- No official SDK exists ("Not yet. The API is a plain HTTP API and works from any language today" — Moove's FAQ, still true).
- No documented webhook — settlement is confirmed via status polling, matching what this codebase does.

**This project's own design choices, not Moove instructions:**
- Since there's no payee field to check for cross-resource replay protection, `mooveX402Middleware.ts` binds each created link to the resource path it was created for (`resourceId`/`req.path`) in its own in-memory map — this is Relay-side bookkeeping only, Moove never sees or verifies it.
- Idempotency (`Idempotency-Key` header → same link on retry) is entirely Relay-side (`IdempotencyStore`) — Moove's create endpoint has no idempotency parameter at all.
- Finality windows in `finalityChecker.ts` are keyed by chain **type family** (`EVM`/`SVM`/`TVM`/`BVM` — the one real enum Moove's spec confirms) rather than by exact chain name, because Moove doesn't publish or constrain real per-chain id values (`TokenData.chain.id` is an unconstrained string in the spec). Each family uses its slowest, most conservative member's safe-confirmation heuristic — not Moove-specific numbers, and not the API's data — replace with real per-chain guidance if Moove ever publishes one.
- Choosing x402 specifically (over AP2, MCP-native payments, etc.) is this project's synthesis of what protocol the wider agent ecosystem already speaks — Moove has not stated a protocol preference.

**Not yet built / next milestones:**
- A real, settled mainnet transaction with a real API key and a real on-chain hash as proof (M2).
- Replacing the time-based finality heuristic with a real confirmation-count check against each chain's RPC (M3).
- A stress test simulating concurrent duplicate agent retries against the real idempotency store, not just today's unit-level tests (M3).
- 2–3 real integrations using Relay to pay through Moove, with full documentation (M5).

**Shipped:**
- MCP tool wrapper (`src/mcp/relayMcpServer.ts`) alongside the HTTP x402 middleware, so agents built on Claude/other MCP-native stacks can call this without an x402 client (M4). It wraps the payer/consumer side only — it still can't autonomously pay a link, since Moove's Send Agent isn't live; a human or future Send Agent completes payment via `payUrl`, and the MCP tools handle discovery, retry, and finality-polling around that.

## License

MIT
