import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { scrapeSpec } from "@/lib/specScrape.functions";
import { useServerFn } from "@tanstack/react-start";
import { refreshMasterSpecStore } from "@/data/masterSpecs";

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

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      await fn({ data: { specId, force: alreadyScraped } });
      await refreshMasterSpecStore();
      onDone?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
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
      {err && <span className="text-[10px] text-[var(--status-critical)] max-w-xs text-right">{err}</span>}
    </div>
  );
}
