# MASTER PROMPT — Give this entire file to Claude Code

Paste everything below this line into Claude Code (or your coding agent of choice) as
the very first instruction in a fresh folder. It contains full project context,
everything verified about Moove.xyz, the existing codebase to extend, and exactly
what to build next.

**Environment: Ubuntu.** All commands in this prompt assume a Ubuntu/Debian-based
Linux system (bash shell, apt package manager). If you're on a different distro or
OS, adjust the setup commands in Section 0 accordingly — everything else in this
prompt is OS-agnostic (plain Node.js/TypeScript).

---

## 0. Ubuntu environment setup — run this first

Check what's already installed before installing anything:

```bash
node --version   # need >= 18; if missing or too old, install below
npm --version
git --version
```

If Node.js is missing or outdated, install a current LTS via NodeSource (avoids the
old version Ubuntu's default `apt` repo ships):

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

If `git` is missing:

```bash
sudo apt-get update && sudo apt-get install -y git
```

If `unzip` is missing (needed to extract `relay-existing.zip`):

```bash
sudo apt-get install -y unzip
```

Verify `npx` came with npm (it should, npm >= 5.2 bundles it):

```bash
npx --version
```

No global npm packages are required — this project only uses local `devDependencies`
(`tsx`, `vitest`, `typescript`), installed automatically by `npm install` inside the
project folder. Do not `sudo npm install -g` anything for this project.

---

## 1. What you're building

**Relay** — a developer toolkit that lets any AI agent (built with any framework)
autonomously discover, pay, and get access to a resource protected by **Moove
Agentic Payments** (moove.xyz), using the x402 open payment standard. This is being
built for submission to the **Moove Developer Program** ($100,000 fund, up to
$10,000/project, milestone-based, paid in USDC).

A working v1 already exists (attached as `relay-existing.zip` — unzip it into this
folder first and treat it as your starting point, not a from-scratch build). It has:
- A sandbox mock of Moove's payment-link API (`src/sandbox/mockMooveServer.ts`)
- A minimal TypeScript SDK client (`src/sdk/mooveClient.ts`)
- The core x402 middleware that turns any Express route into an agent-payable one
  via Moove (`src/x402/mooveX402Middleware.ts`)
- A finality checker that refuses to trust a settlement hash until the specific
  chain has reached a safe, conservative confirmation window
  (`src/safety/finalityChecker.ts`)
- An idempotency store preventing duplicate charges on agent retry
  (`src/safety/idempotencyStore.ts`)
- 14 passing automated tests + a working end-to-end demo (`src/demo.ts` +
  `src/demoAgent.ts`) that you can run right now with `npm install && npm test`

Your job: verify everything below against Moove's real, current docs (things may
have changed since this was written), then extend this codebase toward the
milestones in Section 5.

---

## 2. Everything verified about Moove.xyz — READ THIS BEFORE WRITING CODE

This section is the result of deep research into Moove's public docs, FAQ, GitHub,
X/Twitter, and the broader agentic-payments industry, as of September 2026. Every
line is labeled by confidence. **Re-verify anything marked "confirmed" against the
live docs before relying on it — things move fast on a young platform, and some of
this may be stale by the time you read it.**

### 2.1 The program itself (confirmed, from official announcements + application form)
- Moove Developer Program launched 6 Sept 2026. Fund: $100,000 total. Per project:
  up to $10,000 in USDC.
- Funding is **milestone-based**, disbursed in **tranches**, **not upfront**.
  Milestones are agreed in writing with Moove's team before the first disbursement.
- Funds go to your **Moove Handle** (create one at moove.xyz first).
- Their own words on what they want: *"shipping real products ON Moove Agentic
  Payments, the payment layer AI agents can actually use."*
- Named priority builder categories: shopping agents, agent-to-agent marketplaces,
  DAO treasury/payout bots, emerging-market commerce.
- The bar for milestones, in their words: **"live code, real transactions, real
  users."**
- Applicants get: early access to Moove APIs and Moove SDKs (implies an SDK may
  already exist privately — ASK about this on the review call rather than assuming
  none exists), direct collaboration with the founding team, product
  distribution/spotlight via Moove channels.
- The application form asks specifically for (among other things): a one-sentence
  description, a detailed technical description of which Moove Agentic Payments
  features you'll integrate and how, current project stage (Idea/Prototype/
  Live/Live With Users), funding amount requested, detailed use of funds, detailed
  milestones + timeline, and — importantly — **your expected transaction value and
  volume over the next 12 months**. Have realistic numbers ready for that.
- Eligibility/terms: applications reviewed at Moove's sole discretion, may include a
  video call; approval not guaranteed; clawback rights if a project is abandoned or
  milestones aren't met; KYC may be required for verification; you retain IP
  ownership of your project.

### 2.2 The product landscape (confirmed from docs.moove.xyz)
- Moove is a Web3 fintech platform, publicly launched 17 Jan 2026, ~30,000+ users
  across 30+ countries (company-reported, not independently audited).
- Product suite: Moove Profile/Handle (human-readable @handle identity), Send,
  Receive, Swap (16,000+ assets across 30+ chains), Ramp (on/off-ramp, Nigeria live
  via the Moove App, 50+ currencies "coming soon"), Manage (dashboard), Discover/
  Contacts/Marketplace, Wallet (non-custodial, CertiK-audited), Agentic Payments.
- **Moove Business went live 10 Sept 2026** — a self-serve dashboard for
  businesses, including **self-serve API key generation** and explicit language
  about plugging Moove Agentic Payments "straight into your stack." This is newer
  than most of the research below — re-check whether this changes what's available
  without waiting for program approval.
- Settlement model: payer can pay in any token on any chain; merchant receives
  their own chosen settlement token; same-chain/same-token transfers are free;
  cross-chain/cross-token has a flat protocol fee; Ramp has a separate rate.
  "No subscription, no monthly minimum, no deposit fee, no hidden spread" per their
  FAQ (referring to Moove's own usage fees, not the underlying gas/swap/protocol
  costs, which do apply per-transaction).
- No KYC needed to send, receive, swap, or bridge. KYC is only required for Moove
  Ramp (the licensed fiat off-ramp partner requires it).
- Wallets are non-custodial — Moove cannot see, reset, or recover your recovery
  phrase, and there's no Moove balance to freeze.

### 2.3 Moove Agentic Payments specifically (confirmed, this is the critical part)
- Official flagship announcement (21 Aug 2026) says: *"Now your AI agents can move
  money for you — send, receive, swap and settle across 30+ blockchains and 16,000+
  cryptocurrencies, permissionlessly and non-custodially, through a single API...
  Click. Integrate. Transact."*
- **However**, their own technical FAQ (docs.moove.xyz/faq), checked directly and
  more recently, states: **"Which agents exist for Moove Agentic Payments? Only the
  Moove [Receive Agent]."** Send/Swap/Ramp agents are announced in marketing but
  were found disabled/not-yet-live in the actual product picker.
- **Conclusion: there is a real gap between Moove's marketing language (implies
  full send/swap/settle agent capability) and their confirmed technical reality
  (only Receive Agent is live).** Do not build milestones that assume Send/Swap
  agents work. Re-verify this gap is still true before finalizing your pitch — it
  may have closed since this was written, especially given Moove Business just
  launched.
- The Receive Agent's function: "build a crypto checkout with one prompt" —
  natural-language-to-payment-link generation, not yet the "any agent can pay
  autonomously" capability this project (Relay) is building.

### 2.4 The real API surface (confirmed)
- Base URL: `https://api.moove.xyz`
- Confirmed capability: "serves payment-link creation and listing today" — this is
  the ONLY confirmed-live API surface as of the last check.
- No public SDK existed as of the research date (though "early access to Moove
  SDKs" as a program perk suggests one may exist privately — verify with the team).
- No public sandbox/test mode (confirmed absent from FAQ).
- No documented webhooks — settlement is confirmed by polling the listing endpoint
  and checking for an on-chain transaction hash.
- No public GitHub org, no CLI tool, no embeddable checkout widget (their FAQ
  explicitly states: "You cannot embed the Moove Widget... despite the name it is
  not an embeddable component" — the API is positioned as the supported
  integration path instead).
- Payment links: one-off by default; usage cap and expiry are settable via the API;
  perpetual/custom/recurring payment links are "announced but not built."
- Exact request/response field names, authentication scheme, and full endpoint list
  were **not verifiable** from public docs (the `/api-reference/*` pages were not
  reachable during research). **This is the single most important thing to verify
  first** once you have program-granted API access — the `types.ts` file in the
  existing codebase is a reasonable reconstruction, not a confirmed schema.

### 2.5 Fee/settlement transparency (confirmed, useful for realistic milestone numbers)
- Per their FAQ: "Three things sit between the amount and what arrives: network
  gas, the market cost of any swap or bridge, and the protocol fee." All itemized
  with the on-chain hash in Moove Transactions.

### 2.6 The wider agentic-payments industry (for differentiation — confirmed via research)
- Competing/adjacent standards: Coinbase's x402 (Base/Ethereum/Arbitrum/Polygon/
  Solana; governed by the x402 Foundation under Linux Foundation as of research
  date), Google's AP2/UCP, Stripe's ACP/MPP, Mastercard Agent Pay, Visa TAP/
  Intelligent Commerce, Skyfire (agent identity/trust).
- x402 specifically: open, widely adopted pattern across dozens of independent
  projects (checked via GitHub search — x402-agent-sdk, a2a-x402, PayAPI Market,
  Arch Tools, etc.). **No project found anywhere connects x402 to Moove
  specifically** — this is confirmed via direct search, not assumed.
- A well-documented, industry-wide unsolved problem: crypto payments are instantly
  final with no chargeback/refund mechanism, unlike cards. A 27-company coalition
  ("Internet Court," led by Genlayer Foundation, announced 10 July 2026) exists
  specifically to build dispute resolution for AI-agent crypto payments. This is a
  real, separate opportunity (an escrow/dispute layer) that was considered and
  explicitly set aside for this build in favor of focusing on the payment-connector
  problem — worth knowing about but out of scope for Relay v1.
- Documented security research (arXiv:2605.30998, arXiv:2605.11781) found real,
  reproducible duplicate-settlement bugs in production x402 facilitators (6% of
  concurrent-retry test rounds on a major facilitator) — this is the concrete,
  citable justification for Relay's idempotency-store safety layer, not a
  theoretical concern.

### 2.7 What was intentionally NOT pursued, and why (so you don't re-litigate this)
- **Sandbox/SDK as the primary pitch** — dropped as the core focus once the
  program's own text revealed "early access to Moove SDKs" as a stated perk,
  meaning Moove may already have one internally. Still built as internal tooling
  inside Relay (the sandbox + client), just not the headline pitch.
- **Escrow/dispute-resolution as the primary pitch** — considered strong (real,
  industry-recognized problem) but ultimately not chosen as the core, because it's
  not mentioned anywhere in Moove's own program language, unlike the agent-payment-
  connector angle which mirrors their flagship announcement almost word for word.
  Worth revisiting as a v2/stretch milestone once Relay v1 ships.
- **A WhatsApp/Telegram natural-language payment bot** — considered as a more
  "consumer-friendly, easy to use" alternative, matching Moove's stated mission to
  onboard "1 billion non-crypto-native consumers." Set aside because it's a softer
  fit for "agentic payments" (a human-directed bot, not an autonomous agent-to-
  agent transaction) — flagged as a possible parallel/future product, not this one.

---

## 3. Design inspirations — why the safety layers exist

Two specific engineering patterns were deliberately borrowed (as *patterns*, not
code) from a developer named Pratik Kale (GitHub: Pratikkale26), a friend of the
project owner:
- **Anvil** (an Anchor→Pinocchio Solana program transpiler) — its core discipline
  is: don't claim a migration is correct, *prove* it via a differential test that
  checks byte-equal behavior. Applied here as: don't claim a payment is "final" the
  instant a hash appears — prove it by waiting for the chain's real safe-finality
  window (`finalityChecker.ts`).
- **DecentralWatch** and **Flowrge's Gateway** — decentralized/independent status
  monitoring with signed proof, plus replay protection built into the sync layer.
  Applied here as the idempotency store preventing duplicate agent payments
  (`idempotencyStore.ts`).

These are legitimate, disclosed design inspirations — not code copied from those
projects, and neither of those projects has anything to do with Moove. Keep this
attribution honest in any public-facing docs; don't imply Pratik built anything
Moove-specific.

---

## 4. Your immediate tasks, in order

1. **Unzip `relay-existing.zip`** into the working folder:
   ```bash
   unzip relay-existing.zip -d .
   cd relay
   npm install
   npm test
   ```
   Confirm all 14 tests pass before changing anything. If `npm test` fails on a
   fresh Ubuntu machine, check the Node version first (`node --version` — needs
   >= 18) before debugging the code itself.
2. **Re-verify Section 2 against live sources.** Specifically check:
   - Is the Send/Swap agent gap (2.3) still true, or has Moove shipped more of the
     agent flow since this was written?
   - Has Moove published real API reference docs (auth scheme, exact field names)
     that supersede the reconstructed `types.ts`?
   - Does an official Moove SDK now exist publicly?
   Update `README.md`'s "Honesty notes" section with whatever you find — keep the
   same honest, confirmed-vs-assumed structure, don't delete it.
3. **If the real API contract differs from `types.ts`**, update `types.ts` and
   propagate the changes — the codebase is deliberately structured so only that
   file and `mooveClient.ts` should need real changes; `x402Middleware.ts` and the
   safety modules should keep working unchanged since they depend on the
   `MoovePaymentLink` interface, not raw HTTP shape.
4. Proceed to the milestones in Section 5.

---

## 5. Milestone plan to build toward

- **M1 (mostly done)**: Sandbox + SDK core, public repo, tests passing. Remaining
  work: add a `README` "Getting Started in 5 minutes" section and confirm the demo
  runs cleanly from a fresh clone.
- **M2**: Swap the sandbox for real `api.moove.xyz` calls once program API access
  is granted. Produce one real, settled mainnet transaction with a real on-chain
  hash as proof. Add an integration test that (safely, with a tiny real amount)
  exercises the real API end to end.
- **M3**: Harden the safety layer — replace the time-based finality heuristic in
  `finalityChecker.ts` with a real confirmation-count check against each chain's
  RPC (currently a deliberate placeholder, documented as such in the file's
  comments). Add a stress test simulating concurrent duplicate agent retries against
  the real idempotency store (not just the unit-level tests that exist today).
- **M4**: Add an MCP tool wrapper alongside the existing Express/x402 middleware,
  so agents built on Claude or other MCP-native stacks can use Relay without
  needing a raw x402 HTTP client. This directly broadens "real users."
- **M5**: Recruit 2–3 real integrations — actual agents or small services using
  Relay to pay through Moove — and publish full documentation. This is the "real
  users" milestone the program explicitly requires.

For each milestone, produce: the code (public repo commit), a real transaction or
test proof where applicable, and a short written note of what shipped — this
maps directly to what the program's milestone-verification process will ask for.

---

## 6. Ground rules while you work

- **Never fabricate a Moove API detail as if confirmed.** If something isn't in
  Moove's real docs and isn't yet verified with their team, mark it clearly as an
  assumption in code comments and in the README, the same way the existing
  codebase does. This project's credibility with Moove's review team depends on
  this honesty being visible, not just true.
- **Don't scope-creep into the escrow or chat-bot ideas** (Section 2.7) inside this
  same milestone plan — if they seem worth pursuing, flag them as a separate
  proposal, don't fold them into Relay's milestones without discussion.
- **Keep the safety layers' honesty notes intact** — `finalityChecker.ts` in
  particular is explicit that its numbers are general heuristics, not Moove-
  specific guidance. Don't upgrade that language to sound more authoritative than
  it is unless you've actually confirmed real numbers from Moove.
- **All new code should ship with tests**, following the existing pattern in
  `src/__tests__/`.

---

End of master prompt.
