import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, RotateCw } from "lucide-react";
import { connectToEvents, triggerRun, type ConnectionStatus, type DashboardEvent } from "../lib/api";
import { StepCard } from "../components/StepCard";
import { FinalityProgress } from "../components/FinalityProgress";
import { CodePanel } from "../components/CodePanel";

const MIDDLEWARE_SNIPPET = `const idempotencyKey = req.header("Idempotency-Key") ?? randomUUID();
const created = await idempotency.getOrCreate(idempotencyKey, async () => {
  const link = await config.client.createPaymentLink({
    toAmount: challenge.amount,
    description: challenge.description,
    // ...
  });
  linkContexts.set(link.id, { amount: challenge.amount, resourceKey });
  return { id: link.id, url: link.url };
});`;

const FINALITY_SNIPPET = `export function isFinal(chainType: ChainType, settledAtIso: string): boolean {
  const rule = FINALITY_RULES[chainType];
  if (rule === undefined) return false; // unmodeled chain: fail safe
  const settledAt = new Date(settledAtIso).getTime();
  const elapsedSeconds = (Date.now() - settledAt) / 1000;
  return elapsedSeconds >= rule;
}`;

const IDEMPOTENCY_SNIPPET = `async getOrCreate(key: string, create: () => Promise<T>): Promise<T> {
  const cached = this.check(key);
  if (cached !== undefined) return cached;
  const existing = this.inFlight.get(key);
  if (existing) return existing;
  const promise = create()
    .then((result) => { this.remember(key, result); return result; })
    .finally(() => { this.inFlight.delete(key); });
  this.inFlight.set(key, promise);
  return promise;
}`;

type StepMap = Partial<Record<DashboardEvent["step"], DashboardEvent>>;

export function LiveDemo() {
  const [steps, setSteps] = useState<StepMap>({});
  const [countdown, setCountdown] = useState<Extract<DashboardEvent, { step: "countdown" }> | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const maxSeconds = useRef<number | null>(null);

  useEffect(() => {
    const disconnect = connectToEvents((event) => {
      if (event.step === "countdown") {
        if (maxSeconds.current === null) maxSeconds.current = event.secondsRemaining;
        setCountdown(event);
        return;
      }
      setSteps((prev) => ({ ...prev, [event.step]: event }));
    }, setStatus);
    return disconnect;
  }, []);

  function runAgain() {
    setSteps({});
    setCountdown(null);
    maxSeconds.current = null;
    triggerRun();
  }

  const state = (key: DashboardEvent["step"]) => (steps[key] ? "final" as const : "idle" as const);
  const errored = steps.error;

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-lg">live demo</h1>
        <button
          onClick={runAgain}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-ink border border-line rounded-sm px-2.5 py-1.5 transition-colors"
        >
          <RotateCw size={12} /> run again
        </button>
      </div>
      <p className="prose-body text-xs text-muted mb-2 max-w-lg">
        This is the real backend (src/demo.ts + demoDashboard.ts) — the real{" "}
        <code className="text-ink">mooveX402</code> middleware and{" "}
        <code className="text-ink">MooveClient</code>, running against the sandbox. Nothing below is a scripted
        animation; every row lights up when its real event arrives.
      </p>

      {status === "error" && !steps.requesting && (
        <div className="text-xs text-error border border-error/40 rounded-sm p-3 mb-6 prose-body">
          Can't reach the backend at localhost:4002. Run{" "}
          <code className="text-ink">npm run demo:dashboard</code> from the relay/ root first.
        </div>
      )}

      <div className="space-y-2.5">
        <StepCard index={1} title="agent requests the protected resource" state={state("requesting")} />

        <StepCard index={2} title="402 payment required — link issued" state={state("challenge")}>
          {steps.challenge?.step === "challenge" && (
            <div className="space-y-0.5">
              <div>amount: {steps.challenge.amount}</div>
              <div className="truncate">link: {steps.challenge.paymentLinkId}</div>
              <CodePanel file="src/x402/mooveX402Middleware.ts" code={MIDDLEWARE_SNIPPET} />
            </div>
          )}
        </StepCard>

        <StepCard index={3} title="payment settling" state={state("settling")} />

        <StepCard
          index={4}
          title="settled — awaiting safe finality"
          state={steps.settled_not_final ? (countdown?.final ? "final" : "pending") : "idle"}
        >
          {steps.settled_not_final?.step === "settled_not_final" && (
            <>
              {countdown && (
                <FinalityProgress
                  chain={countdown.chain}
                  secondsRemaining={countdown.secondsRemaining}
                  maxSeconds={maxSeconds.current ?? countdown.secondsRemaining}
                  final={countdown.final}
                />
              )}
              <CodePanel file="src/safety/finalityChecker.ts" code={FINALITY_SNIPPET} />
            </>
          )}
        </StepCard>

        <StepCard index={5} title="finality reached — access granted" state={state("final")} />

        <StepCard index={6} title="resource unlocked" state={state("unlocked")}>
          <AnimatePresence>
            {steps.unlocked?.step === "unlocked" && (
              <motion.pre
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-1 p-2 bg-surface-2 rounded-sm text-[11px] overflow-x-auto border border-final/30"
              >
                {JSON.stringify(steps.unlocked.data, null, 2)}
              </motion.pre>
            )}
          </AnimatePresence>
        </StepCard>

        <StepCard
          index={7}
          title="duplicate-protection check (same Idempotency-Key)"
          state={steps.dedupe_demo_result ? "final" : state("dedupe_demo_start")}
        >
          {steps.dedupe_demo_result?.step === "dedupe_demo_result" && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 mt-1"
            >
              {steps.dedupe_demo_result.same ? (
                <CheckCircle2 size={14} className="text-final" />
              ) : (
                <XCircle size={14} className="text-error" />
              )}
              <span>
                {steps.dedupe_demo_result.same
                  ? "same link returned — no duplicate charge"
                  : "different links — unexpected"}
              </span>
              <CodePanel file="src/safety/idempotencyStore.ts" code={IDEMPOTENCY_SNIPPET} />
            </motion.div>
          )}
        </StepCard>

        {errored && errored.step === "error" && (
          <StepCard index={8} title="error" state="error">
            {errored.message}
          </StepCard>
        )}
      </div>
    </div>
  );
}
