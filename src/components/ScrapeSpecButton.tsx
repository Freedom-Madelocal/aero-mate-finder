import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
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

  const run = async () => {
    setBusy(true);
    const toastId = toast.loading("Scraping TDS…");
    try {
      const res = await fn({ data: { specId, force: alreadyScraped } });
      await refreshMasterSpecStore();
      const status = res?.status as string | undefined;
      const url = (res?.url as string | null | undefined) ?? null;
      const sourceTitle = (res?.sourceTitle as string | null | undefined) ?? null;

      if (status === "success") {
        toast.success("Found TDS", {
          id: toastId,
          description: sourceTitle ?? url ?? undefined,
          action: url
            ? {
                label: "Open",
                onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
              }
            : undefined,
        });
      } else if (status === "not_found") {
        toast.warning("No TDS found for this product", { id: toastId });
      } else if (status === "failed") {
        toast.error("Scrape failed", {
          id: toastId,
          description: (res as { error?: string })?.error,
        });
      } else {
        toast.dismiss(toastId);
      }
      onDone?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error("Scrape failed", { id: toastId, description: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-border hover:bg-secondary disabled:opacity-50"
      title={alreadyScraped ? "Re-scrape TDS (overwrites existing fields)" : "Scrape TDS from manufacturer site"}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
      {alreadyScraped ? "Rescrape TDS" : "Scrape TDS"}
    </button>
  );
}
