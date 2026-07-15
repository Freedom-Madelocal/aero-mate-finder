import { useEffect, useState } from "react";
import { Info, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getSpecProvenance, reanalyzeSpecField } from "@/lib/tdsProvenance.functions";
import { toast } from "sonner";

export type ProvenanceRecord = {
  field: string;
  value_text: string | null;
  value_num: number | null;
  value_bool: boolean | null;
  unit: string | null;
  source_page: number | null;
  source_quote: string | null;
  confidence: "high" | "medium" | "low" | null;
  model: string | null;
  prompt_version: string | null;
  extracted_at: string;
};

const cache = new Map<string, ProvenanceRecord[]>();
const listeners = new Map<string, Set<() => void>>();

function notify(specId: string) {
  listeners.get(specId)?.forEach((l) => l());
}

export function useSpecProvenance(specId: string | undefined) {
  const [records, setRecords] = useState<ProvenanceRecord[] | null>(
    specId ? cache.get(specId) ?? null : null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!specId) return;
    const listener = () => setRecords(cache.get(specId) ?? null);
    if (!listeners.has(specId)) listeners.set(specId, new Set());
    listeners.get(specId)!.add(listener);
    return () => {
      listeners.get(specId)?.delete(listener);
    };
  }, [specId]);

  async function load() {
    if (!specId || cache.has(specId)) return;
    setLoading(true);
    try {
      const res = (await getSpecProvenance({ data: { specId } })) as ProvenanceRecord[];
      cache.set(specId, res);
      notify(specId);
    } catch (err) {
      console.error("[provenance] load", err);
    } finally {
      setLoading(false);
    }
  }

  return { records, loading, load, invalidate: () => specId && cache.delete(specId) };
}

export function SpecValueProvenance({
  specId,
  field,
  isSuperAdmin,
  onOpenPdf,
  onReanalyzed,
}: {
  specId: string;
  field: string;
  isSuperAdmin?: boolean;
  onOpenPdf?: (page: number | null) => void;
  onReanalyzed?: () => void;
}) {
  const { records, loading, load } = useSpecProvenance(specId);
  const [busy, setBusy] = useState(false);

  const rec = records?.find((r) => r.field === field);
  const staleDays = rec ? (Date.now() - new Date(rec.extracted_at).getTime()) / 86400000 : 0;

  async function onReanalyze() {
    setBusy(true);
    try {
      await reanalyzeSpecField({ data: { specId, field } });
      cache.delete(specId);
      notify(specId);
      toast.success("Field re-analyzed");
      onReanalyzed?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-analyze failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover onOpenChange={(open) => open && load()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center text-muted-foreground hover:text-foreground align-middle ml-1"
          aria-label="Source provenance"
        >
          <Info className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs space-y-2" side="top">
        {loading && !records && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading…
          </div>
        )}
        {records && !rec && (
          <div className="text-muted-foreground">No AI provenance recorded for this field.</div>
        )}
        {rec && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <ConfidenceChip conf={rec.confidence} />
              {staleDays > 90 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px]">
                  Stale ({Math.round(staleDays)}d)
                </span>
              )}
              {rec.source_page != null && (
                <span className="text-muted-foreground">Page {rec.source_page}</span>
              )}
            </div>
            {rec.source_quote && (
              <blockquote className="border-l-2 border-border pl-2 italic text-foreground">
                "{rec.source_quote}"
              </blockquote>
            )}
            <div className="text-muted-foreground">
              {rec.model} · {rec.prompt_version} · {new Date(rec.extracted_at).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-2 pt-1">
              {onOpenPdf && (
                <button
                  onClick={() => onOpenPdf(rec.source_page)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-secondary"
                >
                  <ExternalLink className="w-3 h-3" /> Open TDS
                </button>
              )}
              {isSuperAdmin && (
                <button
                  disabled={busy}
                  onClick={onReanalyze}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-secondary disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Re-analyze
                </button>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ConfidenceChip({ conf }: { conf: "high" | "medium" | "low" | null }) {
  const cls =
    conf === "high"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : conf === "low"
        ? "bg-red-500/15 text-red-700 dark:text-red-300"
        : "bg-muted text-muted-foreground";
  return <span className={`px-1.5 py-0.5 rounded text-[10px] ${cls}`}>{conf ?? "unknown"} confidence</span>;
}
