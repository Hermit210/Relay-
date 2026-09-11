import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const NODES = [
  {
    id: "agent",
    label: "AI agent",
    detail: "Any framework, any language. Requests a resource with no payment — no x402 client required beyond reading a 402 body.",
  },
  {
    id: "middleware",
    label: "Relay x402 middleware",
    detail: "Wraps an Express route. Issues a 402 with a real Moove payment link, binds it to this specific resource, and verifies proof of payment on retry.",
  },
  {
    id: "moove",
    label: "Moove payment link",
    detail: "POST /v1/payment-link — the one live, confirmed endpoint. Settles to the resource server's own wallet; the caller can't redirect funds elsewhere.",
  },
  {
    id: "settlement",
    label: "Settlement",
    detail: "The agent pays the link (today: a human or the sandbox; Moove's Send Agent isn't live yet). Status flips to \"completed\" — but that's not the same as final.",
  },
  {
    id: "finality",
    label: "Finality check",
    detail: "Relay refuses to trust \"completed\" alone. It waits for the settlement chain's own safe confirmation window before treating the payment as real.",
  },
  {
    id: "access",
    label: "Access granted",
    detail: "Only after finality does the middleware call next() and let the real resource handler respond.",
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(NODES[0].id);
  const activeNode = NODES.find((n) => n.id === active)!;

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-lg mb-2">how it works</h1>
      <p className="prose-body text-xs text-muted mb-1 max-w-lg">
        Agent → Relay's x402 middleware → Moove payment link → settlement → finality check → access. Click a stage
        below for detail.
      </p>
      <div className="text-xs text-pending border border-pending/40 rounded-sm px-3 py-2 mb-8 inline-block prose-body">
        Runs against Moove's sandbox today. A real mainnet transaction with a real API key (M2) is the next
        milestone — not yet done.
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-8">
        {NODES.map((n, i) => (
          <div key={n.id} className="flex items-center">
            <button
              onClick={() => setActive(n.id)}
              className={`text-xs px-3 py-2 rounded-sm border transition-colors ${
                active === n.id
                  ? "border-structural text-ink bg-surface"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {n.label}
            </button>
            {i < NODES.length - 1 && <div className="w-6 h-px bg-line mx-1" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeNode.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="border border-line rounded-sm p-5 prose-body text-sm text-ink leading-relaxed max-w-xl"
        >
          {activeNode.detail}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
