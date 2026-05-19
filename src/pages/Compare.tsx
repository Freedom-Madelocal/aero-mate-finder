import DashboardLayout from "@/components/DashboardLayout";
import { useMasterSpecStore, type MasterSpec } from "@/data/masterSpecs";
import { useCompare } from "@/contexts/CompareContext";
import { chemistryBadge } from "@/lib/badges";
import { toast } from "sonner";
import { X } from "lucide-react";

export default function Compare() {
  const { specs } = useMasterSpecStore();
  const { ids, remove, clear } = useCompare();
  const items = ids
    .map((id) => specs.find((s) => s.id === id))
    .filter((s): s is MasterSpec => Boolean(s));

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1100px] px-5 py-6 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-[15px] font-semibold text-foreground">Side-by-side comparison</h1>
            <p className="text-[12px] text-muted-foreground">{items.length} products selected</p>
          </div>
          {items.length > 0 && (
            <button
              onClick={clear}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </header>

        {items.length === 0 ? (
          <div
            className="rounded-[10px] p-10 text-center bg-card"
            style={{ border: "0.5px solid var(--border)" }}
          >
            <p className="text-[14px] text-muted-foreground">No products added to compare yet.</p>
            <p className="text-[12px] text-muted-foreground/70 mt-1">
              Use "+ Compare" on any search result to add products here.
            </p>
          </div>
        ) : (
          <div
            className="rounded-[10px] overflow-x-auto bg-card"
            style={{ border: "0.5px solid var(--border)" }}
          >
            <table className="w-full min-w-[480px] text-[12px]">
              <thead>
                <tr>
                  <th className="text-left px-3 py-3 w-[28%] text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    Property
                  </th>
                  {items.map((s, i) => (
                    <th
                      key={s.id}
                      className="text-center px-3 py-3 align-top"
                      style={
                        i === 0
                          ? {
                              background: "var(--accent-blue-soft)",
                              borderLeft: "0.5px solid var(--accent-blue-border)",
                              borderRight: "0.5px solid var(--accent-blue-border)",
                            }
                          : undefined
                      }
                    >
                      <div className="text-[13px] font-bold text-foreground">{s.productName}</div>
                      <div className="text-[11px] text-muted-foreground">{s.vendor}</div>
                      <button
                        onClick={() => remove(s.id)}
                        className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
                      >
                        <X className="w-3 h-3" /> Remove
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Dry Tg" items={items} render={(s) => fmt(s.dryTgOnsetC, "°C")} />
                <Row label="Peak Tg" items={items} render={(s) => fmt(s.peakTgC, "°C")} />
                <Row label="Cure temperature" items={items} render={(s) => fmt(s.cureTemperatureC, "°C")} />
                <Row label="Cure time" items={items} render={(s) => s.cureTime ?? "—"} />
                <Row label="Out-life (days)" items={items} render={(s) => fmt(s.outLifeDays)} />
                <Row label="Freezer life (months)" items={items} render={(s) => fmt(s.freezerLifeMonths)} />
                <Row
                  label="OoA / VBO"
                  items={items}
                  render={(s) => (s.ooaVboCapable ? "✓ Yes" : "✗ No")}
                  color={(s) => (s.ooaVboCapable ? "var(--ok-green)" : "var(--muted-foreground)")}
                />
                <Row
                  label="Autoclave"
                  items={items}
                  render={(s) =>
                    (s.processMethod ?? "").toLowerCase().includes("autoclave") ? "✓ Yes" : "—"
                  }
                  color={(s) =>
                    (s.processMethod ?? "").toLowerCase().includes("autoclave")
                      ? "var(--accent-blue)"
                      : "var(--muted-foreground)"
                  }
                />
                <Row
                  label="AFP / ATL"
                  items={items}
                  render={(s) => {
                    const p = (s.processMethod ?? "").toLowerCase();
                    return p.includes("afp") || p.includes("atl") ? "✓ Yes" : "—";
                  }}
                />
                <Row label="Available forms" items={items} render={(s) => s.productForm ?? "—"} />
                <Row
                  label="Qualifications"
                  items={items}
                  render={(s) => s.qualificationsStandards ?? "—"}
                />
                <Row
                  label="Chemistry"
                  items={items}
                  renderNode={(s) => {
                    if (!s.resinChemistry) return <span className="text-muted-foreground">—</span>;
                    const c = chemistryBadge(s.resinChemistry);
                    return (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          background: c.bg,
                          color: c.color,
                          border: `0.5px solid ${c.border}`,
                        }}
                      >
                        {s.resinChemistry}
                      </span>
                    );
                  }}
                />
              </tbody>
            </table>
          </div>
        )}

        {items.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => toast("PDF export coming soon.")}
                className="px-3 py-2 rounded-[10px] text-[12px] font-medium text-white"
                style={{ background: "var(--accent-blue)" }}
              >
                Export PDF comparison
              </button>
              <button
                onClick={() => toast("Sample request flow coming soon.")}
                className="px-3 py-2 rounded-[10px] text-[12px] font-medium bg-transparent"
                style={{ border: "0.5px solid var(--border)", color: "var(--foreground)" }}
              >
                Request samples
              </button>
              <button
                onClick={() => toast("A specialist will reach out — coming soon.")}
                className="px-3 py-2 rounded-[10px] text-[12px] font-medium bg-transparent"
                style={{ border: "0.5px solid var(--border)", color: "var(--foreground)" }}
              >
                Talk to a specialist
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              All data sourced from publicly available OEM selector guides. Verify against current
              datasheets before final selection.
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function fmt(n: number | null, suffix = ""): string {
  if (n === null || n === undefined) return "—";
  return `${n}${suffix}`;
}

function Row({
  label,
  items,
  render,
  renderNode,
  color,
}: {
  label: string;
  items: MasterSpec[];
  render?: (s: MasterSpec) => string;
  renderNode?: (s: MasterSpec) => React.ReactNode;
  color?: (s: MasterSpec) => string;
}) {
  return (
    <tr style={{ borderTop: "0.5px solid var(--border)" }}>
      <td className="px-3 py-2 text-muted-foreground font-medium">{label}</td>
      {items.map((s, i) => (
        <td
          key={s.id}
          className="px-3 py-2 text-center"
          style={
            i === 0
              ? {
                  background: "var(--accent-blue-soft)",
                  borderLeft: "0.5px solid var(--accent-blue-border)",
                  borderRight: "0.5px solid var(--accent-blue-border)",
                  color: color?.(s),
                }
              : { color: color?.(s) }
          }
        >
          {renderNode ? renderNode(s) : render?.(s)}
        </td>
      ))}
    </tr>
  );
}
