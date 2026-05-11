import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useMasterSpecStore, type MasterSpec } from "@/data/masterSpecs";

interface Suggestion {
  spec: MasterSpec;
  label: string;
  sub: string;
  score: number;
}

function scoreSpec(s: MasterSpec, q: string): Suggestion | null {
  const fields: { val: string | null | undefined; weight: number }[] = [
    { val: s.productName, weight: 100 },
    { val: s.productFamily, weight: 60 },
    { val: s.vendor, weight: 50 },
    { val: s.materialCategory, weight: 30 },
    { val: s.resinChemistry, weight: 25 },
    { val: s.reinforcement, weight: 20 },
    { val: s.productForm, weight: 18 },
    { val: s.processMethod, weight: 15 },
    { val: s.applications, weight: 8 },
    { val: s.qualificationsStandards, weight: 6 },
    { val: s.crossoverProduct, weight: 12 },
    { val: s.notes, weight: 4 },
  ];
  let best = 0;
  for (const f of fields) {
    if (!f.val) continue;
    const lv = f.val.toLowerCase();
    const idx = lv.indexOf(q);
    if (idx === -1) continue;
    // Prefix matches and shorter fields rank higher.
    const prefixBonus = idx === 0 ? 30 : 0;
    const wordStartBonus = idx > 0 && /\s/.test(lv[idx - 1]) ? 15 : 0;
    const lengthPenalty = Math.min(20, Math.floor(lv.length / 20));
    const sc = f.weight + prefixBonus + wordStartBonus - lengthPenalty;
    if (sc > best) best = sc;
  }
  if (best === 0) return null;
  return {
    spec: s,
    label: s.productName,
    sub: [s.vendor, s.productForm, s.resinChemistry].filter(Boolean).join(" · "),
    score: best,
  };
}

export default function GlobalSearch() {
  const { specs } = useMasterSpecStore();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo<Suggestion[]>(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 1) return [];
    const out: Suggestion[] = [];
    for (const s of specs) {
      const r = scoreSpec(s, query);
      if (r) out.push(r);
    }
    out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    return out.slice(0, 8);
  }, [specs, q]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ⌘K / Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const choose = (sug: Suggestion) => {
    setOpen(false);
    setQ("");
    navigate({ to: "/engineer", search: { spec: sug.spec.id } as never });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter" && q.trim()) {
        e.preventDefault();
        navigate({ to: "/engineer", search: { q: q.trim() } as never });
        setOpen(false);
        setQ("");
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative hidden md:block">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search master specs…"
        className="bg-secondary border border-border rounded-md pl-9 pr-10 py-1.5 text-sm text-foreground placeholder:text-muted-foreground w-56 lg:w-72 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded hidden lg:block pointer-events-none">
        ⌘K
      </kbd>

      {open && q.trim() && (
        <div className="absolute left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          {suggestions.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No matching specs.
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {suggestions.map((sug, i) => (
                <li key={sug.spec.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(sug);
                    }}
                    className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 ${
                      i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                    }`}
                  >
                    <span className="text-sm text-foreground truncate">{sug.label}</span>
                    {sug.sub && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {sug.sub}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
