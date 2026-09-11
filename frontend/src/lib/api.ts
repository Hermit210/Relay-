// Connects to the REAL backend event stream — src/demoDashboard.ts, running
// the real demoAgent.ts flow against the real mooveX402 middleware and
// MooveClient. Nothing here fabricates data; it only types and forwards
// whatever the backend actually broadcasts.

export const BACKEND_URL = "http://localhost:4002";

export type DashboardEvent =
  | { step: "requesting"; ts: number }
  | { step: "challenge"; paymentLinkId: string; payUrl: string; amount: string; ts: number }
  | { step: "settling"; ts: number }
  | { step: "settled_not_final"; chain: string; transactionUrl: string | null; ts: number }
  | { step: "countdown"; chain: string; secondsRemaining: number; final: boolean; ts: number }
  | { step: "final"; ts: number }
  | { step: "unlocked"; data: unknown; ts: number }
  | { step: "dedupe_demo_start"; ts: number }
  | { step: "dedupe_demo_result"; firstLinkId: string; secondLinkId: string; same: boolean; ts: number }
  | { step: "done"; ts: number }
  | { step: "error"; message: string; ts: number };

export type ConnectionStatus = "connecting" | "open" | "error";

export function connectToEvents(
  onEvent: (event: DashboardEvent) => void,
  onStatus?: (status: ConnectionStatus) => void
): () => void {
  const source = new EventSource(`${BACKEND_URL}/events`);
  onStatus?.("connecting");
  source.onopen = () => onStatus?.("open");
  source.onerror = () => onStatus?.("error");
  source.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as DashboardEvent);
    } catch {
      // ignore malformed frames
    }
  };
  return () => source.close();
}

export async function triggerRun(): Promise<void> {
  await fetch(`${BACKEND_URL}/run`, { method: "POST" });
}
