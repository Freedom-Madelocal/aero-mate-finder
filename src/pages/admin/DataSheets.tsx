import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Loader2,
  Plus,
  X,
  ExternalLink,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Sparkles,
} from "lucide-react";
import AdminShell from "@/components/AdminShell";
import {
  startDataSheetCrawl,
  runDataSheetCrawlBatch,
  cancelDataSheetCrawl,
  listDataSheetJobs,
  listDataSheets,
  getDataSheetSignedUrl,
  acceptDataSheetMatch,
  rejectDataSheetMatch,
  deleteDataSheet,
  autoAcceptHighConfidence,
  searchMasterSpecs,
  listVendorsWithCounts,
} from "@/lib/dataSheets.functions";

const VENDOR_SEARCH_TEMPLATES: Record<string, string> = {
  "3M": "https://technicaldatasheets.3m.com/?q={query}",
};

type Job = {
  id: string;
  source_url: string;
  crawl_mode: string;
  status: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  created_at: string;
};

type Sheet = {
  id: string;
  job_id: string | null;
  pdf_url: string | null;
  pdf_path: string | null;
  doc_type: string;
  vendor: string | null;
  product_name: string | null;
  title: string | null;
  match_status: string;
  master_spec_id: string | null;
  confidence: number | null;
  error: string | null;
  created_at: string;
};

export default function DataSheetsAdminPage() {
  const startFn = useServerFn(startDataSheetCrawl);
  const runFn = useServerFn(runDataSheetCrawlBatch);
  const cancelFn = useServerFn(cancelDataSheetCrawl);
  const listJobsFn = useServerFn(listDataSheetJobs);
  const listSheetsFn = useServerFn(listDataSheets);
  const signFn = useServerFn(getDataSheetSignedUrl);
  const acceptFn = useServerFn(acceptDataSheetMatch);
  const rejectFn = useServerFn(rejectDataSheetMatch);
  const deleteFn = useServerFn(deleteDataSheet);
  const autoFn = useServerFn(autoAcceptHighConfidence);
  const searchFn = useServerFn(searchMasterSpecs);

  const [showStart, setShowStart] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [pdfList, setPdfList] = useState("");
  const [maxPages, setMaxPages] = useState(30);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [filter, setFilter] = useState<"all" | "suggested" | "auto" | "unmatched" | "rejected">(
    "all",
  );
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [autoApplying, setAutoApplying] = useState(false);

  const reload = async () => {
    const [j, s] = await Promise.all([
      listJobsFn(),
      listSheetsFn({ data: { jobId: activeJobId ?? undefined } }),
    ]);
    setJobs(j as Job[]);
    setSheets(s as Sheet[]);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId]);

  const runJob = async (jobId: string) => {
    setProgressMsg("Running…");
    let keepGoing = true;
    while (keepGoing) {
      const r = await runFn({ data: { jobId } });
      setProgressMsg(
        `Job ${jobId.slice(0, 8)} — ${r.processed}/${r.total} (✓${r.succeeded} ✗${r.failed}) · last: ${r.currentLabel ?? "—"}`,
      );
      if (r.status !== "running" || r.remaining === 0) keepGoing = false;
      await reload();
    }
    setProgressMsg(null);
  };

  const submitStart = async () => {
    setStartError(null);
    setStarting(true);
    try {
      const pdfUrls = pdfList
        .split(/\s+|,/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//.test(s));
      const r = await startFn({
        data: { sourceUrl: sourceUrl.trim() || undefined, pdfUrls, maxPages },
      });
      setShowStart(false);
      setSourceUrl("");
      setPdfList("");
      await reload();
      if (r.total > 0) runJob(r.jobId);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const filtered = useMemo(() => {
    if (filter === "all") return sheets;
    return sheets.filter((s) => s.match_status === filter);
  }, [filter, sheets]);

  const counts = useMemo(() => {
    const c = { all: sheets.length, auto: 0, suggested: 0, unmatched: 0, rejected: 0 };
    for (const s of sheets) {
      if (s.match_status in c) (c as Record<string, number>)[s.match_status]++;
    }
    return c;
  }, [sheets]);

  return (
    <AdminShell>
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Data Sheet Library</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Crawl manufacturer sites to harvest TDS/PDS PDFs, extract specs, and attach them to master specs.
            </p>
          </div>
          <button
            onClick={() => setShowStart(true)}
            className="inline-flex items-center gap-1.5 bg-foreground text-background rounded px-3 py-1.5 text-sm font-medium hover:bg-foreground/90"
          >
            <Plus className="w-4 h-4" /> Crawl a source
          </button>
        </div>

        {/* Jobs */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">Crawl jobs</h2>
          <div className="border border-border rounded-lg bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Source</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Progress</th>
                  <th className="text-left px-3 py-2 font-medium">Sheets</th>
                  <th className="text-left px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground py-6 text-xs">
                      No crawl jobs yet. Click "Crawl a source" to start.
                    </td>
                  </tr>
                )}
                {jobs.map((j) => (
                  <tr key={j.id} className="border-t border-border">
                    <td className="px-3 py-2 max-w-xs truncate" title={j.source_url}>
                      <span className="text-xs text-muted-foreground mr-1">{j.crawl_mode}</span>
                      {j.source_url}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={j.status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {j.processed}/{j.total}
                      {j.total > 0 && (
                        <span className="ml-2">
                          ✓{j.succeeded} ✗{j.failed}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <button
                        onClick={() => setActiveJobId(j.id)}
                        className="text-[var(--accent-blue)] hover:underline"
                      >
                        View
                      </button>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(j.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {j.status === "running" && (
                        <>
                          <button
                            onClick={() => runJob(j.id)}
                            className="text-xs text-muted-foreground hover:text-foreground mr-2"
                          >
                            Resume
                          </button>
                          <button
                            onClick={async () => {
                              await cancelFn({ data: { jobId: j.id } });
                              reload();
                            }}
                            className="text-xs text-[var(--status-critical)] hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {progressMsg && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {progressMsg}
            </div>
          )}
        </section>

        {/* Sheets */}
        <section>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Discovered sheets {activeJobId && (
                <button
                  onClick={() => setActiveJobId(null)}
                  className="ml-2 text-xs text-muted-foreground hover:text-foreground underline"
                >
                  (clear job filter)
                </button>
              )}
            </h2>
            <div className="flex items-center gap-1 flex-wrap">
              {(["all", "suggested", "auto", "unmatched", "rejected"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-2 py-1 rounded border ${
                    filter === f
                      ? "border-foreground text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f} ({(counts as Record<string, number>)[f] ?? 0})
                </button>
              ))}
              <button
                disabled={autoApplying}
                onClick={async () => {
                  setAutoApplying(true);
                  try {
                    const r = await autoFn({ data: { jobId: activeJobId ?? undefined } });
                    setProgressMsg(`Auto-accepted ${r.applied} high-confidence matches.`);
                    await reload();
                  } finally {
                    setAutoApplying(false);
                  }
                }}
                className="text-xs px-2 py-1 rounded bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Auto-accept high confidence
              </button>
            </div>
          </div>

          <div className="border border-border rounded-lg bg-card divide-y divide-border">
            {filtered.length === 0 && (
              <div className="text-center text-muted-foreground py-10 text-sm">
                No data sheets in this view.
              </div>
            )}
            {filtered.map((s) => (
              <SheetRow
                key={s.id}
                sheet={s}
                onSigned={async () => {
                  const r = await signFn({ data: { sheetId: s.id } });
                  if (r.url) window.open(r.url, "_blank", "noopener");
                }}
                onAccept={async (specId, overwrite) => {
                  await acceptFn({ data: { sheetId: s.id, specId, overwrite } });
                  reload();
                }}
                onReject={async () => {
                  await rejectFn({ data: { sheetId: s.id } });
                  reload();
                }}
                onDelete={async () => {
                  if (!confirm("Delete this data sheet and its PDF?")) return;
                  await deleteFn({ data: { sheetId: s.id } });
                  reload();
                }}
                searchSpecs={async (q) => {
                  const r = await searchFn({ data: { q } });
                  return r as { id: string; vendor: string; product_name: string }[];
                }}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Start modal */}
      {showStart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-lg w-full max-w-lg p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Start a crawl</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Either paste a manufacturer landing/product URL to crawl, or a list of direct PDF URLs.
                </p>
              </div>
              <button
                onClick={() => setShowStart(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Source URL</label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.henkel-adhesives.com/us/en/products/aerospace.html"
                className="w-full mt-1 bg-background border border-border rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Max pages to scrape</label>
              <input
                type="number"
                min={1}
                max={200}
                value={maxPages}
                onChange={(e) => setMaxPages(parseInt(e.target.value || "30", 10))}
                className="w-full mt-1 bg-background border border-border rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">…or paste direct PDF URLs (one per line)</label>
              <textarea
                rows={4}
                value={pdfList}
                onChange={(e) => setPdfList(e.target.value)}
                placeholder={"https://example.com/sheet1.pdf\nhttps://example.com/sheet2.pdf"}
                className="w-full mt-1 bg-background border border-border rounded px-3 py-2 text-sm font-mono"
              />
            </div>

            {startError && (
              <p className="text-xs text-[var(--status-critical)] bg-[var(--status-critical)]/10 rounded p-2">
                {startError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowStart(false)}
                className="flex-1 border border-border rounded px-3 py-2 text-sm hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={submitStart}
                disabled={starting}
                className="flex-1 bg-foreground text-background rounded px-3 py-2 text-sm font-medium hover:bg-foreground/90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Start crawl
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "running"
      ? "var(--accent-blue)"
      : status === "completed"
        ? "var(--status-compliant)"
        : status === "failed"
          ? "var(--status-critical)"
          : "var(--muted-foreground)";
  return (
    <span
      className="inline-flex items-center text-xs px-2 py-0.5 rounded border"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 50%, transparent)` }}
    >
      {status}
    </span>
  );
}

function SheetRow({
  sheet,
  onSigned,
  onAccept,
  onReject,
  onDelete,
  searchSpecs,
}: {
  sheet: Sheet;
  onSigned: () => void;
  onAccept: (specId: string | undefined, overwrite: boolean) => Promise<void>;
  onReject: () => Promise<void>;
  onDelete: () => Promise<void>;
  searchSpecs: (q: string) => Promise<{ id: string; vendor: string; product_name: string }[]>;
}) {
  const [showMatch, setShowMatch] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; vendor: string; product_name: string }[]>(
    [],
  );
  const [overwrite, setOverwrite] = useState(false);

  const doSearch = async (term: string) => {
    setQ(term);
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setResults(await searchSpecs(term));
  };

  const statusIcon =
    sheet.match_status === "auto" || sheet.match_status === "manual" ? (
      <CheckCircle2 className="w-4 h-4 text-[var(--status-compliant)]" />
    ) : sheet.match_status === "suggested" ? (
      <AlertCircle className="w-4 h-4 text-[var(--status-warning)]" />
    ) : sheet.match_status === "rejected" ? (
      <XCircle className="w-4 h-4 text-muted-foreground" />
    ) : (
      <FileText className="w-4 h-4 text-muted-foreground" />
    );

  return (
    <div className="p-3 flex items-start gap-3 hover:bg-secondary/30">
      <div className="pt-0.5">{statusIcon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-secondary">
            {sheet.doc_type}
          </span>
          <span className="text-sm font-medium text-foreground truncate">
            {sheet.product_name || sheet.title || "(no product name)"}
          </span>
          {sheet.vendor && (
            <span className="text-xs text-muted-foreground">· {sheet.vendor}</span>
          )}
          {typeof sheet.confidence === "number" && (
            <span className="text-xs text-muted-foreground">
              · match {(sheet.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
        {sheet.error && (
          <p className="text-xs text-[var(--status-critical)] mt-1">{sheet.error}</p>
        )}
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          {sheet.pdf_path ? (
            <button onClick={onSigned} className="inline-flex items-center gap-1 hover:underline">
              <FileText className="w-3 h-3" /> Open PDF
            </button>
          ) : sheet.pdf_url ? (
            <a
              href={sheet.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Source
            </a>
          ) : null}
          {sheet.master_spec_id && (
            <Link
              to="/admin/master-specs"
              className="text-[var(--accent-blue)] hover:underline"
            >
              spec {sheet.master_spec_id.slice(0, 8)}
            </Link>
          )}
        </div>

        {showMatch && (
          <div className="mt-2 border border-border rounded p-2 bg-background">
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => doSearch(e.target.value)}
                placeholder="Search master specs by vendor or product…"
                className="flex-1 bg-transparent border border-border rounded px-2 py-1 text-xs"
              />
              <label className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                />{" "}
                overwrite
              </label>
            </div>
            <div className="mt-2 max-h-40 overflow-auto">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setShowMatch(false);
                    onAccept(r.id, overwrite);
                  }}
                  className="w-full text-left text-xs px-2 py-1 hover:bg-secondary rounded"
                >
                  <span className="text-muted-foreground">{r.vendor}</span> · {r.product_name}
                </button>
              ))}
              {q.length >= 2 && results.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-1">No matches.</p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {(sheet.match_status === "suggested" || sheet.match_status === "unmatched") && (
          <button
            onClick={() => onAccept(undefined, false)}
            disabled={!sheet.master_spec_id}
            className="text-xs px-2 py-1 rounded bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30"
            title={sheet.master_spec_id ? "Accept suggested match" : "No suggestion — pick manually"}
          >
            Accept
          </button>
        )}
        <button
          onClick={() => setShowMatch((v) => !v)}
          className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary"
        >
          Match…
        </button>
        {sheet.match_status !== "rejected" && (
          <button
            onClick={onReject}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary text-muted-foreground"
          >
            Reject
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-[var(--status-critical)]"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
