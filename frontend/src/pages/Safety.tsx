import { motion } from "motion/react";

export function Safety() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-lg mb-8">safety</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel
          title="finality checking"
          attribution="inspired by Pratik Kale's Anvil"
          body="A transaction hash existing isn't the same as a transaction being irreversible. Anvil's discipline for an Anchor→Pinocchio migration is: don't claim correctness, prove it with a differential test. Applied here: don't call a payment final the instant a status flips — wait for the chain's own safe confirmation depth first."
          field="Moove doesn't publish per-chain confirmation guidance, and its API doesn't expose a raw settlement timestamp — Relay measures from the moment it first observes completion, which only ever makes the check more conservative, never less."
        />
        <Panel
          title="duplicate-payment protection"
          attribution="inspired by Pratik Kale's DecentralWatch / Flowrge Gateway"
          body="Agents retry on timeout. Without protection, a retried request can create a second payment link for the same logical charge. Relay collapses concurrent retries sharing an Idempotency-Key into a single in-flight creation, so every caller gets back the same result."
          field="Independent security research reproduced duplicate settlement in 6% of concurrent-retry rounds against a major x402 facilitator. Relay's own stress test reproduced the same failure mode in this codebase before the fix — 5 duplicate links out of 50 concurrent retries — not a hypothetical."
        />
      </div>
    </div>
  );
}

function Panel({
  title,
  attribution,
  body,
  field,
}: {
  title: string;
  attribution: string;
  body: string;
  field: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3 }}
      className="border border-line rounded-sm p-5 flex flex-col gap-3"
    >
      <div>
        <h2 className="text-sm text-ink">{title}</h2>
        <p className="text-[11px] text-muted mt-0.5">{attribution}</p>
      </div>
      <p className="prose-body text-xs text-muted leading-relaxed">{body}</p>
      <div className="border-l-2 border-structural pl-3 text-[11px] text-muted prose-body leading-relaxed">
        {field}
      </div>
    </motion.div>
  );
}
