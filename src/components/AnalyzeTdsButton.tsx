import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { analyzeSpecTds } from "@/lib/specTdsAnalyze.functions";
import { refreshMasterSpecStore } from "@/data/masterSpecs";

/**
 * Run the AI TDS analysis for one spec. Shared by the single-row button
 * and the bulk runner on /master-specs. Throws on failure — callers decide
 * whether to toast or aggregate.
 */
export async function runAnalyzeSpecTds(specId: string) {
  return analyzeSpecTds({ data: { specId } });
}

export function AnalyzeTdsButton({
  specId,
  analyzedAt,
}: {
  specId: string;
  analyzedAt?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await runAnalyzeSpecTds(specId);
            if (res.updatedCount === 0) {
              toast.info("TDS analyzed — no new fields to update.");
            } else {
              toast.success(`Updated ${res.updatedCount} field${res.updatedCount === 1 ? "" : "s"} from TDS.`);
            }
            await refreshMasterSpecStore();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to analyze TDS");
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-1 text-xs bg-[var(--accent-violet,theme(colors.violet.500))]/15 text-[var(--accent-violet,theme(colors.violet.400))] hover:bg-[var(--accent-violet,theme(colors.violet.500))]/25 px-2 py-1 rounded disabled:opacity-60 disabled:cursor-not-allowed"
        title="Use AI to read the PDF and fill in this material's spec details"
      >
        {busy ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" /> Analyzing…
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3" /> {analyzedAt ? "Re-analyze TDS" : "Analyze TDS"}
          </>
        )}
      </button>
      {analyzedAt && !busy && (
        <span className="text-[10px] text-muted-foreground">
          Analyzed {new Date(analyzedAt).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}
