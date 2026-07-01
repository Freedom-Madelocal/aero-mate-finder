import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listScrapeLogs, type ScrapeLogRow } from "@/lib/specScrape.functions";
import { RefreshCw } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  success: "text-green-400",
  info: "text-blue-400",
  not_found: "text-yellow-400",
  failed: "text-red-400",
  skipped: "text-muted-foreground",
};

const STEPS = ["", "orchestrate", "search", "scrape", "download_pdf", "extract", "match", "apply"] as const;
const STATUSES = ["", "success", "info", "not_found", "failed", "skipped"] as const;

export default function ScrapeLogsPage() {
  const fetchLogs = useServerFn(listScrapeLogs);
  const [rows, setRows] = useState<ScrapeLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [specId, setSpecId] = useState("");
  const [status, setStatus] = useState<string>("");
  const [step, setStep] = useState<string>("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const data = await fetchLogs({
        data: {
          specId: specId.trim() || undefined,
          status: status || undefined,
          step: step || undefined,
          limit: 300,
        },
      });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const s = { success: 0, info: 0, not_found: 0, failed: 0, skipped: 0 } as Record<string, number>;
    for (const r of rows) s[r.status] = (s[r.status] ?? 0) + 1;
    return s;
  }, [rows]);

  return (
    <AdminShell>
      <div className="max-w-7xl mx-auto p-6 sm:p-10 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Scrape Logs</h1>
            <p className="text-sm text-muted-foreground">
              Every step of every TDS/PDS scrape attempt. Use this to understand why a spec was marked{" "}
              <span className="text-yellow-400">not_found</span> or <span className="text-red-400">failed</span>.
            </p>
          </div>
          <Button onClick={load} disabled={loading} size="sm" variant="outline">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 items-center border border-border rounded-md p-3 bg-card">
          <Input
            placeholder="Filter by master_spec_id (UUID)"
            value={specId}
            onChange={(e) => setSpecId(e.target.value)}
            className="w-[320px] h-8 text-xs font-mono"
          />
          <select
            value={step}
            onChange={(e) => setStep(e.target.value)}
            className="h-8 text-xs bg-background border border-border rounded px-2"
          >
            {STEPS.map((s) => (
              <option key={s} value={s}>{s || "any step"}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-8 text-xs bg-background border border-border rounded px-2"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s || "any status"}</option>
            ))}
          </select>
          <Button onClick={load} size="sm" className="h-8">Apply</Button>
          <div className="ml-auto flex gap-3 text-xs text-muted-foreground">
            {Object.entries(stats).map(([k, v]) =>
              v ? (
                <span key={k}>
                  <span className={STATUS_COLORS[k]}>{k}</span>: {v}
                </span>
              ) : null,
            )}
            <span>total: {rows.length}</span>
          </div>
        </div>

        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-medium w-[140px]">Time</th>
                <th className="text-left p-2 font-medium w-[100px]">Step</th>
                <th className="text-left p-2 font-medium w-[90px]">Status</th>
                <th className="text-left p-2 font-medium">Vendor / Product</th>
                <th className="text-left p-2 font-medium">URL attempted</th>
                <th className="text-left p-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No logs match these filters.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isOpen = !!expanded[r.id];
                return (
                  <>
                    <tr
                      key={r.id}
                      className="border-t border-border cursor-pointer hover:bg-muted/30"
                      onClick={() => setExpanded((e) => ({ ...e, [r.id]: !isOpen }))}
                    >
                      <td className="p-2 whitespace-nowrap text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="p-2 font-mono">{r.step}</td>
                      <td className={`p-2 font-medium ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</td>
                      <td className="p-2">
                        <div className="truncate max-w-[240px]">
                          <span className="text-foreground">{r.vendor ?? "—"}</span>
                          <span className="text-muted-foreground"> / {r.product_name ?? "—"}</span>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="truncate max-w-[320px] font-mono text-[11px] text-muted-foreground">
                          {r.attempted_url ?? r.source_url ?? "—"}
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="truncate max-w-[380px]">{r.error_message ?? "—"}</div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={r.id + "-x"} className="bg-muted/20 border-t border-border">
                        <td colSpan={6} className="p-3">
                          <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                            <Field label="master_spec_id" value={r.master_spec_id} />
                            <Field label="child_job_id" value={r.child_job_id} />
                            <Field label="bulk_job_id" value={r.bulk_job_id} />
                            <Field label="data_sheet_id" value={r.data_sheet_id} />
                            <Field label="source_url" value={r.source_url} full />
                            <Field label="attempted_url" value={r.attempted_url} full />
                            <Field label="http_status" value={r.http_status?.toString() ?? null} />
                            <Field label="error_message" value={r.error_message} full />
                            {r.details && (
                              <div className="col-span-2">
                                <div className="text-muted-foreground mb-1">details</div>
                                <pre className="whitespace-pre-wrap break-all bg-background border border-border rounded p-2">
                                  {tryPretty(r.details)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}

function Field({ label, value, full }: { label: string; value: string | null; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-muted-foreground">{label}</div>
      <div className="break-all">{value ?? "—"}</div>
    </div>
  );
}

function tryPretty(s: string | null): string {
  if (!s) return "";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
