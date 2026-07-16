import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Clock, AlertCircle, CheckCircle2, PauseCircle, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";
import { analyzeSpecTds, getBatchHealth, type BatchHealth } from "@/lib/specTdsAnalyze.functions";
import { refreshMasterSpecStore } from "@/data/masterSpecs";

/**
 * Trigger the queued single-material Analyze TDS action. Returns the
 * batch/item ids so callers can poll aggregate status via `getBatchHealth`.
 */
export async function runAnalyzeSpecTds(specId: string) {
  return analyzeSpecTds({ data: { specId } });
}

type UIState =
  | { kind: "idle" }
  | { kind: "queued"; batchId: string; label: string }
  | { kind: "processing"; batchId: string; attempts?: number }
  | { kind: "retry_waiting"; batchId: string; nextRetryAt: string | null }
  | { kind: "paused"; batchId: string; reason: string | null }
  | { kind: "stalled"; batchId: string; ageSeconds: number }
  | { kind: "failed"; batchId: string; code: string | null; message: string }
  | { kind: "cancelled"; batchId: string }
  | { kind: "cache_hit"; batchId: string }
  | { kind: "done"; batchId: string; updated: number };

function classify(h: BatchHealth): UIState {
  if (!h.batch) return { kind: "idle" };
  const c = h.counts;
  const batchId = h.batch.id;
  const bs = h.batch.status;

  if (bs === "cancelled") return { kind: "cancelled", batchId };
  if (bs === "paused_admin" || bs === "paused_cap") {
    return { kind: "paused", batchId, reason: h.batch.paused_reason };
  }

  if ((c.processing ?? 0) > 0) {
    return { kind: "processing", batchId };
  }
  if ((c.pending ?? 0) > 0) {
    if (h.next_retry_at) {
      return { kind: "retry_waiting", batchId, nextRetryAt: h.next_retry_at };
    }
    if ((h.oldest_pending_seconds ?? 0) > 600) {
      return { kind: "stalled", batchId, ageSeconds: h.oldest_pending_seconds ?? 0 };
    }
    return { kind: "queued", batchId, label: h.batch.label ?? "Queued" };
  }
  if ((c.skipped_cache ?? 0) > 0 && (c.done ?? 0) === 0) {
    return { kind: "cache_hit", batchId };
  }
  if ((c.done ?? 0) > 0) {
    return { kind: "done", batchId, updated: 0 };
  }
  if ((c.failed ?? 0) > 0) {
    const [code, ...rest] = Object.keys(h.errors);
    return {
      kind: "failed",
      batchId,
      code: code ?? null,
      message: rest.length ? `${code} +${rest.length} more` : (code ?? "Unknown error"),
    };
  }
  return { kind: "queued", batchId, label: h.batch.label ?? "Queued" };
}

function renderStatus(state: UIState) {
  switch (state.kind) {
    case "queued":
      return { icon: Clock, text: "Queued", tone: "text-muted-foreground" };
    case "processing":
      return { icon: Loader2, text: "Analyzing…", tone: "text-blue-400", spin: true };
    case "retry_waiting":
      return {
        icon: Clock,
        text: state.nextRetryAt
          ? `Retry ${new Date(state.nextRetryAt).toLocaleTimeString()}`
          : "Retry pending",
        tone: "text-amber-400",
      };
    case "paused":
      return {
        icon: PauseCircle,
        text: state.reason ? `Paused: ${state.reason}` : "Paused",
        tone: "text-amber-400",
      };
    case "stalled":
      return { icon: AlertCircle, text: `Stalled ${Math.round(state.ageSeconds / 60)}m`, tone: "text-red-400" };
    case "failed":
      return { icon: XCircle, text: `Failed (${state.code ?? "error"})`, tone: "text-red-400" };
    case "cancelled":
      return { icon: XCircle, text: "Cancelled", tone: "text-muted-foreground" };
    case "cache_hit":
      return { icon: Zap, text: "Cache hit", tone: "text-emerald-400" };
    case "done":
      return { icon: CheckCircle2, text: "Analyzed", tone: "text-emerald-400" };
    default:
      return null;
  }
}

export function AnalyzeTdsButton({
  specId,
  analyzedAt,
}: {
  specId: string;
  analyzedAt?: string | null;
}) {
  const [starting, setStarting] = useState(false);
  const [state, setState] = useState<UIState>({ kind: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup any interval on unmount.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (batchId: string) => {
    stopPolling();
    let intervalMs = 2000;
    let consecutiveNoChange = 0;
    let lastStatusKind = "";

    const tick = async () => {
      try {
        const h = await getBatchHealth({ data: { batchId } });
        const next = classify(h);
        setState(next);
        if (next.kind === "done" || next.kind === "cache_hit") {
          stopPolling();
          await refreshMasterSpecStore();
          toast.success(next.kind === "cache_hit" ? "TDS already extracted (cache)." : "TDS analyzed.");
          return;
        }
        if (next.kind === "failed") {
          stopPolling();
          toast.error(`Analyze failed: ${next.message}`);
          return;
        }
        if (next.kind === "cancelled") {
          stopPolling();
          return;
        }
        // Backoff: slow to 5s → 10s → 20s (cap) when nothing changes.
        if (next.kind === lastStatusKind) {
          consecutiveNoChange += 1;
          if (consecutiveNoChange >= 3 && intervalMs < 20000) {
            intervalMs = Math.min(intervalMs * 2, 20000);
            stopPolling();
            pollRef.current = setInterval(tick, intervalMs);
          }
        } else {
          consecutiveNoChange = 0;
          if (intervalMs !== 2000) {
            intervalMs = 2000;
            stopPolling();
            pollRef.current = setInterval(tick, intervalMs);
          }
        }
        lastStatusKind = next.kind;
      } catch (err) {
        // Transient errors: keep polling; log to console for admin diag.
        console.warn("[analyze-tds] poll error", err);
      }
    };
    pollRef.current = setInterval(tick, intervalMs);
    void tick();
  };

  const busy = starting || (state.kind !== "idle" && state.kind !== "done" && state.kind !== "cache_hit" && state.kind !== "failed" && state.kind !== "cancelled");
  const status = renderStatus(state);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        disabled={busy}
        onClick={async () => {
          setStarting(true);
          try {
            const res = await runAnalyzeSpecTds(specId);
            if (res.deduplicated) {
              toast.info("Already queued — showing existing job.");
            }
            setState({ kind: "queued", batchId: res.batchId, label: "Queued" });
            startPolling(res.batchId);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to enqueue TDS analysis");
          } finally {
            setStarting(false);
          }
        }}
        className="inline-flex items-center gap-1 text-xs bg-[var(--accent-violet,theme(colors.violet.500))]/15 text-[var(--accent-violet,theme(colors.violet.400))] hover:bg-[var(--accent-violet,theme(colors.violet.500))]/25 px-2 py-1 rounded disabled:opacity-60 disabled:cursor-not-allowed"
        title="Queue AI TDS extraction — runs on the shared worker with retries, caching, and provenance"
      >
        {starting ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" /> Queueing…
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3" /> {analyzedAt ? "Re-analyze TDS" : "Analyze TDS"}
          </>
        )}
      </button>
      {status && (
        <span className={`inline-flex items-center gap-1 text-[10px] ${status.tone}`}>
          <status.icon className={`w-3 h-3 ${"spin" in status && status.spin ? "animate-spin" : ""}`} />
          {status.text}
        </span>
      )}
      {analyzedAt && state.kind === "idle" && (
        <span className="text-[10px] text-muted-foreground">
          Analyzed {new Date(analyzedAt).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}
