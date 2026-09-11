import { type ReactNode } from "react";
import { motion } from "motion/react";

type State = "idle" | "pending" | "final" | "error";

const BORDER: Record<State, string> = {
  idle: "border-line",
  pending: "border-pending",
  final: "border-final",
  error: "border-error",
};

export function StepCard({
  index,
  title,
  state,
  children,
}: {
  index: number;
  title: string;
  state: State;
  children?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: state === "idle" ? 0.35 : 1, x: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`border-l-2 ${BORDER[state]} bg-surface pl-4 pr-4 py-3 rounded-sm`}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-muted text-xs">{String(index).padStart(2, "0")}</span>
        <h3 className="text-sm">{title}</h3>
      </div>
      {children && <div className="mt-1 text-xs text-muted">{children}</div>}
    </motion.div>
  );
}
