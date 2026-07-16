import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { enqueueTdsBatch, getBatchProgress, cancelBatch } from "@/lib/tdsQueue.functions";
import { refreshMasterSpecStore, type MasterSpec } from "@/data/masterSpecs";

const STORAGE_KEY = "tds-bulk-batch-id";

interface Progress {
  batch: { id: string; status: string; total: number; label: string | null };
  counts: { pending: number; processing: number; done: number; failed: number; skipped_cache: number };
  failures: Array<{ specId: string; error: string }>;
}

export function BulkAnalyzeTdsButton({
  specs,
  onRunningChange,
}: {
  specs: MasterSpec[];
  onRunningChange?: (running: boolean) => void;
}) {
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
  const [progress, setProgress] = useState<Progress | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [enqueueing, setEnqueueing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDoneRef = useRef(0);

  const withPdf = specs.filter((s) => s.tdsPdfPath);
  const analyzed = withPdf.filter((s) => s.tdsAnalyzedAt);
  const pending = withPdf.filter((s) => !s.tdsAnalyzedAt);

  const isRunning = progress?.batch.status === "running";

  useEffect(() => {
    onRunningChange?.(isRunning);
  }, [isRunning, onRunningChange]);

  // Poll for progress whenever we have a known batch id.
  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = (await getBatchProgress({ data: { batchId } })) as Progress;
        if (cancelled) return;
        setProgress(res);
        const totalDone = res.counts.done + res.counts.failed + res.counts.skipped_cache;
        if (totalDone > lastDoneRef.current) {
          lastDoneRef.current = totalDone;
          void refreshMasterSpecStore();
        }
        if (res.batch.status !== "running") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (err) {
        console.error("[BulkAnalyzeTds] poll error", err);
        // If batch is gone / forbidden, clear it.
        localStorage.removeItem(STORAGE_KEY);
        setBatchId(null);
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [batchId]);

  async function start(mode: "pending" | "all", count: number) {
    if (count > 5 && !confirm(`This will queue ${count} PDFs. Continue?`)) return;
    setChoicesOpen(false);
    setEnqueueing(true);
    try {
      const res = (await enqueueTdsBatch({ data: { mode } })) as { batchId: string; total: number };
      localStorage.setItem(STORAGE_KEY, res.batchId);
      lastDoneRef.current = 0;
      setBatchId(res.batchId);
      setProgress(null);
      setDialogOpen(true);
      toast.success(`Queued ${res.total} PDFs. Analysis will continue even if you close this window.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to enqueue batch");
    } finally {
      setEnqueueing(false);
    }
  }

  async function onCancel() {
    if (!batchId) return;
    try {
      await cancelBatch({ data: { batchId } });
      toast.info("Batch cancelled. In-flight items may still finish.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    }
  }

  const counts = progress?.counts;
  const total = progress?.batch.total ?? 0;
  const finishedCount = counts ? counts.done + counts.failed + counts.skipped_cache : 0;
  const pct = total > 0 ? Math.round((finishedCount / total) * 100) : 0;

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          disabled={enqueueing || withPdf.length === 0 || isRunning}
          onClick={() => setChoicesOpen(true)}
          className="inline-flex items-center gap-2 border border-border bg-background text-foreground rounded px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60 disabled:cursor-not-allowed"
          title="Run AI analysis on every material with an attached TDS PDF"
        >
          <Sparkles className="w-4 h-4" /> Analyze All TDS
        </button>
        {(isRunning || (progress && progress.batch.status !== "running")) && (
          <button
            onClick={() => setDialogOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            {isRunning ? `Running… ${finishedCount}/${total}` : "View last run"}
          </button>
        )}
      </div>

      {choicesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Bulk TDS Analysis</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {withPdf.length} material{withPdf.length === 1 ? "" : "s"} have PDFs attached.
                  {analyzed.length > 0 && ` ${analyzed.length} already analyzed.`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Runs on the server — you can close this window at any time.
                </p>
              </div>
              <button onClick={() => setChoicesOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                disabled={pending.length === 0}
                onClick={() => start("pending", pending.length)}
                className="w-full text-left px-3 py-2 rounded border border-border bg-secondary hover:bg-secondary/70 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-sm font-medium text-foreground">
                  Analyze {pending.length} new (skip already analyzed)
                </div>
                <div className="text-xs text-muted-foreground">Recommended — skips PDFs already processed.</div>
              </button>
              <button
                onClick={() => start("all", withPdf.length)}
                className="w-full text-left px-3 py-2 rounded border border-border bg-background hover:bg-secondary"
              >
                <div className="text-sm font-medium text-foreground">Re-analyze all {withPdf.length}</div>
                <div className="text-xs text-muted-foreground">Reruns every PDF. Unchanged PDFs reuse cached extractions.</div>
              </button>
              <button
                onClick={() => setChoicesOpen(false)}
                className="w-full text-left px-3 py-2 rounded text-sm text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogOpen && progress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-lg p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isRunning ? "Analyzing TDS PDFs" : progress.batch.status === "cancelled" ? "Cancelled" : "Analysis complete"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {finishedCount} / {total} ({pct}%)
                </p>
              </div>
              <button
                onClick={() => setDialogOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full h-2 bg-secondary rounded overflow-hidden">
              <div
                className="h-full bg-[var(--accent-violet,theme(colors.violet.500))] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="grid grid-cols-5 gap-2 text-center">
              <Stat label="Pending" value={counts?.pending ?? 0} />
              <Stat label="Running" value={counts?.processing ?? 0} />
              <Stat label="Updated" value={counts?.done ?? 0} />
              <Stat label="Cached" value={counts?.skipped_cache ?? 0} />
              <Stat label="Failed" value={counts?.failed ?? 0} />
            </div>

            {progress.failures.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {progress.failures.length} failure
                  {progress.failures.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                  {progress.failures.map((f) => (
                    <li key={f.specId} className="text-muted-foreground">
                      <span className="text-foreground">{f.specId.slice(0, 8)}…</span> — {f.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {isRunning && (
              <button
                onClick={onCancel}
                className="w-full px-3 py-2 rounded border border-border text-sm text-foreground hover:bg-secondary"
              >
                Cancel batch
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border p-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}
