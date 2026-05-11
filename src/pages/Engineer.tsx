import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import {
  Search,
  Filter,
  X,
  ExternalLink,
  Package,
  Star as StarOutline,
  Info,
  CheckSquare,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useMaterialStore } from "@/data/materials";
import {
  useMasterSpecStore,
  getInventoryMatch,
  setFrequentReorder,
  type MasterSpec,
} from "@/data/masterSpecs";
import {
  addProcurementRequest,
  useProcurementStore,
} from "@/data/procurement";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

/*
 * Engineer Workspace
 * ------------------
 * Reverse-lookup over the master spec catalog. Engineers filter by every
 * meaningful spec column, mark items they need with a Procure checkbox,
 * and star items that should be reordered frequently.
 */

// Filled star — Phosphor-style, supplied by the user.
function StarFilled({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M229.5,113,166.06,89.94,143,26.5a16,16,0,0,0-30,0L89.94,89.94,26.5,113a16,16,0,0,0,0,30l63.44,23.07L113,229.5a16,16,0,0,0,30,0l23.07-63.44L229.5,143a16,16,0,0,0,0-30Z" />
    </svg>
  );
}

interface NumRange {
  min?: number;
  max?: number;
}

interface FilterState {
  q: string;
  vendors: string[];
  categories: string[];
  chemistries: string[];
  reinforcements: string[];
  forms: string[];
  processMethods: string[];
  cureC: NumRange;
  peakTgC: NumRange;
  maxServiceC: NumRange;
  outLifeDays: NumRange;
  tmlPct: NumRange;
  cvcmPct: NumRange;
  flags: {
    ooaVboCapable?: boolean;
    toughened?: boolean;
    flameRetardant?: boolean;
    lowDielectric?: boolean;
    lowMoistureAbsorption?: boolean;
    impactResistant?: boolean;
    highTemperature?: boolean;
  };
  inventory: "any" | "in-stock" | "tracked" | "not-stocked";
}

const EMPTY_FILTERS: FilterState = {
  q: "",
  vendors: [],
  categories: [],
  chemistries: [],
  reinforcements: [],
  forms: [],
  processMethods: [],
  cureC: {},
  peakTgC: {},
  maxServiceC: {},
  outLifeDays: {},
  tmlPct: {},
  cvcmPct: {},
  flags: {},
  inventory: "any",
};

const FLAG_LABELS: Record<keyof FilterState["flags"], string> = {
  ooaVboCapable: "OOA / VBO",
  toughened: "Toughened",
  flameRetardant: "Flame Retardant",
  lowDielectric: "Low Dielectric",
  lowMoistureAbsorption: "Low Moisture",
  impactResistant: "Impact Resistant",
  highTemperature: "High Temperature",
};

function uniqueOf(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

function inRange(v: number | null, r: NumRange): boolean {
  if (r.min === undefined && r.max === undefined) return true;
  if (v === null) return false;
  if (r.min !== undefined && v < r.min) return false;
  if (r.max !== undefined && v > r.max) return false;
  return true;
}

export default function Engineer() {
  const { specs } = useMasterSpecStore();
  const { materials } = useMaterialStore();
  const { requests } = useProcurementStore();
  const { profile, user } = useAuth();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<MasterSpec | null>(null);
  const [engineerName, setEngineerName] = useState<string>("");
  const [picking, setPicking] = useState<string | null>(null);

  // Default engineer name from profile/email; allow override via local storage
  useEffect(() => {
    const stored = localStorage.getItem("traceum.engineerName");
    if (stored) {
      setEngineerName(stored);
      return;
    }
    const fallback = profile?.full_name || profile?.email || user?.email || "";
    if (fallback) setEngineerName(fallback);
  }, [profile, user]);
  useEffect(() => {
    if (engineerName) localStorage.setItem("traceum.engineerName", engineerName);
  }, [engineerName]);

  const vendors = useMemo(() => uniqueOf(specs.map((s) => s.vendor)), [specs]);
  const categories = useMemo(() => uniqueOf(specs.map((s) => s.materialCategory)), [specs]);
  const chemistries = useMemo(() => uniqueOf(specs.map((s) => s.resinChemistry)), [specs]);
  const reinforcements = useMemo(() => uniqueOf(specs.map((s) => s.reinforcement)), [specs]);
  const forms = useMemo(() => uniqueOf(specs.map((s) => s.productForm)), [specs]);
  const processMethods = useMemo(() => uniqueOf(specs.map((s) => s.processMethod)), [specs]);

  // Track which specs are already pending in the pick list (per current engineer)
  const pendingForMe = useMemo(() => {
    const set = new Set<string>();
    requests.forEach((r) => {
      if (r.status === "pending" && (!engineerName || r.engineerName === engineerName)) {
        set.add(r.masterSpecId);
      }
    });
    return set;
  }, [requests, engineerName]);

  const matched = useMemo(() => {
    const q = filters.q.toLowerCase().trim();
    return specs.filter((s) => {
      if (filters.vendors.length && !filters.vendors.includes(s.vendor)) return false;
      if (filters.categories.length && !filters.categories.includes(s.materialCategory ?? "")) return false;
      if (filters.chemistries.length && !filters.chemistries.includes(s.resinChemistry ?? "")) return false;
      if (filters.reinforcements.length && !filters.reinforcements.includes(s.reinforcement ?? "")) return false;
      if (filters.forms.length && !filters.forms.includes(s.productForm ?? "")) return false;
      if (filters.processMethods.length && !filters.processMethods.includes(s.processMethod ?? "")) return false;
      if (!inRange(s.cureTemperatureC, filters.cureC)) return false;
      if (!inRange(s.peakTgC ?? s.dryTgOnsetC, filters.peakTgC)) return false;
      if (!inRange(s.maxServiceTemperatureC, filters.maxServiceC)) return false;
      if (!inRange(s.outLifeDays, filters.outLifeDays)) return false;
      if (!inRange(s.tmlPct, filters.tmlPct)) return false;
      if (!inRange(s.cvcmPct, filters.cvcmPct)) return false;
      for (const [k, v] of Object.entries(filters.flags)) {
        if (v === undefined) continue;
        if (Boolean(s[k as keyof MasterSpec]) !== v) return false;
      }
      if (filters.inventory !== "any") {
        const inv = getInventoryMatch(s, materials).status;
        if (filters.inventory === "in-stock" && inv !== "in-stock") return false;
        if (filters.inventory === "tracked" && inv !== "tracked") return false;
        if (filters.inventory === "not-stocked" && inv !== "none") return false;
      }
      if (q) {
        const hay = [
          s.vendor, s.productName, s.productFamily, s.materialCategory,
          s.resinChemistry, s.reinforcement, s.productForm, s.processMethod,
          s.applications, s.qualificationsStandards, s.notes,
          s.crossoverProduct, s.crossoverVendor,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [specs, materials, filters]);

  const isEmpty = specs.length === 0;

  const handleProcure = async (spec: MasterSpec) => {
    const name =
      engineerName.trim() ||
      profile?.full_name ||
      profile?.email ||
      user?.email ||
      "Unknown Engineer";
    if (pendingForMe.has(spec.id)) {
      toast("Already on your pick list.");
      return;
    }
    setPicking(spec.id);
    try {
      await addProcurementRequest({
        masterSpecId: spec.id,
        engineerName: name,
        chosenVendor: spec.vendor,
      });
      toast.success(`Added ${spec.productName} to procurement pick list.`);
    } catch (e) {
      console.error("addProcurementRequest failed", e);
      toast.error(
        e instanceof Error ? `Failed to add: ${e.message}` : "Failed to add to pick list.",
      );
    } finally {
      setPicking(null);
    }
  };

  const handleStar = async (spec: MasterSpec) => {
    try {
      await setFrequentReorder(spec.id, !spec.frequentReorder, engineerName.trim() || undefined);
      toast(spec.frequentReorder ? "Removed from frequent reorder." : "Marked as frequent reorder.");
    } catch {
      toast.error("Failed to update.");
    }
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);
  const activeFilterCount =
    (filters.q ? 1 : 0) +
    filters.vendors.length + filters.categories.length + filters.chemistries.length +
    filters.reinforcements.length + filters.forms.length + filters.processMethods.length +
    Object.values(filters.flags).filter((v) => v !== undefined).length +
    [filters.cureC, filters.peakTgC, filters.maxServiceC, filters.outLifeDays, filters.tmlPct, filters.cvcmPct]
      .filter((r) => r.min !== undefined || r.max !== undefined).length +
    (filters.inventory !== "any" ? 1 : 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Engineer Workspace
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Search the master spec catalog by any property. Mark what you need
              for procurement and star items you reorder often.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Engineer</label>
            <Input
              value={engineerName}
              onChange={(e) => setEngineerName(e.target.value)}
              placeholder="Your name"
              className="h-8 w-44 bg-secondary border-border text-sm"
            />
          </div>
        </div>

        {isEmpty ? (
          <div className="bg-card border border-border rounded-lg p-16 text-center">
            <Search className="w-7 h-7 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              The master spec catalog is empty. Upload a spec sheet from the
              Master Specs page to begin.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            {/* Filter panel */}
            <aside className="space-y-4">
              <details className="lg:open:block bg-card border border-border rounded-lg group" open>
                <summary className="lg:hidden flex items-center justify-between p-4 cursor-pointer text-sm font-medium">
                  <span className="flex items-center gap-2"><Filter className="w-4 h-4" /> Filters {activeFilterCount > 0 && (<span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-foreground text-background">{activeFilterCount}</span>)}</span>
                  <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
                  <span className="text-xs text-muted-foreground hidden group-open:inline">Hide</span>
                </summary>
                <div className="p-4 pt-0 lg:pt-4 space-y-4">
                <div className="hidden lg:flex items-center justify-between">
                  <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Filter className="w-4 h-4" /> Filters
                    {activeFilterCount > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-foreground text-background">
                        {activeFilterCount}
                      </span>
                    )}
                  </h2>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={filters.q}
                    onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                    placeholder="Search any text…"
                    className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded text-sm"
                  />
                </div>

                <FilterSection title="Inventory">
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["any", "in-stock", "tracked", "not-stocked"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setFilters({ ...filters, inventory: v })}
                        className={`text-xs px-2 py-1.5 rounded border ${
                          filters.inventory === v
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {v === "any" ? "Any" : v === "in-stock" ? "In Stock" : v === "tracked" ? "Tracked" : "Not Stocked"}
                      </button>
                    ))}
                  </div>
                </FilterSection>

                <ChipFilter
                  title="Vendor" options={vendors}
                  selected={filters.vendors}
                  onChange={(v) => setFilters({ ...filters, vendors: v })}
                />
                <ChipFilter
                  title="Category" options={categories}
                  selected={filters.categories}
                  onChange={(v) => setFilters({ ...filters, categories: v })}
                />
                <ChipFilter
                  title="Chemistry" options={chemistries}
                  selected={filters.chemistries}
                  onChange={(v) => setFilters({ ...filters, chemistries: v })}
                />
                <ChipFilter
                  title="Reinforcement" options={reinforcements}
                  selected={filters.reinforcements}
                  onChange={(v) => setFilters({ ...filters, reinforcements: v })}
                />
                <ChipFilter
                  title="Form" options={forms}
                  selected={filters.forms}
                  onChange={(v) => setFilters({ ...filters, forms: v })}
                />
                <ChipFilter
                  title="Process Method" options={processMethods}
                  selected={filters.processMethods}
                  onChange={(v) => setFilters({ ...filters, processMethods: v })}
                />

                <RangeFilter
                  title="Cure Temp (°C)" range={filters.cureC}
                  onChange={(r) => setFilters({ ...filters, cureC: r })}
                />
                <RangeFilter
                  title="Peak Tg (°C)" range={filters.peakTgC}
                  onChange={(r) => setFilters({ ...filters, peakTgC: r })}
                />
                <RangeFilter
                  title="Max Service Temp (°C)" range={filters.maxServiceC}
                  onChange={(r) => setFilters({ ...filters, maxServiceC: r })}
                />
                <RangeFilter
                  title="Out Life (days)" range={filters.outLifeDays}
                  onChange={(r) => setFilters({ ...filters, outLifeDays: r })}
                />
                <RangeFilter
                  title="TML (%)" range={filters.tmlPct}
                  onChange={(r) => setFilters({ ...filters, tmlPct: r })}
                />
                <RangeFilter
                  title="CVCM (%)" range={filters.cvcmPct}
                  onChange={(r) => setFilters({ ...filters, cvcmPct: r })}
                />

                <FilterSection title="Process Flags">
                  <div className="space-y-1">
                    {(Object.keys(FLAG_LABELS) as (keyof FilterState["flags"])[]).map((k) => (
                      <button
                        key={k}
                        onClick={() => {
                          const cur = filters.flags[k];
                          const next = cur === undefined ? true : cur === true ? false : undefined;
                          setFilters({ ...filters, flags: { ...filters.flags, [k]: next } });
                        }}
                        className="flex items-center justify-between w-full text-xs py-1.5 px-2 rounded hover:bg-secondary/50"
                      >
                        <span className="text-foreground">{FLAG_LABELS[k]}</span>
                        <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                          filters.flags[k] === true
                            ? "bg-[var(--status-compliant)]/15 text-[var(--status-compliant)]"
                            : filters.flags[k] === false
                            ? "bg-[var(--status-warning)]/15 text-[var(--status-warning)]"
                            : "bg-secondary text-muted-foreground"
                        }`}>
                          {filters.flags[k] === true ? "REQUIRED" : filters.flags[k] === false ? "EXCLUDE" : "ANY"}
                        </span>
                      </button>
                    ))}
                  </div>
                </FilterSection>
                </div>
              </details>
            </aside>

            {/* Results */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground">
                  {matched.length} match{matched.length === 1 ? "" : "es"} of {specs.length}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {matched.filter((s) => getInventoryMatch(s, materials).status === "in-stock").length} in stock
                </span>
              </div>

              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-center px-2 py-2 font-medium w-12" title="Procure">
                          <span className="inline-flex items-center gap-1">
                            <CheckSquare className="w-3.5 h-3.5" /> Procure
                          </span>
                        </th>
                        <th className="text-center px-2 py-2 font-medium w-10" title="Frequent reorder">★</th>
                        <th className="text-left px-3 py-2 font-medium">Product</th>
                        <th className="text-left px-3 py-2 font-medium">Vendor</th>
                        <th className="text-left px-3 py-2 font-medium">Form</th>
                        <th className="text-left px-3 py-2 font-medium">Chemistry</th>
                        <th className="text-center px-3 py-2 font-medium">Cure °C</th>
                        <th className="text-center px-3 py-2 font-medium">Service °C</th>
                        <th className="text-center px-3 py-2 font-medium">E595</th>
                        <th className="text-right px-3 py-2 font-medium">Inventory</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matched.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="text-center py-12 text-muted-foreground text-sm">
                            No specs match these filters.
                          </td>
                        </tr>
                      ) : (
                        matched.map((spec) => {
                          const inv = getInventoryMatch(spec, materials);
                          const e595Pass =
                            spec.tmlPct !== null && spec.tmlPct <= 1.0 &&
                            spec.cvcmPct !== null && spec.cvcmPct <= 0.1;
                          const isPending = pendingForMe.has(spec.id);
                          return (
                            <tr
                              key={spec.id}
                              className="border-t border-border hover:bg-accent/20 transition-colors"
                            >
                              <td className="px-2 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isPending}
                                  disabled={picking === spec.id}
                                  onChange={() => handleProcure(spec)}
                                  className="w-4 h-4 accent-foreground cursor-pointer"
                                  aria-label="Add to procurement pick list"
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  onClick={() => handleStar(spec)}
                                  className={`p-1 rounded hover:bg-secondary transition-colors ${
                                    spec.frequentReorder ? "text-[var(--status-warning)]" : "text-muted-foreground/40"
                                  }`}
                                  aria-label={spec.frequentReorder ? "Unstar" : "Mark frequent reorder"}
                                  title={spec.frequentReorder ? "Frequent reorder — starred" : "Mark as frequent reorder"}
                                >
                                  {spec.frequentReorder ? (
                                    <StarFilled className="w-4 h-4" />
                                  ) : (
                                    <StarOutline className="w-4 h-4" />
                                  )}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => setSelected(spec)}
                                  className="text-left font-medium text-foreground hover:underline"
                                >
                                  {spec.productName}
                                </button>
                                {spec.productFamily && (
                                  <div className="text-xs text-muted-foreground">{spec.productFamily}</div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{spec.vendor}</td>
                              <td className="px-3 py-2 text-muted-foreground">{spec.productForm ?? "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground">{spec.resinChemistry ?? "—"}</td>
                              <td className="px-3 py-2 text-center font-mono">{spec.cureTemperatureC ?? "—"}</td>
                              <td className="px-3 py-2 text-center font-mono">{spec.maxServiceTemperatureC ?? "—"}</td>
                              <td className="px-3 py-2 text-center font-mono text-xs">
                                {spec.tmlPct === null && spec.cvcmPct === null ? (
                                  <span className="text-muted-foreground/40">—</span>
                                ) : (
                                  <span className={e595Pass ? "text-[var(--status-compliant)]" : "text-[var(--status-warning)]"}>
                                    {spec.tmlPct ?? "?"}/{spec.cvcmPct ?? "?"}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {inv.status === "none" ? (
                                  <span className="text-[10px] font-mono uppercase text-muted-foreground px-1.5 py-0.5 rounded bg-secondary">
                                    Not Stocked
                                  </span>
                                ) : (
                                  <Link
                                    to="/material/$id"
                                    params={{ id: inv.material.id }}
                                    className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                                      inv.status === "in-stock"
                                        ? "bg-[var(--status-compliant)]/15 text-[var(--status-compliant)]"
                                        : "bg-[var(--status-warning)]/15 text-[var(--status-warning)]"
                                    }`}
                                  >
                                    {inv.status === "in-stock" ? `In Stock (${inv.material.availableQty})` : "Tracked"}
                                  </Link>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {!engineerName && (
                <div className="text-xs text-muted-foreground flex items-center gap-2 px-1">
                  <Info className="w-3 h-3" /> Enter your name above so procurement knows who requested each part.
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {selected && (
        <SpecDrawer spec={selected} onClose={() => setSelected(null)} />
      )}
    </DashboardLayout>
  );
}

/* --- Filter sub-components --- */

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function ChipFilter({
  title, options, selected, onChange,
}: { title: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  if (options.length === 0) return null;
  return (
    <FilterSection title={title}>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() =>
                onChange(on ? selected.filter((v) => v !== opt) : [...selected, opt])
              }
              className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </FilterSection>
  );
}

function RangeFilter({
  title, range, onChange,
}: { title: string; range: NumRange; onChange: (r: NumRange) => void }) {
  return (
    <FilterSection title={title}>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          placeholder="min"
          value={range.min ?? ""}
          onChange={(e) =>
            onChange({ ...range, min: e.target.value === "" ? undefined : Number(e.target.value) })
          }
          className="bg-background border border-border rounded px-2 py-1 text-xs"
        />
        <input
          type="number"
          placeholder="max"
          value={range.max ?? ""}
          onChange={(e) =>
            onChange({ ...range, max: e.target.value === "" ? undefined : Number(e.target.value) })
          }
          className="bg-background border border-border rounded px-2 py-1 text-xs"
        />
      </div>
    </FilterSection>
  );
}

/* --- Spec detail drawer (with compliance section) --- */

function SpecDrawer({ spec, onClose }: { spec: MasterSpec; onClose: () => void }) {
  const fmt = (n: number | null, suffix = "") =>
    n === null || n === undefined ? "—" : `${n}${suffix}`;
  const e595Pass =
    spec.tmlPct !== null && spec.tmlPct <= 1.0 &&
    spec.cvcmPct !== null && spec.cvcmPct <= 0.1;

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
          {/* Compliance & Qualifications — surfaced first */}
          <DrawerSection title="Compliance & Qualifications" tone="primary">
            <Row label="NASA E595 (TML ≤ 1%, CVCM ≤ 0.1%)"
              value={
                spec.tmlPct === null && spec.cvcmPct === null
                  ? "—"
                  : `${fmt(spec.tmlPct, "%")} / ${fmt(spec.cvcmPct, "%")} ${e595Pass ? "✓ Pass" : "✗ Verify"}`
              }
            />
            <Row label="Flame Retardant" value={spec.flameRetardant ? "Yes" : "—"} />
            <Row label="High Temperature Rated" value={spec.highTemperature ? "Yes" : "—"} />
            <Row label="Low Dielectric" value={spec.lowDielectric ? "Yes" : "—"} />
            <Row label="Low Moisture Absorption" value={spec.lowMoistureAbsorption ? "Yes" : "—"} />
            {spec.qualificationsStandards && (
              <div className="mt-2 text-sm text-foreground whitespace-pre-wrap">
                {spec.qualificationsStandards}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Thermal & Cure">
            <Row label="Cure Temperature" value={fmt(spec.cureTemperatureC, " °C")} />
            <Row label="Cure Time" value={spec.cureTime} />
            <Row label="Dry Tg Onset" value={fmt(spec.dryTgOnsetC, " °C")} />
            <Row label="Wet Tg" value={fmt(spec.wetTgC, " °C")} />
            <Row label="Peak Tg" value={fmt(spec.peakTgC, " °C")} />
            <Row label="Max Service Temp" value={fmt(spec.maxServiceTemperatureC, " °C")} />
          </DrawerSection>

          <DrawerSection title="Mechanical">
            <Row label="Tensile Lap Shear" value={fmt(spec.tensileLapShearMpa, " MPa")} />
            <Row label="T-Peel" value={fmt(spec.tPeelN25mm, " N/25mm")} />
            <Row label="Flatwise Tension" value={fmt(spec.flatwiseTensionMpa, " MPa")} />
            <Row label="Climbing Drum Peel" value={fmt(spec.climbingDrumPeelInLbIn, " in·lb/in")} />
          </DrawerSection>

          <DrawerSection title="Form & Process">
            <Row label="Product Form" value={spec.productForm} />
            <Row label="Reinforcement" value={spec.reinforcement} />
            <Row label="Resin Chemistry" value={spec.resinChemistry} />
            <Row label="Process Method" value={spec.processMethod} />
            <Row label="OOA / VBO Capable" value={spec.ooaVboCapable ? "Yes" : "—"} />
            <Row label="Toughened" value={spec.toughened ? "Yes" : "—"} />
            <Row label="Impact Resistant" value={spec.impactResistant ? "Yes" : "—"} />
          </DrawerSection>

          <DrawerSection title="Storage">
            <Row label="Out Life" value={fmt(spec.outLifeDays, " days")} />
            <Row label="Freezer Life" value={fmt(spec.freezerLifeMonths, " months")} />
            <Row label="Minimum Order" value={spec.minimumOrderQuantity} />
          </DrawerSection>

          {spec.applications && (
            <DrawerSection title="Applications">
              <p className="text-sm text-foreground whitespace-pre-wrap">{spec.applications}</p>
            </DrawerSection>
          )}

          {(spec.crossoverProduct || spec.crossoverVendor) && (
            <DrawerSection title="Crossover / Equivalent">
              <Row label="Product" value={spec.crossoverProduct} />
              <Row label="Vendor" value={spec.crossoverVendor} />
            </DrawerSection>
          )}

          {spec.notes && (
            <DrawerSection title="Notes">
              <p className="text-sm text-foreground whitespace-pre-wrap">{spec.notes}</p>
            </DrawerSection>
          )}
        </div>
      </div>
    </div>
  );
}

function DrawerSection({
  title, tone, children,
}: { title: string; tone?: "primary"; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === "primary"
          ? "border-[var(--status-compliant)]/40 bg-[var(--status-compliant)]/5"
          : "border-border bg-secondary/20"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </p>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground text-right">{value === null || value === "" ? "—" : value}</span>
    </div>
  );
}
