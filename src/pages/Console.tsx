import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

const BOOT = [
  "traceium :: secure shell v0.1.4",
  "establishing uplink ......... ok",
  "verifying client certificate . ok",
  "loading auth subsystem ...... ok",
  "",
  "# admin console — authorized personnel only",
  "# select operation:",
];

const OPTIONS = [
  { cmd: "login", label: "log in to existing account", to: "/login" as const },
  { cmd: "signin", label: "request new credentials", to: "/login" as const },
];

export default function Console() {
  const navigate = useNavigate();
  const [lines, setLines] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState(0);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    setSessionId(Math.random().toString(36).slice(2, 10).toUpperCase());
  }, []);

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      const nextLine = BOOT[i];
      if (typeof nextLine !== "string") {
        clearInterval(t);
        setReady(true);
        return;
      }

      setLines((prev) => [...prev, nextLine]);
      i += 1;
      if (i >= BOOT.length) {
        clearInterval(t);
        setReady(true);
      }
    }, 120);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "Tab") {
        e.preventDefault();
        setSel((s) => (s + 1) % OPTIONS.length);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setSel((s) => (s - 1 + OPTIONS.length) % OPTIONS.length);
      } else if (e.key === "Enter") {
        navigate({ to: OPTIONS[sel].to });
      } else if (e.key === "Escape") {
        navigate({ to: "/" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, sel, navigate]);

  return (
    <div className="min-h-screen bg-black text-emerald-300 font-mono flex items-start justify-center p-6 sm:p-12 relative overflow-hidden">
      {/* CRT vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.9) 100%)",
        }}
      />
      {/* scanlines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.6) 0 2px, transparent 2px 4px)",
        }}
      />

      <div className="relative w-full max-w-2xl mt-8 sm:mt-20">
        <pre className="text-emerald-400/80 text-[10px] leading-tight mb-6 select-none">
          {`  ████████╗██████╗  █████╗  ██████╗███████╗██╗██╗   ██╗███╗   ███╗
  ╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██╔════╝██║██║   ██║████╗ ████║
     ██║   ██████╔╝███████║██║     █████╗  ██║██║   ██║██╔████╔██║
     ██║   ██╔══██╗██╔══██║██║     ██╔══╝  ██║██║   ██║██║╚██╔╝██║
     ██║   ██║  ██║██║  ██║╚██████╗███████╗██║╚██████╔╝██║ ╚═╝ ██║
     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝ ╚═════╝ ╚═╝     ╚═╝`}
        </pre>

        <div className="text-sm space-y-1">
          {lines.map((l, i) => {
            const line = l ?? "";
            return (
              <div key={i} className={line.startsWith("#") ? "text-emerald-500/60" : ""}>
                {line || "\u00A0"}
              </div>
            );
          })}
        </div>

        {ready && (
          <div className="mt-6 space-y-2">
            {OPTIONS.map((o, i) => {
              const active = i === sel;
              return (
                <button
                  key={o.cmd}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => navigate({ to: o.to })}
                  className={`w-full text-left px-3 py-2 border transition-colors ${
                    active
                      ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                      : "border-emerald-800/50 text-emerald-400/70 hover:border-emerald-600"
                  }`}
                >
                  <span className="text-emerald-500">{active ? "▌" : " "} $&nbsp;</span>
                  <span className="text-emerald-100">{o.cmd}</span>
                  <span className="text-emerald-500/50"> — {o.label}</span>
                </button>
              );
            })}
            <div className="pt-4 text-emerald-500/40 text-xs">
              ↑↓ navigate &nbsp;·&nbsp; ⏎ select &nbsp;·&nbsp; esc to exit
            </div>
          </div>
        )}

        <div className="mt-10 text-emerald-700/50 text-[10px] tracking-widest">
          session id: {sessionId || "--------"} · uplink: 256-bit · node: trc-01
        </div>
      </div>
    </div>
  );
}
