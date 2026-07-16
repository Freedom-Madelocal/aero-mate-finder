import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getBatchHealth,
  type BatchHealth,
} from "@/lib/specTdsAnalyze.functions";
import {
  batchDryRun,
  cancelBatchAdmin,
  exportFailureAudit,
  listBatchItems,
  pauseBatch,
  recoverExpiredLeases,
  requeueTransientFailures,
  resumeBatch,
} from "@/lib/tdsAdmin.functions";

/**
 * Super-admin TDS batch console. Enter a batch id to inspect health, walk
 * items with filters/pagination, take confirmed pause/resume/cancel actions,
 * run selective transient requeue and expired-lease recovery, view an
 * incident dry-run, and export a redacted failure CSV.
 *
 * No "retry everything", no history erase, no auto-restart.
 */

type Item = Awaited<ReturnType<typeof listBatchItems>>["items"][number];

const STATUSES = ["pending", "processing", "failed", "done", "skipped_cache", "cancelled"];

export default function AdminTdsBatches() {
  const [batchId, setBatchId] = useState("");
  const [health, setHealth] = useState<BatchHealth | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [errorCodeFilter, setErrorCodeFilter] = useState("");
  const [dryRun, setDryRun] = useState<Awaited<ReturnType<typeof batchDryRun>> | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshHealth = useCallback(async () => {
    if (!batchId) return;
    try {
      const h = await getBatchHealth({ data: { batchId } });
      setHealth(h);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load batch health");
    }
  }, [batchId]);

  const refreshItems = useCallback(
    async (reset = true) => {
      if (!batchId) return;
      setLoading(true);
      try {
        const res = await listBatchItems({
          data: {
            batchId,
            status: statusFilter.length ? statusFilter : undefined,
            errorCode: errorCodeFilter || undefined,
            limit: 50,
            cursor: reset ? null : cursor,
          },
        });
        setItems(reset ? res.items : [...items, ...res.items]);
        setNextCursor(res.nextCursor);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load items");
      } finally {
        setLoading(false);
      }
    },
    [batchId, statusFilter, errorCodeFilter, cursor, items],
  );

  // Poll health every 10s while a batch id is loaded.
  useEffect(() => {
    if (!batchId) return;
    void refreshHealth();
    const id = setInterval(refreshHealth, 10000);
    return () => clearInterval(id);
  }, [batchId, refreshHealth]);

  const confirmed = (msg: string) => window.confirm(msg);

  const errorCodes = useMemo(() => Object.keys(health?.errors ?? {}), [health]);

  const actionRunning = health?.batch?.status === "running";
  const actionPaused = health?.batch?.status?.startsWith("paused");

  const doPause = async () => {
    if (!confirmed("Pause this batch? The worker will stop claiming its items.")) return;
    await pauseBatch({ data: { batchId } });
    toast.success("Batch paused");
    await refreshHealth();
  };
  const doResume = async () => {
    if (!confirmed("Resume this batch?")) return;
    await resumeBatch({ data: { batchId } });
    toast.success("Batch resumed");
    await refreshHealth();
  };
  const doCancel = async () => {
    if (!confirmed("Cancel this batch? Pending items become cancelled. History is preserved.")) return;
    await cancelBatchAdmin({ data: { batchId } });
    toast.success("Batch cancelled");
    await refreshHealth();
  };
  const doRecoverLeases = async () => {
    const res = await recoverExpiredLeases({ data: { batchId } });
    toast.success(`Recovered ${res.recovered} expired lease(s)`);
    await refreshHealth();
    await refreshItems();
  };
  const doRequeue = async () => {
    const codes = window.prompt(
      "Comma-separated error codes to requeue (transient only):",
      errorCodes.join(","),
    );
    if (!codes) return;
    const list = codes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    const res = await requeueTransientFailures({
      data: { batchId, errorCodes: list, maxItems: 100 },
    });
    toast.success(`Requeued ${res.requeued} item(s)`);
    await refreshHealth();
    await refreshItems();
  };
  const doDryRun = async () => {
    const r = await batchDryRun({ data: { batchId } });
    setDryRun(r);
  };
  const doExport = async () => {
    const { rows } = await exportFailureAudit({ data: { batchId } });
    if (rows.length === 0) {
      toast.info("No failures to export");
      return;
    }
    const cols = Object.keys(rows[0] as object);
    const csv = [
      cols.join(","),
      ...rows.map((r) =>
        cols
          .map((c) => {
            const v = (r as Record<string, unknown>)[c];
            const s = v == null ? "" : String(v).replace(/"/g, '""');
            return `"${s}"`;
          })
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tds-batch-${batchId}-failures.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">TDS Batch Console</h1>
        <p className="text-sm text-muted-foreground">
          Super-admin recovery view. All actions are audited.
        </p>
      </header>

      <div className="flex gap-2">
        <input
          value={batchId}
          onChange={(e) => setBatchId(e.target.value.trim())}
          placeholder="Batch UUID"
          className="flex-1 px-3 py-2 rounded bg-background border border-border font-mono text-sm"
        />
        <button
          onClick={() => {
            setCursor(null);
            void refreshItems(true);
            void refreshHealth();
          }}
          disabled={!batchId}
          className="px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50 text-sm"
        >
          Load
        </button>
      </div>

      {health?.batch && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Status" value={health.batch.status} />
          <Stat label="Total" value={String(health.batch.total)} />
          <Stat label="Terminal" value={String(health.batch.terminal_count)} />
          <Stat
            label="ETA"
            value={health.eta_seconds ? `${Math.round(health.eta_seconds / 60)}m` : "—"}
          />
          <Stat label="p50 latency" value={`${health.latency_ms.p50}ms`} />
          <Stat label="p95 latency" value={`${health.latency_ms.p95}ms`} />
          <Stat label="Cache hits" value={String(health.cache_hits)} />
          <Stat label="Est cost" value={`$${(health.estimated_cost_usd ?? 0).toFixed(4)}`} />
          {Object.entries(health.counts).map(([k, v]) => (
            <Stat key={k} label={k} value={String(v)} />
          ))}
          {health.batch.paused_reason && (
            <div className="col-span-full text-amber-500 text-sm">
              Paused: {health.batch.paused_reason}
            </div>
          )}
        </section>
      )}

      {health?.batch && (
        <section className="flex flex-wrap gap-2">
          {!actionPaused && actionRunning && (
            <button onClick={doPause} className="px-3 py-1.5 rounded bg-amber-500/20 text-amber-300 text-sm">
              Pause
            </button>
          )}
          {actionPaused && (
            <button onClick={doResume} className="px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-300 text-sm">
              Resume
            </button>
          )}
          {(actionRunning || actionPaused) && (
            <button onClick={doCancel} className="px-3 py-1.5 rounded bg-red-500/20 text-red-300 text-sm">
              Cancel
            </button>
          )}
          <button onClick={doDryRun} className="px-3 py-1.5 rounded bg-muted text-foreground text-sm">
            Incident dry-run
          </button>
          <button onClick={doRequeue} className="px-3 py-1.5 rounded bg-muted text-foreground text-sm">
            Selective requeue
          </button>
          <button onClick={doRecoverLeases} className="px-3 py-1.5 rounded bg-muted text-foreground text-sm">
            Recover expired leases
          </button>
          <button onClick={doExport} className="px-3 py-1.5 rounded bg-muted text-foreground text-sm">
            Export failures CSV
          </button>
        </section>
      )}

      {dryRun && (
        <section className="p-4 border border-border rounded bg-muted/30 text-sm space-y-2">
          <h2 className="font-semibold">Dry-run report (read-only)</h2>
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <li>Permanent failures: {dryRun.permanentFailures}</li>
            <li>Transient retryable: {dryRun.transientRetryable}</li>
            <li>Expired leases: {dryRun.expiredLeases}</li>
            <li>Never attempted: {dryRun.neverAttempted}</li>
            <li>Cache opportunities: {dryRun.cacheOpportunities}</li>
            <li>Est calls if acted: {dryRun.estimatedCallsIfActed}</li>
          </ul>
          <div>
            Admission: <span className={dryRun.admission.allowed ? "text-emerald-400" : "text-amber-400"}>{dryRun.admission.reason}</span>
          </div>
          {dryRun.activeCooldowns.length > 0 && (
            <div>Active cooldowns: {dryRun.activeCooldowns.map((c) => c.model).join(", ")}</div>
          )}
          <div className="text-xs text-muted-foreground">
            Disallowed: {dryRun.disallowedActions.join(", ")}
          </div>
        </section>
      )}

      {batchId && (
        <section className="space-y-2">
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span className="text-muted-foreground">Filter status:</span>
            {STATUSES.map((s) => (
              <label key={s} className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={statusFilter.includes(s)}
                  onChange={(e) => {
                    setStatusFilter((prev) =>
                      e.target.checked ? [...prev, s] : prev.filter((x) => x !== s),
                    );
                  }}
                />
                {s}
              </label>
            ))}
            <input
              value={errorCodeFilter}
              onChange={(e) => setErrorCodeFilter(e.target.value)}
              placeholder="error_code"
              className="px-2 py-1 rounded bg-background border border-border"
            />
            <button
              onClick={() => {
                setCursor(null);
                void refreshItems(true);
              }}
              className="px-2 py-1 rounded bg-muted"
            >
              Apply
            </button>
          </div>
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-2">Status</th>
                  <th className="p-2">Attempts</th>
                  <th className="p-2">Error code</th>
                  <th className="p-2">Class</th>
                  <th className="p-2">Model</th>
                  <th className="p-2">Latency</th>
                  <th className="p-2">Next retry</th>
                  <th className="p-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="p-2">{it.status}</td>
                    <td className="p-2">
                      {it.attempts}/{it.max_attempts}
                    </td>
                    <td className="p-2 font-mono">{it.error_code ?? "—"}</td>
                    <td className="p-2">{it.error_class ?? "—"}</td>
                    <td className="p-2">{it.model ?? "—"}</td>
                    <td className="p-2">{it.latency_ms != null ? `${it.latency_ms}ms` : "—"}</td>
                    <td className="p-2">
                      {it.next_attempt_at
                        ? new Date(it.next_attempt_at).toLocaleTimeString()
                        : "—"}
                    </td>
                    <td className="p-2">{new Date(it.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
                {items.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-muted-foreground">
                      No items match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {nextCursor && (
            <button
              onClick={() => {
                setCursor(nextCursor);
                void refreshItems(false);
              }}
              className="text-xs px-2 py-1 rounded bg-muted"
            >
              Load more
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded bg-muted/30 border border-border">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-mono">{value}</div>
    </div>
  );
}
