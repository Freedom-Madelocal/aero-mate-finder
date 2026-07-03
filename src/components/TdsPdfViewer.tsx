import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileText, Loader2, RefreshCw, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const DRAWER_WIDTH_KEY = "tds-drawer-width";
const DEFAULT_WIDTH_VW = 60;
const MIN_WIDTH_VW = 30;
const MAX_WIDTH_VW = 95;

function clampWidth(v: number) {
  return Math.min(MAX_WIDTH_VW, Math.max(MIN_WIDTH_VW, v));
}
function loadInitialWidth() {
  if (typeof window === "undefined") return DEFAULT_WIDTH_VW;
  const raw = window.localStorage.getItem(DRAWER_WIDTH_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? clampWidth(n) : DEFAULT_WIDTH_VW;
}

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

type Status = "idle" | "signing" | "loading" | "ready" | "error";

export function TdsPdfViewer() {
  const [state, setState] = useState<State>(_state);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const l = () => setState({ ..._state });
    _listeners.add(l);
    return () => { _listeners.delete(l); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!state.path) {
      setUrl(null);
      setStatus("idle");
      setError(null);
      return;
    }
    setStatus("signing");
    setError(null);
    setUrl(null);
    (async () => {
      try {
        const { getTdsDownloadUrl } = await import("@/lib/tdsUpload.functions");
        const res = await getTdsDownloadUrl({ data: { path: state.path! } });
        if (cancelled) return;
        setUrl(res.url);
        setStatus("loading");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to load TDS PDF");
      }
    })();
    return () => { cancelled = true; };
  }, [state.path, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  const download = async () => {
    if (!url) return;
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // Fallback: open in new tab if the anchor download is blocked
      window.open(url, "_blank", "noopener");
    }
  };

  const open = state.path !== null;
  const fileName = state.path ? state.path.split("/").pop() ?? "TDS PDF" : "TDS PDF";
  const canAct = !!url && status !== "error";

  const [widthVw, setWidthVw] = useState<number>(() => loadInitialWidth());
  const [dragging, setDragging] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DRAWER_WIDTH_KEY, String(widthVw));
    }
  }, [widthVw]);

  const onHandlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);
  const onHandlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const vw = (e.clientX / window.innerWidth) * 100;
    setWidthVw(clampWidth(vw));
  }, [dragging]);
  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    setDragging(false);
  }, [dragging]);
  const onHandleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 8 : 2;
    if (e.key === "ArrowLeft") { e.preventDefault(); setWidthVw((w) => clampWidth(w - step)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setWidthVw((w) => clampWidth(w + step)); }
    else if (e.key === "Home") { e.preventDefault(); setWidthVw(MIN_WIDTH_VW); }
    else if (e.key === "End") { e.preventDefault(); setWidthVw(MAX_WIDTH_VW); }
  }, []);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) closeTdsPdf(); }}>
      <SheetContent
        side="left"
        style={{ width: `${widthVw}vw` }}
        className="p-0 max-w-none flex flex-col gap-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Technical Data Sheet</p>
            <p className="text-xs font-mono truncate text-foreground">{fileName}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={download}
              disabled={!canAct}
              title="Download PDF"
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted/50 transition-colors ${!canAct ? "opacity-50 pointer-events-none" : ""}`}
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <a
              href={url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { if (!canAct) e.preventDefault(); }}
              aria-disabled={!canAct}
              title="Open in new tab"
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted/50 transition-colors ${!canAct ? "opacity-50 pointer-events-none" : ""}`}
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
          {status === "error" ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--status-danger,#ef4444)]/15 text-[var(--status-danger,#ef4444)]">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-foreground">Couldn't load TDS PDF</p>
                <p className="mt-1 text-xs text-muted-foreground break-words">
                  {error ?? "Something went wrong."}
                </p>
                <button
                  onClick={retry}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-border hover:bg-muted/50 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Try again
                </button>
              </div>
            </div>
          ) : status === "signing" || !url ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Preparing secure link…</span>
              </div>
            </div>
          ) : (
            <>
              {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-secondary/40">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
                    <FileText className="w-5 h-5" />
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading PDF…
                    </span>
                  </div>
                </div>
              )}
              <iframe
                key={`${url}-${attempt}`}
                src={url}
                title={fileName}
                className={`w-full h-full border-0 relative ${dragging ? "pointer-events-none" : ""}`}
                onLoad={() => setStatus("ready")}
                onError={() => {
                  setStatus("error");
                  setError("The PDF failed to render in the drawer.");
                }}
              />
            </>
          )}
        </div>
        {/* Resize grab handle */}
        <div
          ref={handleRef}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize PDF drawer"
          aria-valuemin={MIN_WIDTH_VW}
          aria-valuemax={MAX_WIDTH_VW}
          aria-valuenow={Math.round(widthVw)}
          tabIndex={0}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => setWidthVw(DEFAULT_WIDTH_VW)}
          onKeyDown={onHandleKeyDown}
          title="Drag to resize · double-click to reset"
          className={`group absolute top-0 right-0 h-full w-1.5 -mr-[3px] cursor-col-resize z-50 flex items-center justify-center ${
            dragging ? "bg-[var(--accent-blue)]/40" : "bg-transparent hover:bg-[var(--accent-blue)]/25"
          } transition-colors select-none touch-none`}
          style={{ userSelect: "none" }}
        >
          <span
            aria-hidden
            className={`flex flex-col gap-0.5 rounded-full py-1.5 px-[3px] border border-border/60 bg-background/80 shadow-sm opacity-70 group-hover:opacity-100 ${
              dragging ? "opacity-100 border-[var(--accent-blue)]/60" : ""
            }`}
          >
            <span className="block h-0.5 w-0.5 rounded-full bg-muted-foreground" />
            <span className="block h-0.5 w-0.5 rounded-full bg-muted-foreground" />
            <span className="block h-0.5 w-0.5 rounded-full bg-muted-foreground" />
            <span className="block h-0.5 w-0.5 rounded-full bg-muted-foreground" />
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
