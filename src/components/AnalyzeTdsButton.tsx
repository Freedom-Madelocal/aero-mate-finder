import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { analyzeSpecTds } from "@/lib/specTdsAnalyze.functions";
import { refreshMasterSpecStore } from "@/data/masterSpecs";

export function AnalyzeTdsButton({ specId }: { specId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await analyzeSpecTds({ data: { specId } });
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
          <Sparkles className="w-3 h-3" /> Analyze TDS
        </>
      )}
    </button>
  );
}
