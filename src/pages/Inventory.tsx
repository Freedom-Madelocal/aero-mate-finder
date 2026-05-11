import DashboardLayout from "@/components/DashboardLayout";
import StockReportUpload from "@/components/StockReportUpload";
import StatusTooltip from "@/components/StatusTooltip";
import { Search, Filter, Plus, ChevronDown, Package, TruckIcon, Upload, FileSpreadsheet, X, Info, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMaterialStore, addMaterials, clearAllData, getStore, STATUS_TOOLTIPS, METRIC_TOOLTIPS } from "@/data/materials";
import type { Material, StockReportRecord } from "@/data/materials";
import { toast } from "sonner";

/*
 * Design: Material Intelligence — Dark Industrial Minimalism
 * Inventory page: Product catalog view with volumes (available + incoming).
 * Click any row to drill into MaterialDetail with COA/COC data.
 * Upload Stock Report: Ingest Excel/CSV, auto-map columns, add custom columns.
 * All data comes from the shared reactive store — no hardcoded mock data.
 */

export default function Inventory() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("All");
  const [formFilter, setFormFilter] = useState("All");
  const [chemistryFilter, setChemistryFilter] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showReportBanner, setShowReportBanner] = useState(false);

  const store = useMaterialStore();
  // Safety net: also read directly from getStore() so we never show stale data
  // even if the snapshot hasn't propagated yet from a just-closed modal.
  const materials = store.materials.length > 0 ? store.materials : getStore().materials;

  // Derive filter options dynamically from actual data
  const suppliers = useMemo(() => {
    const set = new Set(materials.map((m: Material) => m.supplier));
    return ["All", ...Array.from(set).sort()];
  }, [materials]);

  const forms = useMemo((): string[] => {
    const set = new Set(materials.map((m: Material) => m.form).filter((f): f is string => !!f && f !== "—"));
    return ["All", ...Array.from(set).sort()];
  }, [materials]);

  const chemistries = useMemo((): string[] => {
    const set = new Set(materials.map((m: Material) => m.chemistry).filter((c): c is string => !!c && c !== "—"));
    return ["All", ...Array.from(set).sort()];
  }, [materials]);

  // Derive all custom columns from materials
  const customColumns = useMemo(() => {
    const colSet = new Set<string>();
    materials.forEach((m: Material) => {
      if (m.customFields) {
        Object.keys(m.customFields).forEach((k) => colSet.add(k));
      }
    });
    return Array.from(colSet).sort();
  }, [materials]);

  const filtered = materials.filter((m: Material) => {
    const matchesSearch =
      search === "" ||
      m.product.toLowerCase().includes(search.toLowerCase()) ||
      m.supplier.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase()) ||
      (m.formerName && m.formerName.toLowerCase().includes(search.toLowerCase())) ||
      (m.notes && m.notes.toLowerCase().includes(search.toLowerCase())) ||
      (m.customFields && Object.values(m.customFields).some(
        (v) => v !== null && String(v).toLowerCase().includes(search.toLowerCase())
      ));
    const matchesSupplier = supplierFilter === "All" || m.supplier === supplierFilter;
    const matchesForm = formFilter === "All" || m.form === formFilter;
    const matchesChemistry = chemistryFilter === "All" || m.chemistry === chemistryFilter;
    return matchesSearch && matchesSupplier && matchesForm && matchesChemistry;
  });

  const totalAvailable = filtered.reduce((sum: number, m: Material) => sum + m.availableQty, 0);
  const totalIncoming = filtered.reduce((sum: number, m: Material) => sum + m.incomingQty, 0);
  const totalProducts = filtered.length;

  // Handle stock report ingestion via the shared store
  const handleIngest = async (data: {
    rows: Record<string, string | number | null>[];
    mappings: { sourceColumn: string; mappedTo: string | null; isCustom: boolean }[];
    customColumns: string[];
    fileName: string;
  }) => {
    // Build mapping lookup: sourceColumn -> mappedTo
    const mappingLookup: Record<string, string | null> = {};
    data.mappings.forEach((m) => {
      mappingLookup[m.sourceColumn] = m.mappedTo;
    });

    // Convert rows to Material objects, filtering out section header rows
    const newMaterials: Material[] = data.rows
      .map((row, index) => {
        const mapped: Record<string, any> = {};
        const custom: Record<string, string> = {};

        Object.entries(row).forEach(([col, value]) => {
          const target = mappingLookup[col];
          if (target && target !== "__custom__") {
            mapped[target] = value;
          } else {
            // Custom column
            if (value !== null && value !== undefined) {
              custom[col] = String(value);
            }
          }
        });

        const product = String(mapped.product ?? mapped.grade ?? "");
        const supplier = String(mapped.supplier ?? "");

        // Skip section header rows (contain ▸ or are empty product names or look like titles)
        if (
          !product ||
          product.startsWith("▸") ||
          product.startsWith("Item-") ||
          supplier.startsWith("▸") ||
          (supplier.length > 40 && !mapped.form) // Long supplier names with no form = section header
        ) {
          return null;
        }

      return {
        id: `SR-${data.fileName.replace(/\.[^.]+$/, "").replace(/\s+/g, "-")}-${index + 1}`,
        supplier,
        product,
        formerName: mapped.formerName ? String(mapped.formerName) : null,
        form: String(mapped.form ?? "—"),
        chemistry: String(mapped.chemistry ?? "—"),
        maxServiceTemp: mapped.maxServiceTemp ? String(mapped.maxServiceTemp) : "—",
        cureTemp: mapped.cureTemp ? String(mapped.cureTemp) : "—",
        ooaCapable: mapped.ooaCapable ? String(mapped.ooaCapable) : "—",
        nasaE595: mapped.nasaE595 ? String(mapped.nasaE595) : "—",
        notes: mapped.notes ? String(mapped.notes) : null,
        availableQty: Number(mapped.availableQty) || 0,
        availableUnit: String(mapped.unit ?? "units"),
        incomingQty: Number(mapped.incomingQty) || 0,
        incomingEta: null as string | null,
        totalLots: 0,
        activeLots: 0,
        customFields: Object.keys(custom).length > 0 ? custom : undefined,
        source: "stock-report" as const,
        stockReportName: data.fileName,
      };
    }).filter(Boolean) as Material[];

    const report: StockReportRecord = {
      fileName: data.fileName,
      uploadedAt: new Date().toLocaleString(),
      rowCount: data.rows.length,
      customColumns: data.customColumns,
    };

    // Use the shared store's addMaterials with fuzzy matching
    try {
      await addMaterials(newMaterials, report);
      setShowReportBanner(true);
      toast.success(`Ingested ${data.rows.length} rows from ${data.fileName}`, {
        description: data.customColumns.length > 0
          ? `${data.customColumns.length} custom column${data.customColumns.length !== 1 ? "s" : ""} added: ${data.customColumns.join(", ")}`
          : "All columns mapped to known fields. Fuzzy matching applied to prevent duplicates.",
      });
    } catch (err) {
      toast.error("Failed to save stock report", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const isEmpty = materials.length === 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Material Inventory
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isEmpty
                ? "Upload a stock report to populate your inventory"
                : `${materials.length} products across ${suppliers.length - 1} suppliers — click any row for COA/COC details`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-accent transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Stock Report
            </button>
            <button
              onClick={() => toast("Receive Material workflow coming soon")}
              className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Receive Material
            </button>
          </div>
        </div>

        {/* Ingested report banner */}
        {showReportBanner && store.stockReports.length > 0 && (
          <div className="bg-[oklch(0.55_0.15_250_/_0.06)] border border-[oklch(0.55_0.15_250_/_0.15)] rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="w-4 h-4 text-[var(--status-info)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-foreground font-medium">
                    {store.stockReports.length} stock report{store.stockReports.length !== 1 ? "s" : ""} ingested
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {store.stockReports.map((report, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">{report.fileName}</span>
                        <span>{report.rowCount} rows</span>
                        {report.customColumns.length > 0 && (
                          <span className="text-[var(--status-info)]">
                            +{report.customColumns.length} custom col{report.customColumns.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        <span className="text-muted-foreground/50">{report.uploadedAt}</span>
                      </div>
                    ))}
                  </div>
                  {customColumns.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Custom columns:</span>
                      {customColumns.map((col) => (
                        <StatusTooltip key={col} content="Custom column added from stock report upload. Shows application-specific data for each material.">
                          <span className="text-xs font-mono bg-[oklch(0.55_0.15_250_/_0.12)] text-[var(--status-info)] px-1.5 py-0.5 rounded">
                            {col}
                          </span>
                        </StatusTooltip>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (confirm("Clear all uploaded data? This will remove all materials from the platform.")) {
                      clearAllData();
                      setShowReportBanner(false);
                      toast.success("All data cleared");
                    }
                  }}
                  className="text-muted-foreground hover:text-[var(--status-critical)] transition-colors p-1"
                  title="Clear all data"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowReportBanner(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {isEmpty ? (
          <div className="bg-card border border-border rounded-lg p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Package className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">No Materials in Inventory</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Upload an Excel or CSV stock report to populate your inventory.
              The system will auto-detect columns, map known fields, and create custom columns for any new data.
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 bg-foreground text-background px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Upload className="w-4 h-4" />
              Upload Stock Report
            </button>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatusTooltip content={METRIC_TOOLTIPS.unitsAvailable}>
                <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 w-full">
                  <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center">
                    <Package className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold font-mono text-foreground">{totalAvailable}</p>
                    <p className="text-xs text-muted-foreground">Units Available</p>
                  </div>
                </div>
              </StatusTooltip>
              <StatusTooltip content={METRIC_TOOLTIPS.unitsIncoming}>
                <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 w-full">
                  <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center">
                    <TruckIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold font-mono text-foreground">{totalIncoming}</p>
                    <p className="text-xs text-muted-foreground">Units Incoming</p>
                  </div>
                </div>
              </StatusTooltip>
              <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center">
                  <Filter className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold font-mono text-foreground">{totalProducts}</p>
                  <p className="text-xs text-muted-foreground">Products Shown</p>
                </div>
              </div>
            </div>

            {/* Search and filters */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by product, supplier, chemistry, or notes..."
                    className="w-full bg-secondary border border-border rounded-md pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {/* Supplier quick-filter pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {suppliers.slice(0, 5).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSupplierFilter(s)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        supplierFilter === s
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors border border-border"
                >
                  <Filter className="w-3 h-3" />
                  Filters
                  <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Expanded filters */}
              {showFilters && (
                <div className="flex items-center gap-6 bg-card border border-border rounded-lg p-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Supplier</label>
                    <select
                      value={supplierFilter}
                      onChange={(e) => setSupplierFilter(e.target.value)}
                      className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {suppliers.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Form</label>
                    <select
                      value={formFilter}
                      onChange={(e) => setFormFilter(e.target.value)}
                      className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {forms.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Chemistry</label>
                    <select
                      value={chemistryFilter}
                      onChange={(e) => setChemistryFilter(e.target.value)}
                      className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {chemistries.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      setSupplierFilter("All");
                      setFormFilter("All");
                      setChemistryFilter("All");
                      setSearch("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-5"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {/* Product table */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Product
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Supplier
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Form / Chemistry
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Max Temp
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <StatusTooltip content={METRIC_TOOLTIPS.unitsAvailable}>
                          Available
                          <Info className="w-3 h-3 ml-1 text-muted-foreground/40" />
                        </StatusTooltip>
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <StatusTooltip content={METRIC_TOOLTIPS.unitsIncoming}>
                          Incoming
                          <Info className="w-3 h-3 ml-1 text-muted-foreground/40" />
                        </StatusTooltip>
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <StatusTooltip content="NASA ASTM E595 outgassing test. ✓ Pass = TML ≤ 1.0%, CVCM ≤ 0.1%. 'Verify' = depends on grade/lot.">
                          NASA E595
                          <Info className="w-3 h-3 ml-1 text-muted-foreground/40" />
                        </StatusTooltip>
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <StatusTooltip content="Out-of-Autoclave capable. 'Yes' = can cure with vacuum bag only. 'No' = requires autoclave.">
                          OOA
                          <Info className="w-3 h-3 ml-1 text-muted-foreground/40" />
                        </StatusTooltip>
                      </th>
                      {/* Custom columns from ingested stock reports */}
                      {customColumns.map((col) => (
                        <th
                          key={col}
                          className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider whitespace-nowrap text-[var(--status-info)]"
                        >
                          <StatusTooltip content={`Custom column from stock report. Shows application-specific data for "${col}".`}>
                            {col}
                            <Info className="w-3 h-3 ml-1 text-[var(--status-info)]/40" />
                          </StatusTooltip>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((material: Material) => (
                      <tr
                        key={material.id}
                        onClick={() => navigate({ to: "/material/$id", params: { id: String(material.id) } })}
                        className="border-b border-border/50 hover:bg-accent/20 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div>
                              <span className="text-foreground text-sm font-medium group-hover:text-white transition-colors">
                                {material.product}
                              </span>
                              {material.formerName && (
                                <p className="text-xs text-muted-foreground/60 mt-0.5">
                                  {material.formerName}
                                </p>
                              )}
                            </div>
                            {material.source === "stock-report" && (
                              <StatusTooltip content={STATUS_TOOLTIPS["stock-report-badge"]}>
                                <span className="text-[8px] font-mono bg-[oklch(0.55_0.15_250_/_0.12)] text-[var(--status-info)] px-1 py-0.5 rounded leading-none flex-shrink-0">
                                  SR
                                </span>
                              </StatusTooltip>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-muted-foreground">{material.supplier}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">
                              {material.form}
                            </span>
                            <span className="text-xs text-muted-foreground">{material.chemistry}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm font-mono text-muted-foreground">
                            {material.maxServiceTemp === "—" ? "—" : material.maxServiceTemp.includes("°C") ? material.maxServiceTemp : `${material.maxServiceTemp}°C`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div>
                            <span className="text-sm font-mono text-foreground font-medium">
                              {material.availableQty}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">
                              {material.availableUnit}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {material.incomingQty > 0 ? (
                            <StatusTooltip content={STATUS_TOOLTIPS["incoming-qty"]}>
                              <div className="flex items-center justify-end gap-1.5">
                                <TruckIcon className="w-3 h-3 text-[var(--status-info)]" />
                                <span className="text-sm font-mono text-[var(--status-info)]">
                                  +{material.incomingQty}
                                </span>
                              </div>
                            </StatusTooltip>
                          ) : (
                            <span className="text-sm text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <StatusTooltip
                            content={
                              material.nasaE595 === "✓"
                                ? STATUS_TOOLTIPS["nasa-pass"]
                                : material.nasaE595 === "—"
                                ? STATUS_TOOLTIPS["nasa-na"]
                                : STATUS_TOOLTIPS["nasa-verify"]
                            }
                          >
                            <span
                              className={`text-xs font-medium ${
                                material.nasaE595 === "✓"
                                  ? "text-[var(--status-compliant)]"
                                  : material.nasaE595 === "—"
                                  ? "text-muted-foreground/40"
                                  : "text-[var(--status-warning)]"
                              }`}
                            >
                              {material.nasaE595 === "✓" ? "Pass" : material.nasaE595 === "—" ? "—" : "Verify"}
                            </span>
                          </StatusTooltip>
                        </td>
                        <td className="py-3 px-4">
                          <StatusTooltip
                            content={
                              material.ooaCapable === "Yes"
                                ? STATUS_TOOLTIPS["ooa-yes"]
                                : material.ooaCapable === "—"
                                ? "No OOA data available for this material."
                                : STATUS_TOOLTIPS["ooa-no"]
                            }
                          >
                            <span
                              className={`text-xs ${
                                material.ooaCapable === "Yes"
                                  ? "text-[var(--status-compliant)]"
                                  : material.ooaCapable === "—"
                                  ? "text-muted-foreground/40"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {material.ooaCapable}
                            </span>
                          </StatusTooltip>
                        </td>
                        {/* Custom column values */}
                        {customColumns.map((col) => {
                          const value = material.customFields?.[col];
                          return (
                            <td key={col} className="py-3 px-4">
                              <StatusTooltip
                                content={
                                  value === "✓" ? STATUS_TOOLTIPS["custom-check"]
                                    : value === "✗" ? STATUS_TOOLTIPS["custom-cross"]
                                    : STATUS_TOOLTIPS["custom-dash"]
                                }
                              >
                                <span
                                  className={`text-xs font-mono ${
                                    value === "✓"
                                      ? "text-[var(--status-compliant)]"
                                      : value === "✗"
                                      ? "text-muted-foreground/50"
                                      : "text-muted-foreground/30"
                                  }`}
                                >
                                  {value || "—"}
                                </span>
                              </StatusTooltip>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table footer */}
              <div className="border-t border-border px-4 py-3 flex items-center justify-between bg-secondary/20">
                <span className="text-xs text-muted-foreground">
                  Showing {filtered.length} of {materials.length} products
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {store.stockReports.length > 0
                    ? `Source: ${store.stockReports.map((r) => r.fileName).join(", ")}`
                    : "No stock reports uploaded"}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Upload modal */}
      <StockReportUpload
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onIngest={handleIngest}
      />
    </DashboardLayout>
  );
}
