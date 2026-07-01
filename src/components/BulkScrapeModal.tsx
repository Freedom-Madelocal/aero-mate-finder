import { useState } from "react";
import { Loader2, X, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  startBulkScrape,
  runBulkScrapeBatch,
  cancelBulkScrape,
} from "@/lib/specScrape.functions";
import { useServerFn } from "@tanstack/react-start";
import { refreshMasterSpecStore } from "@/data/masterSpecs";

interface Progress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  currentLabel: string | null;
  status: string;
}

export default function BulkScrapeModal({ onClose }: { onClose: () => void }) {
  const start = useServerFn(startBulkScrape);
  const runBatch = useServerFn(runBulkScrapeBatch);
  const cancel = useServerFn(cancelBulkScrape);

  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const begin = async () => {
    setError(null);
    setRunning(true);
    try {
      const { jobId: id, total, status } = await start();
      setJobId(id);
      setProgress({
        total,
        processed: 0,
        succeeded: 0,
        failed: 0,
        remaining: total,
        currentLabel: null,
        status,
      });
      if (total === 0) {
        setRunning(false);
        return;
      }
      // Loop
      let currentJobId = id;
      let keepGoing = true;
      while (keepGoing) {
        const r = await runBatch({ data: { jobId: currentJobId } });
        setProgress({
          total: r.total,
          processed: r.processed,
          succeeded: r.succeeded,
          failed: r.failed,
          remaining: r.remaining,
          currentLabel: r.currentLabel,
          status: r.status,
        });
        if (r.status !== "running" || r.remaining === 0) keepGoing = false;
      }
      await refreshMasterSpecStore();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const doCancel = async () => {
    if (!jobId) return;
    setCancelling(true);
    try {
      await cancel({ data: { jobId } });
    } finally {
      setCancelling(false);
    }
  };

  const percent =
    progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-lg w-full max-w-lg p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Scrape TDS / PDS</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Crawls curated TDS/PDS pages for <strong>Hexcel, 3M, Toray, Syensqo, and Henkel</strong> (matweb + manufacturer sites), downloads each PDF, and auto-links to the matching master spec. Items with a stored PDF or from unsupported vendors are skipped.
            </p>


          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!progress && !running && (
          <button
            onClick={begin}
            className="w-full bg-foreground text-background rounded px-4 py-2 text-sm font-medium hover:bg-foreground/90"
          >
            Start scrape for unscraped specs
          </button>
        )}

        {progress && (
          <div className="space-y-3">
            <div className="text-sm text-foreground">
              {progress.total === 0 ? (
                <p className="text-muted-foreground">All specs already scraped. Use the per-item rescrape from the spec details panel to refresh one.</p>
              ) : (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{progress.processed} / {progress.total} processed</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded overflow-hidden">
                    <div
                      className="h-full bg-foreground transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </>
              )}
            </div>
            {progress.currentLabel && running && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Last batch: {progress.currentLabel}</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-secondary/40 rounded px-2 py-1.5">
                <div className="text-muted-foreground">Succeeded</div>
                <div className="text-foreground font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-compliant)]" />
                  {progress.succeeded}
                </div>
              </div>
              <div className="bg-secondary/40 rounded px-2 py-1.5">
                <div className="text-muted-foreground">Failed / Not found</div>
                <div className="text-foreground font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-[var(--status-warning)]" />
                  {progress.failed}
                </div>
              </div>
              <div className="bg-secondary/40 rounded px-2 py-1.5">
                <div className="text-muted-foreground">Remaining</div>
                <div className="text-foreground font-medium">{progress.remaining}</div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              {running && progress.remaining > 0 && (
                <button
                  onClick={doCancel}
                  disabled={cancelling}
                  className="flex-1 border border-border rounded px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
                >
                  {cancelling ? "Cancelling…" : "Cancel"}
                </button>
              )}
              <button
                onClick={onClose}
                className="flex-1 border border-border rounded px-3 py-1.5 text-sm hover:bg-secondary"
              >
                {running ? "Close (keeps running)" : "Done"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-[var(--status-critical)] bg-[var(--status-critical)]/10 rounded p-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
