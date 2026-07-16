import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import {
  scoreCandidates,
  searchSuggestions,
  type ScorableSpec,
} from "@/lib/crossoverScoring";

type Spec = ScorableSpec;
type Config = { brand_name: string; logo_url: string | null; accent_color: string };

export default function EmbedCrossover() {
  const search = useSearch({ from: "/embed/crossover" }) as { key?: string };
  const apiKey = search.key ?? "";
  const [config, setConfig] = useState<Config | null>(null);
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Spec | null>(null);

  useEffect(() => {
    if (!apiKey) {
      setError("Missing API key");
      return;
    }
    const headers = { Authorization: `Bearer ${apiKey}` };
    Promise.all([
      fetch("/api/public/widget/config", { headers }).then((r) =>
        r.ok ? r.json() : Promise.reject(r.statusText),
      ),
      fetch("/api/public/widget/catalog", { headers }).then((r) =>
        r.ok ? r.json() : Promise.reject(r.statusText),
      ),
    ])
      .then(([cfg, cat]) => {
        setConfig(cfg);
        setSpecs(cat.specs ?? []);
      })
      .catch((e) => setError(String(e)));
  }, [apiKey]);

  const suggestions = useMemo(() => searchSuggestions(query, specs), [query, specs]);
  const equivalents = useMemo(
    () => (selected ? scoreCandidates(selected, specs) : []),
    [selected, specs],
  );

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", color: "#b91c1c" }}>
        Widget error: {error}
      </div>
    );
  }
  if (!config) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", color: "#666" }}>Loading…</div>
    );
  }

  const accent = config.accent_color;

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 20,
        maxWidth: 1100,
        margin: "0 auto",
        color: "#111",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingBottom: 16,
          borderBottom: "1px solid #e5e7eb",
          marginBottom: 20,
        }}
      >
        {config.logo_url && (
          <img src={config.logo_url} alt="" style={{ height: 32 }} />
        )}
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{config.brand_name}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Material Crossover Tool</div>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 32px 1fr", gap: 16 }}>
        <div>
          <p style={{ fontSize: 10, textTransform: "uppercase", color: "#6b7280", marginBottom: 8 }}>
            Your current product
          </p>
          <div style={{ position: "relative" }}>
            <Search
              style={{
                position: "absolute",
                left: 10,
                top: 12,
                width: 16,
                height: 16,
                color: "#9ca3af",
              }}
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="Type product name or part number…"
              style={{
                width: "100%",
                padding: "10px 12px 10px 34px",
                borderRadius: 8,
                border: `1px solid ${accent}40`,
                fontSize: 13,
                outline: "none",
              }}
            />
            {suggestions.length > 0 && !selected && (
              <div
                style={{
                  position: "absolute",
                  zIndex: 10,
                  marginTop: 4,
                  width: "100%",
                  background: "white",
                  border: `1px solid ${accent}40`,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelected(s);
                      setQuery(s.productName);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      background: "white",
                      border: 0,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <strong>{s.productName}</strong>{" "}
                    <span style={{ color: "#6b7280" }}>· {s.vendor}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && <SpecCard spec={selected} accent={accent} />}
        </div>

        <div style={{ display: "flex", justifyContent: "center", paddingTop: 34 }}>
          <span style={{ color: accent, fontSize: 20 }}>→</span>
        </div>

        <div>
          <p style={{ fontSize: 10, textTransform: "uppercase", color: "#6b7280", marginBottom: 8 }}>
            Viable candidates
          </p>
          {!selected ? (
            <EmptyBox>Enter a product to find equivalents.</EmptyBox>
          ) : equivalents.length === 0 ? (
            <EmptyBox>No equivalents in the catalog yet.</EmptyBox>
          ) : (
            equivalents.map((s, i) => (
              <SpecCard key={s.id} spec={s} accent={accent} best={i === 0} />
            ))
          )}
        </div>
      </div>

      <footer style={{ marginTop: 24, textAlign: "center", fontSize: 10, color: "#9ca3af" }}>
        Powered by {config.brand_name}
      </footer>
    </div>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 24,
        border: "1px dashed #e5e7eb",
        borderRadius: 8,
        textAlign: "center",
        fontSize: 12,
        color: "#6b7280",
      }}
    >
      {children}
    </div>
  );
}

function SpecCard({
  spec,
  accent,
  best = false,
}: {
  spec: Spec;
  accent: string;
  best?: boolean;
}) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 8,
        border: best ? `1px solid ${accent}` : "1px solid #e5e7eb",
        background: best ? `${accent}0d` : "white",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>{spec.productName}</strong>
        <span
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 999,
            background: "#f3f4f6",
            color: "#374151",
          }}
        >
          {spec.vendor}
        </span>
        {best && (
          <span
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 999,
              background: `${accent}20`,
              color: accent,
              marginLeft: "auto",
            }}
          >
            Plausible Match
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
        {[
          spec.materialCategory,
          spec.resinChemistry,
          spec.cureTemperatureC ? `${spec.cureTemperatureC}°F cure` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}
