import { motion } from "motion/react";

export function FinalityProgress({
  chain,
  secondsRemaining,
  maxSeconds,
  final,
}: {
  chain: string;
  secondsRemaining: number;
  maxSeconds: number;
  final: boolean;
}) {
  const pct = maxSeconds > 0 ? 100 - Math.min(100, (secondsRemaining / maxSeconds) * 100) : 100;

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-muted mb-1.5">
        <span>{chain} safe-finality window</span>
        <span className={final ? "text-final" : "text-pending"}>
          {final ? "final" : `${secondsRemaining}s remaining`}
        </span>
      </div>
      <div className="h-1.5 bg-surface-2 rounded-sm overflow-hidden border border-line">
        <motion.div
          className="h-full"
          style={{ backgroundColor: final ? "var(--color-final)" : "var(--color-pending)" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}
