import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { ArrowRight, Radio, ShieldCheck, Workflow } from "lucide-react";

const BOOT_LINES = [
  "$ agent requests protected resource",
  "< 402 payment required — route: x402",
  "$ paying via moove.xyz receive agent",
  "< settlement observed, awaiting finality",
  "< finality reached — access granted",
];

export function Home() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible >= BOOT_LINES.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), 450);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="text-xs text-muted mb-8 h-32">
        {BOOT_LINES.slice(0, visible).map((line, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {line}
          </motion.div>
        ))}
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-2xl md:text-3xl leading-snug mb-4"
      >
        Relay lets an AI agent discover, pay, and unlock a Moove-protected
        resource — fully autonomously — using the open x402 standard.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="prose-body text-sm text-muted leading-relaxed mb-10 max-w-xl"
      >
        Agent requests a resource. Server answers with a real Moove payment
        link instead of a paywall. Agent pays it. Relay refuses to call the
        payment "done" until the settlement chain has actually reached a safe
        confirmation depth — then, and only then, grants access.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="border border-line rounded-sm p-4 mb-10 text-xs text-muted prose-body leading-relaxed"
      >
        <span className="text-ink">Why this exists —</span> Moove's own
        agentic-payments docs confirm only the Receive Agent is live today;
        Send, Swap, and Ramp agents are announced but disabled. There was no
        publicly available way for an external AI agent, built with any
        framework, to actually pay through Moove. This is that connector.
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <NavCard to="/demo" icon={<Radio size={16} />} label="live demo" desc="watch the real flow run" />
        <NavCard to="/how-it-works" icon={<Workflow size={16} />} label="how it works" desc="architecture, honestly labeled" />
        <NavCard to="/safety" icon={<ShieldCheck size={16} />} label="safety" desc="finality + idempotency" />
      </div>
    </div>
  );
}

function NavCard({ to, icon, label, desc }: { to: string; icon: ReactNode; label: string; desc: string }) {
  return (
    <Link
      to={to}
      className="group border border-line rounded-sm p-4 flex flex-col gap-2 hover:border-structural transition-colors"
    >
      <div className="flex items-center justify-between text-muted group-hover:text-structural transition-colors">
        {icon}
        <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="text-sm text-ink">{label}</div>
      <div className="text-xs text-muted prose-body">{desc}</div>
    </Link>
  );
}
