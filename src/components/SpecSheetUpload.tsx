import { useState, useRef, useCallback } from "react";
import {
  Upload,
  X,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { addMasterSpecs, type MasterSpec } from "@/data/masterSpecs";
import { extractSpecsFromPdf } from "@/lib/specPdfExtract.functions";
import { toast } from "sonner";

/* Spec sheet uploader — parses CSV/XLSX/PDF and upserts into master_specs.
 * - Spreadsheet flow: column-mapping → ingest.
 * - PDF flow: Lovable AI (Gemini 2.5 Pro) extracts canonical rows + profile tags
 *   from section headings; user reviews & accepts/rejects rows. */

const FIELD_MAP: { key: keyof MasterSpec; aliases: string[]; type: "text" | "number" | "bool" | "keyspec" | "customer" }[] = [
  { key: "vendor", type: "text", aliases: ["vendor", "supplier", "manufacturer", "mfg", "brand"] },
  { key: "productName", type: "text", aliases: ["product name", "product", "grade", "material", "material name", "part number", "p/n"] },
  { key: "productFamily", type: "text", aliases: ["product family", "family"] },
  { key: "materialCategory", type: "text", aliases: ["material category", "category", "type"] },
  { key: "resinChemistry", type: "text", aliases: ["resin chemistry", "chemistry", "resin", "resin system"] },
  { key: "reinforcement", type: "text", aliases: ["reinforcement", "fiber", "fiber type"] },
  { key: "productForm", type: "text", aliases: ["product form", "form", "format"] },
  { key: "cureTemperatureC", type: "number", aliases: ["cure temperature (°c)", "cure temperature", "cure temp", "cure temp (c)"] },
  { key: "cureTime", type: "text", aliases: ["cure time"] },
  { key: "dryTgOnsetC", type: "number", aliases: ["dry tg onset (°c)", "dry tg onset", "dry tg"] },
  { key: "wetTgC", type: "number", aliases: ["wet tg (°c)", "wet tg"] },
  { key: "peakTgC", type: "number", aliases: ["peak tg (°c)", "peak tg"] },
  { key: "maxServiceTemperatureC", type: "number", aliases: ["max service temperature (°c)", "max service temperature", "max service temp", "max temp"] },
  { key: "outLifeDays", type: "number", aliases: ["out life (days)", "out life", "out time"] },
  { key: "freezerLifeMonths", type: "number", aliases: ["freezer life (months)", "freezer life"] },
  { key: "tmlPct", type: "number", aliases: ["tml (%)", "tml"] },
  { key: "cvcmPct", type: "number", aliases: ["cvcm (%)", "cvcm"] },
  { key: "tensileLapShearMpa", type: "number", aliases: ["tensile lap shear (mpa)", "lap shear", "tensile lap shear"] },
  { key: "tPeelN25mm", type: "number", aliases: ["t-peel (n/25mm)", "t-peel", "t peel"] },
  { key: "flatwiseTensionMpa", type: "number", aliases: ["flatwise tension (mpa)", "flatwise tension"] },
  { key: "climbingDrumPeelInLbIn", type: "number", aliases: ["climbing drum peel (in·lb/in)", "climbing drum peel", "cdp"] },
  { key: "processMethod", type: "text", aliases: ["process method", "process"] },
  { key: "ooaVboCapable", type: "bool", aliases: ["ooa / vbo capable", "ooa", "ooa capable", "vbo"] },
  { key: "toughened", type: "bool", aliases: ["toughened"] },
  { key: "flameRetardant", type: "bool", aliases: ["flame retardant", "fr"] },
  { key: "lowDielectric", type: "bool", aliases: ["low dielectric"] },
  { key: "lowMoistureAbsorption", type: "bool", aliases: ["low moisture absorption", "low moisture"] },
  { key: "impactResistant", type: "bool", aliases: ["impact resistant"] },
  { key: "highTemperature", type: "bool", aliases: ["high temperature", "high temp"] },
  { key: "applications", type: "text", aliases: ["applications", "application"] },
  { key: "qualificationsStandards", type: "text", aliases: ["qualifications / standards", "qualifications", "standards"] },
  { key: "crossoverProduct", type: "text", aliases: ["crossover / equivalent product", "crossover product", "equivalent"] },
  { key: "crossoverVendor", type: "text", aliases: ["crossover vendor", "equivalent vendor"] },
  { key: "notes", type: "text", aliases: ["notes", "comments", "remarks", "description"] },
  { key: "minimumOrderQuantity", type: "text", aliases: ["minimum order quantity (moq)", "minimum order quantity", "moq"] },
  { key: "sourceDocument", type: "text", aliases: ["source document", "source"] },
  // Key Spec — universal/OEM spec numbers (BMS, AMS, MIL, AIMS, etc.). Multiple
  // columns can map to keySpecs (e.g. one per OEM); values are unioned. Cell
  // values may also be comma/semicolon-separated lists.
  { key: "keySpecs", type: "keyspec", aliases: [
    "key spec", "key specs", "key specification", "key specification number", "key spec number", "key spec numbers",
    "spec number", "specification number", "spec no", "spec #",
    "boeing spec", "boeing", "bms",
    "airbus spec", "airbus", "aims", "abs",
    "bell spec", "bell", "bps",
    "lockheed spec", "lockheed", "stm",
    "northrop spec", "northrop", "nai",
    "sikorsky spec", "sikorsky",
    "mil spec", "mil-spec", "military spec",
    "ams", "sae ams", "ams spec",
    "astm", "iso spec", "en spec", "din spec",
    "oem spec", "qualified to", "qpl",
  ] },
  // Customer — OEMs / end-users this part is qualified for. Multiple columns
  // can map (e.g. "Customer", "OEM", "End User"); values are comma/semicolon-
  // separated lists and unioned across mapped columns.
  { key: "customers", type: "customer", aliases: [
    "customer", "customers", "customer name", "end user", "end-user", "enduser",
    "oem", "oems", "platform", "operator", "approved by", "qualified for",
  ] },
];

interface ParsedRow { [k: string]: string | number | null }

interface SpecSheetUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();
}

function autoMap(header: string): keyof MasterSpec | null {
  const norm = normalizeHeader(header);
  for (const f of FIELD_MAP) {
    if (f.aliases.some((a) => norm === a || norm.includes(a))) return f.key;
  }
  return null;
}

type Mode = "spreadsheet" | "pdf";

interface PdfReviewRow {
  spec: Partial<MasterSpec>;
  selected: boolean;
}

export default function SpecSheetUpload({ isOpen, onClose, onComplete }: SpecSheetUploadProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<Mode>("spreadsheet");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rawData, setRawData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<{ source: string; target: keyof MasterSpec | null }[]>([]);
  const [pdfRows, setPdfRows] = useState<PdfReviewRow[]>([]);
  const [pdfProfiles, setPdfProfiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractPdf = useServerFn(extractSpecsFromPdf);

  const reset = useCallback(() => {
    setStep(1);
    setMode("spreadsheet");
    setFileName("");
    setRawData([]);
    setHeaders([]);
    setMappings([]);
    setPdfRows([]);
    setPdfProfiles([]);
    setError(null);
    setIsProcessing(false);
    setIsDragging(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const parseSpreadsheet = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setMode("spreadsheet");
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      let json = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: null });
      json = json.filter((r) => Object.values(r).some((v) => v !== null && v !== ""));
      if (json.length === 0) {
        setError("No data rows found.");
        setIsProcessing(false);
        return;
      }
      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setRawData(json);
      setMappings(hdrs.map((h) => ({ source: h, target: autoMap(h) })));
      setIsProcessing(false);
      setStep(2);
    } catch (err) {
      setError(`Failed to parse file: ${err instanceof Error ? err.message : "Unknown error"}`);
      setIsProcessing(false);
    }
  };

  const parsePdf = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setMode("pdf");
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      // Convert to base64 in chunks (avoid large-string call stack issues)
      const bytes = new Uint8Array(buf);
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const fileBase64 = btoa(bin);
      const result = await extractPdf({ data: { fileBase64, fileName: file.name } });
      if (!result.rows || result.rows.length === 0) {
        setError("AI did not find any products in this PDF.");
        setIsProcessing(false);
        return;
      }
      const reviewRows: PdfReviewRow[] = result.rows.map((r) => {
        const hasIdentity = r.vendor && r.vendor !== "none given" && r.productName && r.productName !== "none given";
        return {
          selected: !!hasIdentity,
          spec: {
            vendor: r.vendor ?? undefined,
            productName: r.productName ?? undefined,
            productFamily: r.productFamily,
            materialCategory: r.materialCategory,
            resinChemistry: r.resinChemistry,
            reinforcement: r.reinforcement,
            productForm: r.productForm,
            cureTemperatureC: r.cureTemperatureC,
            cureTime: r.cureTime,
            dryTgOnsetC: r.dryTgOnsetC,
            wetTgC: r.wetTgC,
            peakTgC: r.peakTgC,
            maxServiceTemperatureC: r.maxServiceTemperatureC,
            outLifeDays: r.outLifeDays,
            freezerLifeMonths: r.freezerLifeMonths,
            tmlPct: r.tmlPct,
            cvcmPct: r.cvcmPct,
            tensileLapShearMpa: r.tensileLapShearMpa,
            tPeelN25mm: r.tPeelN25mm,
            flatwiseTensionMpa: r.flatwiseTensionMpa,
            climbingDrumPeelInLbIn: r.climbingDrumPeelInLbIn,
            processMethod: r.processMethod,
            ooaVboCapable: r.ooaVboCapable,
            toughened: r.toughened,
            flameRetardant: r.flameRetardant,
            lowDielectric: r.lowDielectric,
            lowMoistureAbsorption: r.lowMoistureAbsorption,
            impactResistant: r.impactResistant,
            highTemperature: r.highTemperature,
            applications: r.applications,
            qualificationsStandards: r.qualificationsStandards,
            crossoverProduct: r.crossoverProduct,
            crossoverVendor: r.crossoverVendor,
            notes: r.notes,
            minimumOrderQuantity: r.minimumOrderQuantity,
            profiles: r.profiles,
            keySpecs: r.keySpecs,
            customers: r.customers,
          },
        };
      });
      setPdfRows(reviewRows);
      setPdfProfiles(result.profilesDetected);
      setIsProcessing(false);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze PDF.");
      setIsProcessing(false);
    }
  };

  const isSpreadsheet = (f: File) => /\.(xlsx|xls|csv)$/i.test(f.name);
  const isPdf = (f: File) => /\.pdf$/i.test(f.name);

  const handleFile = (f: File) => {
    if (isPdf(f)) return parsePdf(f);
    if (isSpreadsheet(f)) return parseSpreadsheet(f);
    setError("Please upload an Excel (.xlsx, .xls), CSV (.csv), or PDF (.pdf) file.");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const coerceBool = (v: unknown): boolean => {
    if (typeof v === "boolean") return v;
    if (v == null) return false;
    const s = String(v).trim().toLowerCase();
    return s === "yes" || s === "y" || s === "true" || s === "1" || s === "x";
  };
  const coerceNumber = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/[^\d.\-eE]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const splitKeySpecCell = (v: unknown): string[] => {
    if (v === null || v === undefined) return [];
    return String(v)
      .split(/[,;|\n\r/]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.toLowerCase() !== "none given" && s.toLowerCase() !== "n/a" && s !== "—");
  };

  const handleIngestSpreadsheet = async () => {
    setIsProcessing(true);
    try {
      const lookup = new Map(mappings.filter((m) => m.target).map((m) => [m.source, m.target!]));
      const specs: Partial<MasterSpec>[] = rawData.map((row) => {
        const out: Partial<MasterSpec> = {};
        const keySpecBuf: string[] = [];
        for (const [src, val] of Object.entries(row)) {
          const target = lookup.get(src);
          if (!target) continue;
          const fdef = FIELD_MAP.find((f) => f.key === target);
          if (!fdef) continue;
          if (fdef.type === "bool") (out as Record<string, unknown>)[target] = coerceBool(val);
          else if (fdef.type === "number") (out as Record<string, unknown>)[target] = coerceNumber(val);
          else if (fdef.type === "keyspec") keySpecBuf.push(...splitKeySpecCell(val));
          else (out as Record<string, unknown>)[target] = val == null ? null : String(val);
        }
        if (keySpecBuf.length > 0) {
          // dedupe (case-insensitive)
          const seen = new Map<string, string>();
          for (const k of keySpecBuf) if (!seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k);
          out.keySpecs = Array.from(seen.values());
        }
        return out;
      });
      const valid = specs.filter((s) => s.vendor && s.productName);
      if (valid.length === 0) {
        toast.error("No rows had both Vendor and Product Name. Map those columns and try again.");
        setIsProcessing(false);
        return;
      }
      await addMasterSpecs(valid, fileName, "spreadsheet");
      toast.success(`Added ${valid.length} spec${valid.length === 1 ? "" : "s"} from ${fileName}`);
      onComplete?.();
      handleClose();
    } catch (err) {
      toast.error("Failed to save specs", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setIsProcessing(false);
    }
  };

  const handleIngestPdf = async () => {
    setIsProcessing(true);
    try {
      const valid = pdfRows
        .filter((r) => r.selected && r.spec.vendor && r.spec.productName)
        .map((r) => r.spec);
      if (valid.length === 0) {
        toast.error("Select at least one row with both Vendor and Product Name.");
        setIsProcessing(false);
        return;
      }
      await addMasterSpecs(valid, fileName, "pdf");
      toast.success(`Added ${valid.length} spec${valid.length === 1 ? "" : "s"} from ${fileName}`);
      onComplete?.();
      handleClose();
    } catch (err) {
      toast.error("Failed to save specs", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const mapped = mappings.filter((m) => m.target).length;
  const unmapped = mappings.length - mapped;
  const hasVendor = mappings.some((m) => m.target === "vendor");
  const hasProduct = mappings.some((m) => m.target === "productName");
  const selectedCount = pdfRows.filter((r) => r.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center">
              {mode === "pdf" ? (
                <FileText className="w-4 h-4 text-muted-foreground" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Upload Spec Sheet</h2>
              <p className="text-xs text-muted-foreground">
                {step === 1
                  ? "Add to the canonical master spec list"
                  : mode === "pdf"
                    ? "Review AI-extracted products"
                    : "Confirm column mappings"}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all ${
                  isDragging ? "border-foreground bg-accent/30" : "border-border hover:border-muted-foreground hover:bg-accent/10"
                }`}
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground">
                      {mode === "pdf" ? `Analyzing ${fileName} with AI…` : `Analyzing ${fileName}…`}
                    </p>
                    {mode === "pdf" && (
                      <p className="text-xs text-muted-foreground">This can take 20–60 seconds for large PDFs.</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground font-medium">Drop a spec sheet or PDF here, or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv — must include Vendor and Product Name columns</p>
                      <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> .pdf — AI extracts products and tags them by section (MRO, Interiors, …)
                      </p>
                    </div>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={handleSelect} className="hidden" />
              </div>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[oklch(0.63_0.2_25_/_0.08)] border border-[oklch(0.63_0.2_25_/_0.2)]">
                  <AlertCircle className="w-4 h-4 text-[var(--status-critical)] flex-shrink-0" />
                  <p className="text-sm text-[var(--status-critical)]">{error}</p>
                </div>
              )}
            </div>
          )}

          {step === 2 && mode === "spreadsheet" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-foreground font-medium">{fileName}</p>
                    <p className="text-xs text-muted-foreground">{rawData.length} rows · {mapped} mapped · {unmapped} ignored</p>
                  </div>
                </div>
              </div>

              {(!hasVendor || !hasProduct) && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[oklch(0.7_0.15_70_/_0.08)] border border-[oklch(0.7_0.15_70_/_0.2)]">
                  <AlertCircle className="w-4 h-4 text-[var(--status-warning)]" />
                  <p className="text-sm text-[var(--status-warning)]">
                    Map at least the <strong>Vendor</strong> and <strong>Product Name</strong> columns to continue.
                  </p>
                </div>
              )}

              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Source column</th>
                      <th className="text-left px-3 py-2 font-medium">Maps to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 text-foreground">{m.source}</td>
                        <td className="px-3 py-2">
                          <select
                            value={m.target ?? ""}
                            onChange={(e) => {
                              const v = e.target.value as keyof MasterSpec | "";
                              setMappings((prev) => prev.map((x, idx) => (idx === i ? { ...x, target: v || null } : x)));
                            }}
                            className="bg-background border border-border rounded px-2 py-1 text-xs w-full max-w-xs"
                          >
                            <option value="">— Ignore —</option>
                            {FIELD_MAP.map((f) => (
                              <option key={f.key} value={f.key}>{f.key}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 2 && mode === "pdf" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-4 py-3 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-foreground font-medium">{fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {pdfRows.length} products extracted · {selectedCount} selected
                      {pdfProfiles.length > 0 && <> · profiles: {pdfProfiles.join(", ")}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPdfRows((rs) => rs.map((r) => ({ ...r, selected: true })))}
                    className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => setPdfRows((rs) => rs.map((r) => ({ ...r, selected: false })))}
                    className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium w-8"></th>
                      <th className="text-left px-3 py-2 font-medium">Vendor</th>
                      <th className="text-left px-3 py-2 font-medium">Product</th>
                      <th className="text-left px-3 py-2 font-medium">Category</th>
                      <th className="text-left px-3 py-2 font-medium">Cure °C</th>
                      <th className="text-left px-3 py-2 font-medium">Tg °C</th>
                      <th className="text-left px-3 py-2 font-medium">Key Specs</th>
                      <th className="text-left px-3 py-2 font-medium">Profiles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pdfRows.map((r, i) => {
                      const incomplete = !r.spec.vendor || r.spec.vendor === "none given" || !r.spec.productName || r.spec.productName === "none given";
                      return (
                        <tr key={i} className={`border-t border-border ${incomplete ? "bg-[oklch(0.7_0.15_70_/_0.04)]" : ""}`}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={r.selected}
                              disabled={incomplete}
                              onChange={(e) =>
                                setPdfRows((rs) => rs.map((x, idx) => (idx === i ? { ...x, selected: e.target.checked } : x)))
                              }
                            />
                          </td>
                          <Cell value={r.spec.vendor} />
                          <Cell value={r.spec.productName} bold />
                          <Cell value={r.spec.materialCategory} />
                          <Cell value={r.spec.cureTemperatureC} />
                          <Cell value={r.spec.dryTgOnsetC ?? r.spec.peakTgC} />
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {(r.spec.keySpecs ?? []).length === 0 ? (
                                <span className="text-xs text-muted-foreground italic">none</span>
                              ) : (
                                r.spec.keySpecs!.map((k) => (
                                  <span key={k} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-foreground/10 text-foreground border border-border">
                                    {k}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(r.spec.profiles ?? []).length === 0 ? (
                                <span className="text-xs text-muted-foreground italic">none</span>
                              ) : (
                                r.spec.profiles!.map((p) => (
                                  <span key={p} className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-foreground">
                                    {p}
                                  </span>
                                ))
                              )}
                              {incomplete && (
                                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--status-warning)]/15 text-[var(--status-warning)]">
                                  incomplete
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Fields marked <em>none given</em> were missing from the PDF — find that data and add it later, or edit the row in master specs.
              </p>
            </div>
          )}
        </div>

        {step === 2 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/20">
            <button onClick={handleClose} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            {mode === "spreadsheet" ? (
              <button
                onClick={handleIngestSpreadsheet}
                disabled={isProcessing || !hasVendor || !hasProduct}
                className="inline-flex items-center gap-2 bg-foreground text-background rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Add {rawData.length} row{rawData.length === 1 ? "" : "s"} to master list
              </button>
            ) : (
              <button
                onClick={handleIngestPdf}
                disabled={isProcessing || selectedCount === 0}
                className="inline-flex items-center gap-2 bg-foreground text-background rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Add {selectedCount} selected to master list
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Cell({ value, bold }: { value: string | number | null | undefined; bold?: boolean }) {
  const isMissing = value === null || value === undefined || value === "none given";
  return (
    <td className={`px-3 py-2 ${bold ? "font-medium text-foreground" : "text-muted-foreground"}`}>
      {isMissing ? (
        <span className="text-xs italic text-muted-foreground">none given</span>
      ) : (
        String(value)
      )}
    </td>
  );
}
