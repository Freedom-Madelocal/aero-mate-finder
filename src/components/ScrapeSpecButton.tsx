import { useEffect, useState } from "react";
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { scrapeSpec } from "@/lib/specScrape.functions";
import { useServerFn } from "@tanstack/react-start";
import { refreshMasterSpecStore } from "@/data/masterSpecs";

type Status = "success" | "not_found" | "failed";

export default function ScrapeSpecButton({
  specId,
  alreadyScraped,
  onDone,
}: {
  specId: string;
  alreadyScraped: boolean;
  onDone?: () => void;
}) {
  const fn = useServerFn(scrapeSpec);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (status !== "success") return;
    const t = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(t);
  }, [status]);

  const run = async () => {
    setBusy(true);
    setErr(null);
    setStatus(null);
    try {
      const res = await fn({ data: { specId, force: alreadyScraped } });
      await refreshMasterSpecStore();
      setStatus((res?.status as Status) ?? null);
      onDone?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
      setStatus("failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-border hover:bg-secondary disabled:opacity-50"
        title={alreadyScraped ? "Re-scrape TDS (overwrites existing fields)" : "Scrape TDS from manufacturer site"}
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {alreadyScraped ? "Rescrape TDS" : "Scrape TDS"}
      </button>
      {status === "success" && (
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--status-compliant)]">
          <CheckCircle2 className="w-3 h-3" /> Found TDS
        </span>
      )}
      {status === "not_found" && (
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--status-warning)]">
          <AlertCircle className="w-3 h-3" /> No TDS found
        </span>
      )}
      {err && <span className="text-[10px] text-[var(--status-critical)] max-w-xs text-right">{err}</span>}
    </div>
  );
}
