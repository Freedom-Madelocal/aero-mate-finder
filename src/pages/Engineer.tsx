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
  ChevronDown,
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
import { Link, useSearch, useNavigate } from "@tanstack/react-router";
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
  // Tier-1 primary chip filters
  productTypes: string[];
  suppliers: string[];
  chemistryGroups: string[];
  processGroups: string[];
  applicationGroups: string[];
  segmentGroups: string[];
  // Tier-2 advanced filters
  vendors: string[];
  categories: string[];
  chemistries: string[];
  reinforcements: string[];
  forms: string[];
  processMethods: string[];
  profiles: string[];
  keySpecs: string[];
  customers: string[];
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
  e595: "any" | "pass" | "fail";
}

const EMPTY_FILTERS: FilterState = {
  q: "",
  productTypes: [],
  suppliers: [],
  chemistryGroups: [],
  processGroups: [],
  applicationGroups: [],
  segmentGroups: [],
  vendors: [],
  categories: [],
  chemistries: [],
  reinforcements: [],
  forms: [],
  processMethods: [],
  profiles: [],
  keySpecs: [],
  customers: [],
  cureC: {},
  peakTgC: {},
  maxServiceC: {},
  outLifeDays: {},
  tmlPct: {},
  cvcmPct: {},
  flags: {},
  inventory: "any",
  e595: "any",
};

// Tier-1 primary chip vocabularies (hard-coded, not derived from data)
const PRODUCT_TYPES = ["Prepreg", "Film adhesive", "Paste adhesive", "Fabric", "RTM"] as const;
const SUPPLIERS = ["Hexcel", "Toray", "Syensqo", "3M", "Henkel"] as const;
const CHEMISTRY_GROUPS = ["Epoxy", "BMI", "Cyanate ester", "PEEK", "PEKK", "LMPAEK", "Phenolic"] as const;
const PROCESS_GROUPS = ["OoA / VBO", "Autoclave", "AFP / ATL", "RTM / Infusion"] as const;
const APPLICATION_GROUPS = [
  "Primary structure",
  "Secondary structure",
  "Interior / FST",
  "Engine / hot zone",
  "Radome / antenna",
] as const;
const SEGMENT_GROUPS = [
  "Commercial aircraft",
  "Military",
  "Space & satellite",
  "Launch vehicle",
  "UAM / eVTOL",
] as const;

const PRODUCT_TYPE_RX: Record<string, RegExp> = {
  "Prepreg": /prepreg/i,
  "Film adhesive": /film\s*adhesive|adhesive\s*film/i,
  "Paste adhesive": /paste\s*adhesive|adhesive\s*paste/i,
  "Fabric": /fabric|woven|cloth/i,
  "RTM": /\brtm\b|resin\s*transfer/i,
};
const CHEMISTRY_RX: Record<string, RegExp> = {
  "Epoxy": /epoxy/i,
  "BMI": /\bbmi\b|bismaleimide/i,
  "Cyanate ester": /cyanate\s*ester|\bce\b/i,
  "PEEK": /\bpeek\b/i,
  "PEKK": /\bpekk\b/i,
  "LMPAEK": /lmpaek|low\s*melt\s*paek/i,
  "Phenolic": /phenolic/i,
};
const PROCESS_RX: Record<string, RegExp> = {
  "OoA / VBO": /ooa|out[-\s]?of[-\s]?autoclave|\bvbo\b|vacuum\s*bag\s*only/i,
  "Autoclave": /autoclave/i,
  "AFP / ATL": /\bafp\b|\batl\b|automated\s*(fiber|tape)/i,
  "RTM / Infusion": /\brtm\b|resin\s*transfer|infusion/i,
};
const APPLICATION_RX: Record<string, RegExp> = {
  "Primary structure": /primary\s*structure|airframe|fuselage|wing|spar/i,
  "Secondary structure": /secondary\s*structure|fairing|control\s*surface/i,
  "Interior / FST": /interior|cabin|sidewall|trim|galley|seating|\bfst\b|flame.*smoke/i,
  "Engine / hot zone": /engine|nacelle|hot\s*zone|exhaust|nozzle/i,
  "Radome / antenna": /radome|antenna/i,
};
const SEGMENT_RX: Record<string, RegExp> = {
  "Commercial aircraft": /commercial|airliner|boeing|airbus|narrowbody|widebody/i,
  "Military": /military|defense|defence|fighter|\bdod\b|mil[-\s]?spec/i,
  "Space & satellite": /space|satellite|spacecraft|low\s*outgassing|vacuum/i,
  "Launch vehicle": /launch\s*vehicle|rocket|booster|upper\s*stage/i,
  "UAM / eVTOL": /\buam\b|\bevtol\b|urban\s*air|advanced\s*air\s*mobility/i,
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

const PROFILE_OPTIONS = ["Space", "MRO", "Interiors", "Radomes", "Structures"] as const;
type Profile = (typeof PROFILE_OPTIONS)[number];

const PROFILE_KEYWORDS: Record<Profile, RegExp> = {
  Space: /\b(space|satellite|spacecraft|aerospace|vacuum|cryo|low\s*outgassing)\b/i,
  MRO: /\b(mro|maintenance|repair|overhaul|field\s*repair)\b/i,
  Interiors: /\b(interior|cabin|seating|sidewall|trim|galley)\b/i,
  Radomes: /\b(radome|antenna)\b/i,
  Structures: /\b(structur|primary\s*structure|airframe|fuselage|wing|spar)\b/i,
};

function getSpecProfiles(spec: MasterSpec): Profile[] {
  const hay = [spec.applications, spec.notes, spec.qualificationsStandards, spec.productFamily]
    .filter(Boolean)
    .join(" ");
  const out: Profile[] = [];
  for (const p of PROFILE_OPTIONS) {
    if (PROFILE_KEYWORDS[p].test(hay)) out.push(p);
  }
  // Radomes also implied by low dielectric flag
  if (spec.lowDielectric && !out.includes("Radomes")) out.push("Radomes");
  return out;
}

function canon(v: string | null | undefined): string {
  return (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Case- and whitespace-insensitive dedupe. Keeps the first cleaned variant as display.
function uniqueOf(values: (string | null | undefined)[]): string[] {
  const map = new Map<string, string>();
  for (const raw of values) {
    if (!raw) continue;
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!map.has(key)) map.set(key, trimmed);
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
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
  const search = useSearch({ from: "/engineer" }) as { spec?: string; q?: string };
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<MasterSpec | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  type SortKey =
    | "procure" | "star" | "product" | "vendor" | "form" | "chemistry"
    | "cure" | "service" | "e595" | "inventory";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "product",
    dir: "asc",
  });
  const PAGE_SIZE = 100;
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  // Apply incoming search params from the global search bar
  useEffect(() => {
    if (search.q && search.q !== filters.q) {
      setFilters((f) => ({ ...f, q: search.q ?? "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.q]);

  useEffect(() => {
    if (!search.spec) return;
    const found = specs.find((s) => s.id === search.spec);
    if (found) {
      setSelected(found);
      // clear param so closing the drawer doesn't reopen it
      navigate({ to: "/engineer", search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.spec, specs]);

  // Engineer name is auto-derived from the signed-in user's profile.
  const engineerName = (profile?.full_name || profile?.email || user?.email || "").trim();

  const vendors = useMemo(() => uniqueOf(specs.map((s) => s.vendor)), [specs]);
  const categories = useMemo(() => uniqueOf(specs.map((s) => s.materialCategory)), [specs]);
  const chemistries = useMemo(() => uniqueOf(specs.map((s) => s.resinChemistry)), [specs]);
  const reinforcements = useMemo(() => uniqueOf(specs.map((s) => s.reinforcement)), [specs]);
  const forms = useMemo(() => uniqueOf(specs.map((s) => s.productForm)), [specs]);
  const processMethods = useMemo(() => uniqueOf(specs.map((s) => s.processMethod)), [specs]);
  const allKeySpecs = useMemo(() => uniqueOf(specs.flatMap((s) => s.keySpecs ?? [])), [specs]);
  const allCustomers = useMemo(() => uniqueOf(specs.flatMap((s) => s.customers ?? [])), [specs]);

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
      const matchAny = (sel: string[], val: string | null | undefined) =>
        sel.length === 0 || sel.some((x) => canon(x) === canon(val));
      // Tier-1 chip groups (regex against relevant joined fields)
      const productHay = [s.materialCategory, s.productForm, s.productName, s.productFamily].filter(Boolean).join(" ");
      const chemistryHay = [s.resinChemistry, s.productName, s.productFamily, s.notes].filter(Boolean).join(" ");
      const processHay = [s.processMethod, s.notes, s.applications].filter(Boolean).join(" ") + (s.ooaVboCapable ? " ooa vbo" : "");
      const appHay = [s.applications, s.notes, s.qualificationsStandards].filter(Boolean).join(" ");
      const segHay = [s.applications, s.notes, s.qualificationsStandards, ...(s.customers ?? [])].filter(Boolean).join(" ");
      const groupMatch = (sel: string[], rx: Record<string, RegExp>, hay: string) =>
        sel.length === 0 || sel.some((k) => rx[k]?.test(hay));
      if (!groupMatch(filters.productTypes, PRODUCT_TYPE_RX, productHay)) return false;
      if (filters.suppliers.length && !filters.suppliers.some((v) => canon(v) === canon(s.vendor))) return false;
      if (!groupMatch(filters.chemistryGroups, CHEMISTRY_RX, chemistryHay)) return false;
      if (!groupMatch(filters.processGroups, PROCESS_RX, processHay)) return false;
      if (!groupMatch(filters.applicationGroups, APPLICATION_RX, appHay)) return false;
      if (!groupMatch(filters.segmentGroups, SEGMENT_RX, segHay)) return false;
      if (!matchAny(filters.vendors, s.vendor)) return false;
      if (!matchAny(filters.categories, s.materialCategory)) return false;
      if (!matchAny(filters.chemistries, s.resinChemistry)) return false;
      if (!matchAny(filters.reinforcements, s.reinforcement)) return false;
      if (!matchAny(filters.forms, s.productForm)) return false;
      if (!matchAny(filters.processMethods, s.processMethod)) return false;
      if (filters.profiles.length) {
        const sp = getSpecProfiles(s);
        if (!filters.profiles.some((p) => sp.includes(p as Profile))) return false;
      }
      if (filters.keySpecs.length) {
        const ks = (s.keySpecs ?? []).map(canon);
        if (!filters.keySpecs.some((k) => ks.includes(canon(k)))) return false;
      }
      if (filters.customers.length) {
        const cs = (s.customers ?? []).map(canon);
        if (!filters.customers.some((c) => cs.includes(canon(c)))) return false;
      }
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
      if (filters.e595 !== "any") {
        const pass =
          s.tmlPct !== null && s.tmlPct <= 1.0 &&
          s.cvcmPct !== null && s.cvcmPct <= 0.1;
        if (filters.e595 === "pass" && !pass) return false;
        if (filters.e595 === "fail" && pass) return false;
      }
      if (q) {
        const hay = [
          s.vendor, s.productName, s.productFamily, s.materialCategory,
          s.resinChemistry, s.reinforcement, s.productForm, s.processMethod,
          s.applications, s.qualificationsStandards, s.notes,
          s.crossoverProduct, s.crossoverVendor,
          ...(s.keySpecs ?? []),
          ...(s.customers ?? []),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [specs, materials, filters]);

  const sorted = useMemo(() => {
    const e595Pass = (s: MasterSpec) =>
      s.tmlPct !== null && s.tmlPct <= 1.0 && s.cvcmPct !== null && s.cvcmPct <= 0.1;
    const invRank = (s: MasterSpec) => {
      const st = getInventoryMatch(s, materials).status;
      return st === "in-stock" ? 0 : st === "tracked" ? 1 : 2;
    };
    const getKey = (s: MasterSpec): string | number | boolean | null => {
      switch (sort.key) {
        case "procure": return pendingForMe.has(s.id) ? 1 : 0;
        case "star": return s.frequentReorder ? 1 : 0;
        case "product": return (s.productName ?? "").toLowerCase();
        case "vendor": return (s.vendor ?? "").toLowerCase();
        case "form": return (s.productForm ?? "").toLowerCase();
        case "chemistry": return (s.resinChemistry ?? "").toLowerCase();
        case "cure": return s.cureTemperatureC;
        case "service": return s.maxServiceTemperatureC;
        case "e595":
          return s.tmlPct === null && s.cvcmPct === null ? -1 : e595Pass(s) ? 1 : 0;
        case "inventory": return invRank(s);
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...matched].sort((a, b) => {
      const av = getKey(a);
      const bv = getKey(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [matched, sort, pendingForMe, materials]);

  const inStockCount = useMemo(
    () => matched.filter((s) => getInventoryMatch(s, materials).status === "in-stock").length,
    [matched, materials],
  );

  // Reset pagination whenever the filtered result set changes.
  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [matched.length, sort.key, sort.dir]);

  const visibleSorted = useMemo(() => sorted.slice(0, visibleLimit), [sorted, visibleLimit]);

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
    filters.profiles.length +
    filters.keySpecs.length +
    filters.customers.length +
    Object.values(filters.flags).filter((v) => v !== undefined).length +
    [filters.cureC, filters.peakTgC, filters.maxServiceC, filters.outLifeDays, filters.tmlPct, filters.cvcmPct]
      .filter((r) => r.min !== undefined || r.max !== undefined).length +
    (filters.inventory !== "any" ? 1 : 0) +
    (filters.e595 !== "any" ? 1 : 0);

  return (
    <DashboardLayout>
      <div className="px-5 py-5 space-y-4">
        {/* Top full-width search bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Search by name, chemistry, application, keyword…"
            className="w-full pl-10 pr-3 py-2.5 bg-card rounded-[10px] text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-1"
            style={{ border: "0.5px solid var(--accent-blue-border)" }}
          />
        </div>

        {isEmpty ? (
          <div className="bg-card border border-border rounded-[10px] p-16 text-center">
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

                <FilterSection title="NASA E595">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["any", "pass", "fail"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setFilters({ ...filters, e595: v })}
                        className={`text-xs px-2 py-1.5 rounded border ${
                          filters.e595 === v
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {v === "any" ? "Any" : v === "pass" ? "Pass" : "Fail"}
                      </button>
                    ))}
                  </div>
                </FilterSection>

                <ChipFilter
                  title="Key Spec"
                  options={allKeySpecs}
                  selected={filters.keySpecs}
                  onChange={(v) => setFilters({ ...filters, keySpecs: v })}
                  emptyHint="No key spec numbers tagged yet. Re-upload a spec sheet or PDF on the Master Specs page to populate (e.g. BMS5-101, AMS3819, MIL-PRF-83282)."
                />

                <ChipFilter
                  title="Customer"
                  options={allCustomers}
                  selected={filters.customers}
                  onChange={(v) => setFilters({ ...filters, customers: v })}
                  emptyHint="No customers tagged yet. Re-upload a spec sheet or PDF on the Master Specs page to populate (Boeing, Lockheed, Bell, Airbus, etc.)."
                />

                <ChipFilter
                  title="Profile"
                  options={[...PROFILE_OPTIONS]}
                  selected={filters.profiles}
                  onChange={(v) => setFilters({ ...filters, profiles: v })}
                />

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
                  {inStockCount} in stock
                </span>
              </div>

              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <SortHeader sortKey="procure" sort={sort} onClick={toggleSort} align="center" className="px-2 w-12" title="Procure">
                          <span className="inline-flex items-center gap-1">
                            <CheckSquare className="w-3.5 h-3.5" /> Procure
                          </span>
                        </SortHeader>
                        <SortHeader sortKey="star" sort={sort} onClick={toggleSort} align="center" className="px-2 w-10" title="Frequent reorder">★</SortHeader>
                        <SortHeader sortKey="product" sort={sort} onClick={toggleSort} align="left">Product</SortHeader>
                        <SortHeader sortKey="vendor" sort={sort} onClick={toggleSort} align="left">Vendor</SortHeader>
                        <SortHeader sortKey="form" sort={sort} onClick={toggleSort} align="left">Form</SortHeader>
                        <SortHeader sortKey="chemistry" sort={sort} onClick={toggleSort} align="left">Chemistry</SortHeader>
                        <SortHeader sortKey="cure" sort={sort} onClick={toggleSort} align="center">Cure °C</SortHeader>
                        <SortHeader sortKey="service" sort={sort} onClick={toggleSort} align="center">Service °C</SortHeader>
                        <SortHeader sortKey="e595" sort={sort} onClick={toggleSort} align="center">E595</SortHeader>
                        <SortHeader sortKey="inventory" sort={sort} onClick={toggleSort} align="right">Inventory</SortHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="text-center py-12 text-muted-foreground text-sm">
                            No specs match these filters.
                          </td>
                        </tr>
                      ) : (
                        visibleSorted.map((spec) => {
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
                                    spec.frequentReorder ? "text-[var(--metal-silver)] drop-shadow-[0_0_2px_rgba(255,255,255,0.25)]" : "text-muted-foreground/40"
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
                {sorted.length > visibleLimit && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
                    <span>
                      Showing {visibleLimit} of {sorted.length}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setVisibleLimit((n) => n + PAGE_SIZE)}
                        className="px-3 py-1.5 rounded border border-border hover:bg-accent text-foreground"
                      >
                        Show {Math.min(PAGE_SIZE, sorted.length - visibleLimit)} more
                      </button>
                      <button
                        onClick={() => setVisibleLimit(sorted.length)}
                        className="px-3 py-1.5 rounded border border-border hover:bg-accent text-foreground"
                      >
                        Show all
                      </button>
                    </div>
                  </div>
                )}
              </div>

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

function SortHeader({
  sortKey, sort, onClick, align = "left", className = "", title, children,
}: {
  sortKey: string;
  sort: { key: string; dir: "asc" | "desc" };
  onClick: (k: never) => void;
  align?: "left" | "center" | "right";
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "";
  const alignCls = align === "center" ? "text-center justify-center" : align === "right" ? "text-right justify-end" : "text-left justify-start";
  return (
    <th className={`${align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"} py-2 font-medium ${className || "px-3"}`} title={title}>
      <button
        type="button"
        onClick={() => onClick(sortKey as never)}
        className={`inline-flex items-center gap-1 ${alignCls} w-full uppercase ${active ? "text-foreground" : "hover:text-foreground"}`}
      >
        {children}
        {arrow && <span className="text-[9px]">{arrow}</span>}
      </button>
    </th>
  );
}

function FilterSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const storageKey = `engineer.filterSection.${title}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch {}
    return defaultOpen;
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {}
  }, [open, storageKey]);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left group"
        aria-expanded={open}
      >
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
          {title}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && children}
    </div>
  );
}

function groupByKeyword(options: string[]): {
  groups: { keyword: string; options: string[] }[];
  singles: string[];
} {
  const buckets = new Map<string, string[]>();
  for (const opt of options) {
    const words = opt.split(/\s+/);
    if (words.length < 2) continue;
    const last = words[words.length - 1].toLowerCase();
    const arr = buckets.get(last) ?? [];
    arr.push(opt);
    buckets.set(last, arr);
  }
  const grouped = new Set<string>();
  const groups: { keyword: string; options: string[] }[] = [];
  for (const [key, opts] of buckets) {
    if (opts.length >= 2) {
      opts.forEach((o) => grouped.add(o));
      groups.push({
        keyword: key.charAt(0).toUpperCase() + key.slice(1),
        options: opts.slice().sort((a, b) => a.localeCompare(b)),
      });
    }
  }
  groups.sort((a, b) => a.keyword.localeCompare(b.keyword));
  const singles = options.filter((o) => !grouped.has(o));
  return { groups, singles };
}

function ChipFilter({
  title, options, selected, onChange, emptyHint,
}: { title: string; options: string[]; selected: string[]; onChange: (v: string[]) => void; emptyHint?: string }) {
  if (options.length === 0 && !emptyHint) return null;
  const { groups, singles } = groupByKeyword(options);

  const Pill = ({ opt }: { opt: string }) => {
    const on = selected.some((v) => canon(v) === canon(opt));
    return (
      <button
        onClick={() =>
          onChange(on ? selected.filter((v) => canon(v) !== canon(opt)) : [...selected, opt])
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
  };

  return (
    <FilterSection title={title}>
      {options.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">{emptyHint}</p>
      ) : (
        <div className="space-y-2">
          {singles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {singles.map((opt) => <Pill key={opt} opt={opt} />)}
            </div>
          )}
          {groups.map((g) => {
            const selectedCount = g.options.filter((o) =>
              selected.some((v) => canon(v) === canon(o)),
            ).length;
            return (
              <details key={g.keyword} className="group/sub" open={selectedCount > 0}>
                <summary className="flex items-center justify-between cursor-pointer list-none py-1 px-2 -mx-2 rounded hover:bg-accent/50">
                  <span className="text-[11px] text-foreground flex items-center gap-1.5">
                    <ChevronDown className="w-3 h-3 transition-transform group-open/sub:rotate-0 -rotate-90" />
                    {g.keyword}
                    <span className="text-muted-foreground">({g.options.length})</span>
                    {selectedCount > 0 && (
                      <span className="text-[10px] font-mono px-1 rounded bg-foreground text-background">
                        {selectedCount}
                      </span>
                    )}
                  </span>
                </summary>
                <div className="flex flex-wrap gap-1 pl-4 pt-1.5">
                  {g.options.map((opt) => <Pill key={opt} opt={opt} />)}
                </div>
              </details>
            );
          })}
        </div>
      )}
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
          {(spec.keySpecs ?? []).length > 0 && (
            <DrawerSection title="Key Specifications" tone="primary">
              <p className="text-[11px] text-muted-foreground mb-2">
                Universal/OEM spec numbers. Search any of these in the search bar to find every manufacturer's equivalent.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {spec.keySpecs.map((k) => (
                  <span key={k} className="text-xs font-mono px-2 py-1 rounded border border-border bg-background text-foreground">
                    {k}
                  </span>
                ))}
              </div>
            </DrawerSection>
          )}

          {(spec.customers ?? []).length > 0 && (
            <DrawerSection title="Customers / OEMs" tone="primary">
              <div className="flex flex-wrap gap-1.5">
                {spec.customers.map((c) => (
                  <span key={c} className="text-xs uppercase tracking-wider px-2 py-1 rounded border border-border bg-background text-foreground">
                    {c}
                  </span>
                ))}
              </div>
            </DrawerSection>
          )}

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
