import { useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type State = { path: string | null };
let _state: State = { path: null };
const _listeners = new Set<() => void>();
function notify() { _listeners.forEach((fn) => fn()); }

export function openTdsPdf(path: string) {
  _state = { path };
  notify();
}
export function closeTdsPdf() {
  _state = { path: null };
  notify();
}

export function TdsPdfViewer() {
  const [state, setState] = useState<State>(_state);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const l = () => setState({ ..._state });
    _listeners.add(l);
    return () => { _listeners.delete(l); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!state.path) { setUrl(null); return; }
    setLoading(true);
    setUrl(null);
    (async () => {
      try {
        const { getTdsDownloadUrl } = await import("@/lib/tdsUpload.functions");
        const res = await getTdsDownloadUrl({ data: { path: state.path! } });
        if (cancelled) return;
        setUrl(res.url);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to open TDS");
          closeTdsPdf();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [state.path]);

  const open = state.path !== null;
  const fileName = state.path ? state.path.split("/").pop() ?? "TDS PDF" : "TDS PDF";

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) closeTdsPdf(); }}>
      <SheetContent
        side="left"
        className="p-0 w-[92vw] sm:w-[80vw] md:w-[70vw] lg:w-[60vw] xl:w-[55vw] max-w-none flex flex-col gap-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Technical Data Sheet</p>
            <p className="text-xs font-mono truncate text-foreground">{fileName}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { if (!url) e.preventDefault(); }}
              aria-disabled={!url}
              title="Open in new tab"
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted/50 transition-colors ${!url ? "opacity-50 pointer-events-none" : ""}`}
            >
              <ExternalLink className="w-3.5 h-3.5" /> New tab
            </a>
            <button
              onClick={closeTdsPdf}
              title="Close"
              className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-secondary/20 relative">
          {loading || !url ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading PDF…
            </div>
          ) : (
            <iframe
              src={url}
              title={fileName}
              className="w-full h-full border-0"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
