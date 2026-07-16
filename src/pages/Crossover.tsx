import { useMasterSpecStore, type MasterSpec } from "@/data/masterSpecs";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supplierBadge, chemistryBadge, okBadge, warnBadge } from "@/lib/badges";
import { useSearch } from "@tanstack/react-router";
import { scoreCandidates, searchSuggestions } from "@/lib/crossoverScoring";


export default function Crossover() {
  const { specs } = useMasterSpecStore();
  const initialQ = (useSearch({ from: "/_app/crossover" }) as { q?: string }).q ?? "";
  const [query, setQuery] = useState(initialQ);
  const [selected, setSelected] = useState<MasterSpec | null>(null);

  const suggestions = useMemo<MasterSpec[]>(
    () => searchSuggestions(query, specs),
    [query, specs],
  );

  const equivalents = useMemo<MasterSpec[]>(() => {
    if (!selected) return [];
    return scoreCandidates(selected, specs);
  }, [selected, specs]);

  return (
    <>
      <div className="mx-auto w-full max-w-[1100px] px-5 py-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-[15px] font-semibold text-foreground">Crossover tool</h1>
          <p className="text-[12px] text-muted-foreground">
            Enter any product from any manufacturer — find functionally equivalent options across the
            Traceium catalog.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_32px_1fr] gap-4 items-start">
          {/* LEFT */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Your current product
            </p>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                }}
                placeholder="Type product name or part number…"
                className="w-full pl-9 pr-3 py-2.5 bg-card rounded-[10px] text-[13px] text-foreground"
                style={{ border: "0.5px solid var(--accent-blue-border)" }}
              />
              {suggestions.length > 0 && !selected && (
                <div
                  className="absolute z-10 mt-1 w-full bg-card rounded-[10px] overflow-hidden"
                  style={{ border: "0.5px solid var(--accent-blue-border)" }}
                >
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelected(s);
                        setQuery(s.productName);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-accent/30 flex items-center gap-2"
                    >
                      <span className="text-[13px] font-semibold text-foreground">{s.productName}</span>
                      <SupplierPill vendor={s.vendor} />
                      <span className="text-[11px] text-muted-foreground ml-auto truncate">
                        {s.materialCategory ?? "—"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selected && <SpecMiniCard spec={selected} />}
          </div>

          {/* ARROW */}
          <div className="hidden md:flex items-start justify-center pt-9">
            <span style={{ color: "var(--accent-blue)", fontSize: 20 }}>→</span>
          </div>

          {/* RIGHT */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              VIABLE CANDIDATES
            </p>
            {!selected ? (
              <div
                className="rounded-[10px] p-6 text-center text-[12px] text-muted-foreground"
                style={{ border: "0.5px solid var(--border)" }}
              >
                Enter a product to find equivalents.
              </div>
            ) : equivalents.length === 0 ? (
              <div
                className="rounded-[10px] p-6 text-center text-[12px] text-muted-foreground"
                style={{ border: "0.5px solid var(--border)" }}
              >
                No equivalents in the catalog yet.
              </div>
            ) : (
              equivalents.map((s, idx) => (
                <SpecMiniCard key={s.id} spec={s} bestMatch={idx === 0} />
              ))
            )}
          </div>
        </div>

        {selected && equivalents.length > 0 && (
          <Differences source={selected} target={equivalents[0]} />
        )}
      </div>
    </>
  );
}

function SupplierPill({ vendor }: { vendor: string | null }) {
  const c = supplierBadge(vendor);
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
      style={{ background: c.bg, color: c.color, border: `0.5px solid ${c.border}` }}
    >
      {vendor ?? "—"}
    </span>
  );
}

function SpecMiniCard({ spec, bestMatch = false }: { spec: MasterSpec; bestMatch?: boolean }) {
  const chem = chemistryBadge(spec.resinChemistry);
  return (
    <div
      className="rounded-[10px] p-3 bg-card"
      style={{
        border: bestMatch
          ? "0.5px solid var(--ok-green-border)"
          : "0.5px solid var(--border)",
        background: bestMatch ? "color-mix(in srgb, var(--ok-green) 5%, var(--card))" : undefined,
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-semibold text-foreground">{spec.productName}</span>
        <SupplierPill vendor={spec.vendor} />
        {spec.resinChemistry && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: chem.bg, color: chem.color, border: `0.5px solid ${chem.border}` }}
          >
            {spec.resinChemistry}
          </span>
        )}
        {bestMatch && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto"
            style={{ background: okBadge.bg, color: okBadge.color, border: `0.5px solid ${okBadge.border}` }}
          >
            Plausible Match
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">
        {[spec.materialCategory, spec.resinChemistry, spec.cureTemperatureC ? `${spec.cureTemperatureC}°F cure` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

function Differences({ source, target }: { source: MasterSpec; target: MasterSpec }) {
  const diffs: { kind: "ok" | "warn" | "neutral"; label: string; value: string }[] = [];

  if (source.ooaVboCapable !== target.ooaVboCapable) {
    diffs.push({
      kind: "warn",
      label: "OoA / VBO capability",
      value: target.ooaVboCapable ? "Gains OoA capability" : "Loses OoA capability",
    });
  } else {
    diffs.push({
      kind: "ok",
      label: "OoA / VBO capability",
      value: target.ooaVboCapable ? "Both OoA capable" : "Neither OoA capable",
    });
  }

  if (source.cureTemperatureC && target.cureTemperatureC) {
    const d = target.cureTemperatureC - source.cureTemperatureC;
    diffs.push({
      kind: Math.abs(d) <= 5 ? "ok" : "warn",
      label: "Cure temperature",
      value: `${source.cureTemperatureC}°F → ${target.cureTemperatureC}°F (${d >= 0 ? "+" : ""}${d}°F)`,
    });
  }

  const sTg = source.peakTgC ?? source.dryTgOnsetC;
  const tTg = target.peakTgC ?? target.dryTgOnsetC;
  if (sTg && tTg) {
    const d = tTg - sTg;
    diffs.push({
      kind: Math.abs(d) <= 10 ? "ok" : "warn",
      label: "Tg",
      value: `${sTg}°F → ${tTg}°F (${d >= 0 ? "+" : ""}${d}°F)`,
    });
  }

  if (source.outLifeDays && target.outLifeDays) {
    const d = target.outLifeDays - source.outLifeDays;
    diffs.push({
      kind: d >= 0 ? "ok" : "warn",
      label: "Out-life",
      value: `${source.outLifeDays}d → ${target.outLifeDays}d`,
    });
  }

  if (source.qualificationsStandards !== target.qualificationsStandards) {
    diffs.push({
      kind: "neutral",
      label: "Qualifications",
      value: "Verify against your program's spec list.",
    });
  }

  return (
    <section className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        What changes if you switch to {target.productName}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {diffs.map((d, i) => {
          const style =
            d.kind === "ok"
              ? { bg: "color-mix(in srgb, var(--ok-green) 7%, transparent)", border: "var(--ok-green-border)", color: "var(--ok-green)", icon: "✓" }
              : d.kind === "warn"
                ? { bg: "color-mix(in srgb, var(--warn-amber) 7%, transparent)", border: "var(--warn-amber-border)", color: "var(--warn-amber)", icon: "⚠" }
                : { bg: "rgba(255,255,255,0.02)", border: "var(--border)", color: "var(--muted-foreground)", icon: "·" };
          return (
            <div
              key={i}
              className="rounded-[10px] p-3"
              style={{ background: style.bg, border: `0.5px solid ${style.border}` }}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{d.label}</p>
              <p className="text-[13px] text-foreground">
                <span style={{ color: style.color }}>{style.icon}</span> {d.value}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

