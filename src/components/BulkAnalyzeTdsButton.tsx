import { useState } from "react";
import { Sparkles, Loader2, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { runAnalyzeSpecTds } from "@/components/AnalyzeTdsButton";
import { refreshMasterSpecStore, type MasterSpec } from "@/data/masterSpecs";

interface Failure {
  specId: string;
  name: string;
  error: string;
}

export function BulkAnalyzeTdsButton({
  specs,
  onRunningChange,
}: {
  specs: MasterSpec[];
  onRunningChange?: (running: boolean) => void;
}) {
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [tally, setTally] = useState({ updated: 0, unchanged: 0, failed: 0 });
  const [failures, setFailures] = useState<Failure[]>([]);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [finished, setFinished] = useState(false);

  const withPdf = specs.filter((s) => s.tdsPdfPath);
  const analyzed = withPdf.filter((s) => s.tdsAnalyzedAt);
  const pending = withPdf.filter((s) => !s.tdsAnalyzedAt);

  const setRun = (v: boolean) => {
    setRunning(v);
    onRunningChange?.(v);
  };

  async function run(queue: MasterSpec[]) {
    if (queue.length > 5) {
      if (!confirm(`This will analyze ${queue.length} PDFs and can take several minutes. Continue?`)) return;
    }
    setChoicesOpen(false);
    setRun(true);
    setFinished(false);
    setCancelRequested(false);
    setTally({ updated: 0, unchanged: 0, failed: 0 });
    setFailures([]);
    setProgress({ done: 0, total: queue.length, current: "" });

    for (let i = 0; i < queue.length; i++) {
      if (cancelRequested) break;
      const s = queue[i];
      setProgress({ done: i, total: queue.length, current: `${s.vendor} ${s.productName}` });
      const attempt = async () => runAnalyzeSpecTds(s.id);
      try {
        let res;
        try {
          res = await attempt();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.toLowerCase().includes("rate limit")) {
            await new Promise((r) => setTimeout(r, 30_000));
            res = await attempt();
          } else {
            throw err;
          }
        }
        setTally((t) => ({
          ...t,
          updated: t.updated + (res.updatedCount > 0 ? 1 : 0),
          unchanged: t.unchanged + (res.updatedCount === 0 ? 1 : 0),
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setTally((t) => ({ ...t, failed: t.failed + 1 }));
        setFailures((f) => [...f, { specId: s.id, name: `${s.vendor} ${s.productName}`, error: msg }]);
      }
    }

    setProgress((p) => ({ ...p, done: p.total, current: "" }));
    setFinished(true);
    setRun(false);
    await refreshMasterSpecStore();
    toast.success("Bulk TDS analysis complete.");
  }

  return (
    <>
      <button
        disabled={running || withPdf.length === 0}
        onClick={() => setChoicesOpen(true)}
        className="inline-flex items-center gap-2 border border-border bg-background text-foreground rounded px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60 disabled:cursor-not-allowed"
        title="Run AI analysis on every material with an attached TDS PDF"
      >
        <Sparkles className="w-4 h-4" /> Analyze All TDS
      </button>

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
              </div>
              <button onClick={() => setChoicesOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                disabled={pending.length === 0}
                onClick={() => run(pending)}
                className="w-full text-left px-3 py-2 rounded border border-border bg-secondary hover:bg-secondary/70 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-sm font-medium text-foreground">
                  Analyze {pending.length} new (skip already analyzed)
                </div>
                <div className="text-xs text-muted-foreground">Recommended — skips PDFs already processed.</div>
              </button>
              <button
                onClick={() => run(withPdf)}
                className="w-full text-left px-3 py-2 rounded border border-border bg-background hover:bg-secondary"
              >
                <div className="text-sm font-medium text-foreground">Re-analyze all {withPdf.length}</div>
                <div className="text-xs text-muted-foreground">Reruns every PDF, including previously analyzed.</div>
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

      {(running || finished) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-lg p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {running ? "Analyzing TDS PDFs" : "Analysis complete"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {progress.done} / {progress.total}
                  {running && progress.current && ` — ${progress.current}`}
                </p>
              </div>
              {finished && (
                <button
                  onClick={() => {
                    setFinished(false);
                    setFailures([]);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="w-full h-2 bg-secondary rounded overflow-hidden">
              <div
                className="h-full bg-[var(--accent-violet,theme(colors.violet.500))] transition-all"
                style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "0%" }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded border border-border p-2">
                <div className="text-xs text-muted-foreground">Updated</div>
                <div className="text-lg font-semibold text-foreground">{tally.updated}</div>
              </div>
              <div className="rounded border border-border p-2">
                <div className="text-xs text-muted-foreground">Unchanged</div>
                <div className="text-lg font-semibold text-foreground">{tally.unchanged}</div>
              </div>
              <div className="rounded border border-border p-2">
                <div className="text-xs text-muted-foreground">Failed</div>
                <div className="text-lg font-semibold text-foreground">{tally.failed}</div>
              </div>
            </div>

            {failures.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {failures.length} failure{failures.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                  {failures.map((f) => (
                    <li key={f.specId} className="text-muted-foreground">
                      <span className="text-foreground">{f.name}</span> — {f.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {running && (
              <button
                onClick={() => setCancelRequested(true)}
                disabled={cancelRequested}
                className="w-full px-3 py-2 rounded border border-border text-sm text-foreground hover:bg-secondary disabled:opacity-60"
              >
                {cancelRequested ? "Cancelling after current…" : "Cancel"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
