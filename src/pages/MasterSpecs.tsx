import DashboardLayout from "@/components/DashboardLayout";
import SpecSheetUpload from "@/components/SpecSheetUpload";
import { useMasterSpecStore, getInventoryMatch, type MasterSpec } from "@/data/masterSpecs";
import { useMaterialStore } from "@/data/materials";
import { Search, Upload, X, Package, BookOpen, Filter, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

export default function MasterSpecs() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading } = useAuth();
  const { specs, uploads } = useMasterSpecStore();
  const { materials } = useMaterialStore();

  useEffect(() => {
    if (!loading && !isSuperAdmin) navigate({ to: "/engineer" });
  }, [loading, isSuperAdmin, navigate]);

  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState("All");
  const [category, setCategory] = useState("All");
  const [chemistry, setChemistry] = useState("All");
  const [form, setForm] = useState("All");
  const [ooaOnly, setOoaOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [selected, setSelected] = useState<MasterSpec | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [activeProfiles, setActiveProfiles] = useState<string[]>([]);

  const vendors = useMemo(
    () => ["All", ...Array.from(new Set(specs.map((s) => s.vendor))).sort()],
    [specs],
  );
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(specs.map((s) => s.materialCategory).filter((v): v is string => !!v))).sort()],
    [specs],
  );
  const chemistries = useMemo(
    () => ["All", ...Array.from(new Set(specs.map((s) => s.resinChemistry).filter((v): v is string => !!v))).sort()],
    [specs],
  );
  const forms = useMemo(
    () => ["All", ...Array.from(new Set(specs.map((s) => s.productForm).filter((v): v is string => !!v))).sort()],
    [specs],
  );
  const allProfiles = useMemo(
    () => Array.from(new Set(specs.flatMap((s) => s.profiles ?? []))).sort(),
    [specs],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return specs.filter((s) => {
      if (vendor !== "All" && s.vendor !== vendor) return false;
      if (category !== "All" && s.materialCategory !== category) return false;
      if (chemistry !== "All" && s.resinChemistry !== chemistry) return false;
      if (form !== "All" && s.productForm !== form) return false;
      if (ooaOnly && !s.ooaVboCapable) return false;
      if (inStockOnly) {
        const m = getInventoryMatch(s, materials);
        if (m.status !== "in-stock") return false;
      }
      if (!q) return true;
      const hay = [
        s.vendor, s.productName, s.productFamily, s.materialCategory,
        s.resinChemistry, s.reinforcement, s.productForm, s.applications,
        s.qualificationsStandards, s.notes, s.crossoverProduct,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [specs, materials, search, vendor, category, chemistry, form, ooaOnly, inStockOnly]);

  const inInventoryCount = useMemo(
    () => specs.filter((s) => getInventoryMatch(s, materials).status !== "none").length,
    [specs, materials],
  );

  const fmt = (n: number | null, suffix = "") =>
    n === null || n === undefined ? "—" : `${n}${suffix}`;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Master Spec List</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Canonical aerospace material spec catalog — search, compare, and qualify.
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 bg-foreground text-background rounded px-4 py-2 text-sm font-medium hover:bg-foreground/90"
          >
            <Upload className="w-4 h-4" /> Upload Spec Sheet
          </button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Total Specs" value={specs.length} icon={BookOpen} />
          <Metric label="Vendors" value={vendors.length - 1} />
          <Metric label="Categories" value={categories.length - 1} />
          <Metric label="In Inventory" value={inInventoryCount} icon={Package} accent />
        </div>

        {/* Filter bar */}
        <div className="bg-card border border-border rounded-lg p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[240px] relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendor, product, family, applications…"
                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded text-sm"
              />
            </div>
            <Select value={vendor} onChange={setVendor} options={vendors} label="Vendor" />
            <Select value={category} onChange={setCategory} options={categories} label="Category" />
            <Select value={chemistry} onChange={setChemistry} options={chemistries} label="Chemistry" />
            <Select value={form} onChange={setForm} options={forms} label="Form" />
            <Toggle active={ooaOnly} onClick={() => setOoaOnly((v) => !v)} label="OOA only" />
            <Toggle active={inStockOnly} onClick={() => setInStockOnly((v) => !v)} label="In stock" />
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {specs.length} specs
            {uploads.length > 0 && (
              <> · {uploads.length} upload{uploads.length === 1 ? "" : "s"} on record</>
            )}
          </p>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <Th>Vendor</Th>
                  <Th>Product</Th>
                  <Th>Category</Th>
                  <Th>Chemistry</Th>
                  <Th>Form</Th>
                  <Th>Cure °C</Th>
                  <Th>Max Service °C</Th>
                  <Th>Tg °C</Th>
                  <Th>OOA</Th>
                  <Th>Out Life</Th>
                  <Th>Freezer Life</Th>
                  <Th>In Inventory</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-muted-foreground text-sm">
                      No specs match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => {
                    const inv = getInventoryMatch(s, materials);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setSelected(s)}
                        className="border-t border-border hover:bg-accent/20 cursor-pointer"
                      >
                        <Td className="text-muted-foreground">{s.vendor}</Td>
                        <Td className="font-medium text-foreground">{s.productName}</Td>
                        <Td className="text-muted-foreground">{s.materialCategory ?? "—"}</Td>
                        <Td className="text-muted-foreground">{s.resinChemistry ?? "—"}</Td>
                        <Td className="text-muted-foreground">{s.productForm ?? "—"}</Td>
                        <Td>{fmt(s.cureTemperatureC)}</Td>
                        <Td>{fmt(s.maxServiceTemperatureC)}</Td>
                        <Td>{fmt(s.dryTgOnsetC ?? s.peakTgC)}</Td>
                        <Td>
                          {s.ooaVboCapable ? (
                            <span className="text-[var(--status-compliant)]">Yes</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </Td>
                        <Td>{fmt(s.outLifeDays, " d")}</Td>
                        <Td>{fmt(s.freezerLifeMonths, " mo")}</Td>
                        <Td>
                          <InventoryBadge status={inv.status} />
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <SpecDrawer
          spec={selected}
          inv={getInventoryMatch(selected, materials)}
          onClose={() => setSelected(null)}
        />
      )}

      <SpecSheetUpload isOpen={showUpload} onClose={() => setShowUpload(false)} />
    </DashboardLayout>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 py-2 font-medium whitespace-nowrap">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 whitespace-nowrap ${className}`}>{children}</td>;
}

function Metric({
  label, value, icon: Icon, accent,
}: { label: string; value: number; icon?: React.ComponentType<{ className?: string }>; accent?: boolean }) {
  return (
    <div className={`bg-card border rounded-lg p-4 ${accent ? "border-[var(--status-compliant)]/40" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        {Icon && <Icon className={`w-4 h-4 ${accent ? "text-[var(--status-compliant)]" : "text-muted-foreground"}`} />}
      </div>
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
    </div>
  );
}

function Select({
  value, onChange, options, label,
}: { value: string; onChange: (v: string) => void; options: string[]; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Filter className="w-3.5 h-3.5 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background border border-border rounded px-2 py-1.5 text-xs"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o === "All" ? `${label}: All` : o}</option>
        ))}
      </select>
    </div>
  );
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1.5 rounded border transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function InventoryBadge({ status }: { status: "in-stock" | "tracked" | "none" }) {
  if (status === "in-stock")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--status-compliant)]/15 text-[var(--status-compliant)]">
        In Stock
      </span>
    );
  if (status === "tracked")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--status-warning)]/15 text-[var(--status-warning)]">
        Tracked
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
      Not Stocked
    </span>
  );
}

function SpecDrawer({
  spec, inv, onClose,
}: { spec: MasterSpec; inv: ReturnType<typeof getInventoryMatch>; onClose: () => void }) {
  const fmt = (n: number | null, suffix = "") =>
    n === null || n === undefined ? "—" : `${n}${suffix}`;
  const flags = [
    ["OOA / VBO", spec.ooaVboCapable], ["Toughened", spec.toughened],
    ["Flame Retardant", spec.flameRetardant], ["Low Dielectric", spec.lowDielectric],
    ["Low Moisture", spec.lowMoistureAbsorption], ["Impact Resistant", spec.impactResistant],
    ["High Temperature", spec.highTemperature],
  ] as [string, boolean][];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-xl bg-card border-l border-border h-full overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-3 flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{spec.vendor}</p>
            <h3 className="text-base font-semibold text-foreground">{spec.productName}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{spec.materialCategory ?? "—"}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Inventory link */}
          <div className="rounded-lg border border-border bg-secondary/20 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Inventory</p>
                <InventoryBadge status={inv.status} />
              </div>
              {inv.status !== "none" && (
                <Link
                  to="/material/$id"
                  params={{ id: inv.material.id }}
                  className="inline-flex items-center gap-1 text-xs text-foreground hover:underline"
                >
                  View lot <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
            {inv.status !== "none" && (
              <p className="text-xs text-muted-foreground mt-2">
                {inv.material.availableQty} {inv.material.availableUnit} available
                {inv.material.activeLots > 0 && <> · {inv.material.activeLots} active lot{inv.material.activeLots === 1 ? "" : "s"}</>}
              </p>
            )}
          </div>

          <Section title="Identity">
            <Row label="Product Family" value={spec.productFamily} />
            <Row label="Reinforcement" value={spec.reinforcement} />
            <Row label="Product Form" value={spec.productForm} />
            <Row label="Resin Chemistry" value={spec.resinChemistry} />
            <Row label="Process Method" value={spec.processMethod} />
          </Section>

          <Section title="Thermal & Cure">
            <Row label="Cure Temperature" value={fmt(spec.cureTemperatureC, " °C")} />
            <Row label="Cure Time" value={spec.cureTime} />
            <Row label="Dry Tg Onset" value={fmt(spec.dryTgOnsetC, " °C")} />
            <Row label="Wet Tg" value={fmt(spec.wetTgC, " °C")} />
            <Row label="Peak Tg" value={fmt(spec.peakTgC, " °C")} />
            <Row label="Max Service Temp" value={fmt(spec.maxServiceTemperatureC, " °C")} />
          </Section>

          <Section title="Storage">
            <Row label="Out Life" value={fmt(spec.outLifeDays, " days")} />
            <Row label="Freezer Life" value={fmt(spec.freezerLifeMonths, " months")} />
          </Section>

          <Section title="Outgassing (NASA E595)">
            <Row label="TML" value={fmt(spec.tmlPct, " %")} />
            <Row label="CVCM" value={fmt(spec.cvcmPct, " %")} />
          </Section>

          <Section title="Mechanical">
            <Row label="Tensile Lap Shear" value={fmt(spec.tensileLapShearMpa, " MPa")} />
            <Row label="T-Peel" value={fmt(spec.tPeelN25mm, " N/25mm")} />
            <Row label="Flatwise Tension" value={fmt(spec.flatwiseTensionMpa, " MPa")} />
            <Row label="Climbing Drum Peel" value={fmt(spec.climbingDrumPeelInLbIn, " in·lb/in")} />
          </Section>

          <Section title="Process Flags">
            <div className="flex flex-wrap gap-1.5">
              {flags.map(([label, on]) => (
                <span
                  key={label}
                  className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border ${
                    on
                      ? "border-[var(--status-compliant)]/40 bg-[var(--status-compliant)]/10 text-[var(--status-compliant)]"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {label}{on ? " ✓" : ""}
                </span>
              ))}
            </div>
          </Section>

          {spec.applications && (
            <Section title="Applications">
              <p className="text-sm text-foreground whitespace-pre-wrap">{spec.applications}</p>
            </Section>
          )}
          {spec.qualificationsStandards && (
            <Section title="Qualifications / Standards">
              <p className="text-sm text-foreground whitespace-pre-wrap">{spec.qualificationsStandards}</p>
            </Section>
          )}
          {(spec.crossoverProduct || spec.crossoverVendor) && (
            <Section title="Crossover / Equivalent">
              <Row label="Product" value={spec.crossoverProduct} />
              <Row label="Vendor" value={spec.crossoverVendor} />
            </Section>
          )}
          {spec.notes && (
            <Section title="Notes">
              <p className="text-sm text-foreground whitespace-pre-wrap">{spec.notes}</p>
            </Section>
          )}

          <Section title="Provenance">
            <Row label="Source Document" value={spec.sourceDocument} />
            <Row label="Uploaded From" value={spec.uploadedFrom ?? "Seed dataset"} />
            <Row label="MOQ" value={spec.minimumOrderQuantity} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value || "—"}</span>
    </div>
  );
}
