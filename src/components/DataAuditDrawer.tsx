import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, ExternalLink, AlertCircle, CheckCircle2, Clock, Pencil } from "lucide-react";
import { getSpecAudit, type SpecAuditPayload } from "@/lib/specAudit.functions";
import { listSpecManualEdits, type ManualEditRow } from "@/lib/specManualReview.functions";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatusPill({ status }: { status: string | null }) {
  const s = (status ?? "").toLowerCase();
  const cls =
    s === "done" || s === "success" || s === "ok"
      ? "border-[var(--status-compliant)]/40 bg-[var(--status-compliant)]/10 text-[var(--status-compliant)]"
      : s === "failed" || s === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : s === "processing" || s === "pending"
      ? "border-[var(--accent-blue)]/40 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
      : s === "skipped_cache" || s === "not_found"
      ? "border-border bg-secondary text-muted-foreground"
      : "border-border bg-secondary text-muted-foreground";
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {status ?? "—"}
    </span>
  );
}

export function DataAuditDrawer({ specId, onClose }: { specId: string; onClose: () => void }) {
  const fetchAudit = useServerFn(getSpecAudit);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["spec-audit", specId],
    queryFn: () => fetchAudit({ data: { specId } }) as Promise<SpecAuditPayload>,
    staleTime: 30_000,
  });

  return (
    <div className="fixed inset-0 z-[60] flex">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-2xl bg-card border-l border-border h-full overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Data Audit</p>
            <h3 className="text-base font-semibold text-foreground">
              {data ? `${data.spec.vendor} · ${data.spec.productName}` : "Loading…"}
            </h3>
            {data?.spec.materialNumber !== null && data?.spec.materialNumber !== undefined && (
              <p className="text-[10px] font-mono uppercase text-muted-foreground/80 mt-0.5">
                Traceium ID {data?.spec.materialNumber}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
            >
              {isFetching ? "…" : "Refresh"}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {isLoading && <p className="text-sm text-muted-foreground">Loading audit trail…</p>}
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>{(error as Error).message}</div>
            </div>
          )}
          {data && <AuditBody data={data} />}
        </div>
      </div>
    </div>
  );
}

function AuditBody({ data }: { data: SpecAuditPayload }) {
  const { spec, upload, scrapeLogs, analysisItems, provenance } = data;
  const fetchEdits = useServerFn(listSpecManualEdits);
  const editsQ = useQuery({
    queryKey: ["spec-manual-edits", spec.id],
    queryFn: () => fetchEdits({ data: { specId: spec.id } }) as Promise<ManualEditRow[]>,
    staleTime: 15_000,
  });

  return (
    <>
      {/* Ingestion */}
      <Section title="Ingestion">
        <Row label="Source Document" value={spec.sourceDocument} mono />
        <Row label="Uploaded From" value={spec.uploadedFrom ?? "Seed dataset"} mono />
        <Row label="First Created" value={fmtDate(spec.createdAt)} />
        <Row label="Last Updated" value={fmtDate(spec.updatedAt)} />
        {upload ? (
          <div className="mt-2 rounded border border-border bg-secondary/30 p-2 text-xs">
            <p className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Upload record</p>
            <p className="font-mono text-foreground truncate">{upload.fileName}</p>
            <p className="text-muted-foreground mt-1">
              {upload.sourceType ?? "upload"} · {upload.rowCount ?? "?"} rows · {fmtDate(upload.uploadedAt)}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            No matching upload record — likely seed data or an ad-hoc insert.
          </p>
        )}
      </Section>

      {/* TDS discovery */}
      <Section title="TDS Discovery">
        <Row label="Status" value={spec.tdsScrapeStatus ?? "—"} />
        <Row label="Scraped At" value={fmtDate(spec.tdsScrapedAt)} />
        <Row label="Source Title" value={spec.tdsSourceTitle} />
        {spec.tdsUrl ? (
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Source URL</span>
            <a
              href={spec.tdsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1 truncate max-w-[16rem]"
            >
              <span className="truncate">{spec.tdsUrl}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        ) : (
          <Row label="Source URL" value={null} />
        )}
        {spec.tdsScrapeError && (
          <div className="rounded border border-destructive/40 bg-destructive/10 text-destructive text-xs p-2 mt-1">
            {spec.tdsScrapeError}
          </div>
        )}
        <Row label="PDF Path" value={spec.tdsPdfPath} mono />
        <Row
          label="PDF Size"
          value={spec.tdsPdfSize != null ? `${(spec.tdsPdfSize / 1024).toFixed(1)} KB` : null}
        />
        <Row label="PDF Downloaded" value={fmtDate(spec.tdsPdfDownloadedAt)} />
      </Section>

      {/* Scrape attempts */}
      <Section title={`Scrape Attempts (${scrapeLogs.length})`}>
        {scrapeLogs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No scrape log entries for this spec.</p>
        ) : (
          <ul className="space-y-2">
            {scrapeLogs.map((l) => (
              <li key={l.id} className="rounded border border-border bg-secondary/20 p-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-foreground uppercase tracking-wider text-[10px]">{l.step}</span>
                  <div className="flex items-center gap-2">
                    <StatusPill status={l.status} />
                    <span className="text-muted-foreground">{fmtDate(l.createdAt)}</span>
                  </div>
                </div>
                {(l.attemptedUrl || l.sourceUrl) && (
                  <a
                    href={l.attemptedUrl ?? l.sourceUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1 break-all"
                  >
                    {l.attemptedUrl ?? l.sourceUrl}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                )}
                {l.httpStatus != null && (
                  <p className="text-muted-foreground">HTTP {l.httpStatus}</p>
                )}
                {l.errorMessage && (
                  <p className="text-destructive">{l.errorMessage}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Analysis runs */}
      <Section title={`AI Extraction Runs (${analysisItems.length})`}>
        {analysisItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">No analysis runs recorded.</p>
        ) : (
          <ul className="space-y-2">
            {analysisItems.map((it) => (
              <li key={it.id} className="rounded border border-border bg-secondary/20 p-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {it.status === "done" ? (
                      <CheckCircle2 className="w-3 h-3 text-[var(--status-compliant)]" />
                    ) : it.status === "failed" ? (
                      <AlertCircle className="w-3 h-3 text-destructive" />
                    ) : (
                      <Clock className="w-3 h-3 text-muted-foreground" />
                    )}
                    <StatusPill status={it.status} />
                    <span className="text-muted-foreground">
                      attempt {it.attempts}
                      {it.maxAttempts ? `/${it.maxAttempts}` : ""}
                    </span>
                  </div>
                  <span className="text-muted-foreground">{fmtDate(it.updatedAt)}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  {it.model && <span>model: <span className="font-mono text-foreground">{it.model}</span></span>}
                  {it.promptVersion && <span>prompt: <span className="font-mono text-foreground">{it.promptVersion}</span></span>}
                  {it.latencyMs != null && <span>{it.latencyMs} ms</span>}
                  {it.inputTokens != null && <span>in: {it.inputTokens}</span>}
                  {it.outputTokens != null && <span>out: {it.outputTokens}</span>}
                  {it.costUsd != null && <span>${it.costUsd.toFixed(4)}</span>}
                </div>
                {it.updatedFields && it.updatedFields.length > 0 && (
                  <p className="text-muted-foreground">
                    Updated: <span className="font-mono text-foreground">{it.updatedFields.join(", ")}</span>
                  </p>
                )}
                {it.error && (
                  <p className="text-destructive">
                    {it.errorClass ? `[${it.errorClass}] ` : ""}
                    {it.error}
                  </p>
                )}
                {it.nextAttemptAt && it.status !== "done" && (
                  <p className="text-muted-foreground">Next retry: {fmtDate(it.nextAttemptAt)}</p>

                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Field provenance summary */}
      <Section title={`Field Provenance (${provenance.length})`}>
        {provenance.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No field-level provenance yet. Values with an ⓘ badge in the detail view have full source citations.
          </p>
        ) : (
          <ul className="space-y-2">
            {provenance.map((p, idx) => (
              <li key={`${p.field}-${idx}`} className="rounded border border-border bg-secondary/20 p-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-foreground">{p.field}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {p.confidence != null && <span>conf {(p.confidence * 100).toFixed(0)}%</span>}
                    {p.sourcePage != null && <span>p. {p.sourcePage}</span>}
                  </div>
                </div>
                <p className="text-foreground">
                  {p.valueText ??
                    (p.valueNum != null ? `${p.valueNum}${p.unit ? ` ${p.unit}` : ""}` : null) ??
                    (p.valueBool != null ? String(p.valueBool) : "—")}
                </p>
                {p.sourceQuote && (
                  <p className="text-muted-foreground italic border-l-2 border-border pl-2">"{p.sourceQuote}"</p>
                )}
                <p className="text-muted-foreground text-[10px]">
                  {p.model ?? "?"} · {p.promptVersion ?? "?"} · {fmtDate(p.extractedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Manual edits */}
      <Section title={`Manual Edits (${editsQ.data?.length ?? 0})`}>
        {editsQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading manual edit log…</p>
        ) : !editsQ.data || editsQ.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">No manual edits recorded for this spec.</p>
        ) : (
          <ul className="space-y-2">
            {editsQ.data.map((e) => (
              <li key={e.id} className="rounded border border-border bg-secondary/20 p-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Pencil className="w-3 h-3 text-[var(--accent-blue)]" />
                    <span className="font-mono text-foreground">{e.field}</span>
                  </div>
                  <span className="text-muted-foreground">{fmtDate(e.created_at)}</span>
                </div>
                <p className="text-muted-foreground">
                  <span className="line-through">{String(e.old_value ?? "—")}</span>
                  {" → "}
                  <span className="text-foreground">{String(e.new_value ?? "—")}</span>
                </p>
                <p className="text-muted-foreground text-[10px]">
                  by {e.edited_by_email ?? e.edited_by ?? "unknown"}
                  {e.note && <> · "{e.note}"</>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right text-foreground ${mono ? "font-mono text-xs truncate max-w-[18rem]" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}
