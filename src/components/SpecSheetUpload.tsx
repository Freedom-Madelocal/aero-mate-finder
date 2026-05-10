import { useState, useRef, useCallback } from "react";
import {
  Upload,
  X,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { addMasterSpecs, type MasterSpec } from "@/data/masterSpecs";
import { toast } from "sonner";

/* Spec sheet uploader — parses CSV/XLSX and upserts into master_specs. */

// Source-column → MasterSpec field mapping. Each entry lists header aliases
// (lowercased). Anything not matched is dropped (master schema is fixed).
const FIELD_MAP: { key: keyof MasterSpec; aliases: string[]; type: "text" | "number" | "bool" }[] = [
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

export default function SpecSheetUpload({ isOpen, onClose, onComplete }: SpecSheetUploadProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rawData, setRawData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<{ source: string; target: keyof MasterSpec | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep(1);
    setFileName("");
    setRawData([]);
    setHeaders([]);
    setMappings([]);
    setError(null);
    setIsProcessing(false);
    setIsDragging(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const parseFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);
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

  const isValidFile = (f: File) =>
    /\.(xlsx|xls|csv)$/i.test(f.name);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && isValidFile(f)) parseFile(f);
    else setError("Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.");
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && isValidFile(f)) parseFile(f);
    else setError("Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.");
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

  const handleIngest = async () => {
    setIsProcessing(true);
    try {
      const lookup = new Map(mappings.filter((m) => m.target).map((m) => [m.source, m.target!]));
      const specs: Partial<MasterSpec>[] = rawData.map((row) => {
        const out: Partial<MasterSpec> = {};
        for (const [src, val] of Object.entries(row)) {
          const target = lookup.get(src);
          if (!target) continue;
          const fdef = FIELD_MAP.find((f) => f.key === target);
          if (!fdef) continue;
          if (fdef.type === "bool") (out as Record<string, unknown>)[target] = coerceBool(val);
          else if (fdef.type === "number") (out as Record<string, unknown>)[target] = coerceNumber(val);
          else (out as Record<string, unknown>)[target] = val == null ? null : String(val);
        }
        return out;
      });
      const valid = specs.filter((s) => s.vendor && s.productName);
      if (valid.length === 0) {
        toast.error("No rows had both Vendor and Product Name. Map those columns and try again.");
        setIsProcessing(false);
        return;
      }
      await addMasterSpecs(valid, fileName);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Upload Spec Sheet</h2>
              <p className="text-xs text-muted-foreground">
                {step === 1 ? "Add to the canonical master spec list" : "Confirm column mappings"}
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
                    <p className="text-sm text-muted-foreground">Analyzing {fileName}...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground font-medium">Drop a spec sheet here, or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv — must include Vendor and Product Name columns</p>
                    </div>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleSelect} className="hidden" />
              </div>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[oklch(0.63_0.2_25_/_0.08)] border border-[oklch(0.63_0.2_25_/_0.2)]">
                  <AlertCircle className="w-4 h-4 text-[var(--status-critical)] flex-shrink-0" />
                  <p className="text-sm text-[var(--status-critical)]">{error}</p>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
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
        </div>

        {step === 2 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/20">
            <button onClick={handleClose} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            <button
              onClick={handleIngest}
              disabled={isProcessing || !hasVendor || !hasProduct}
              className="inline-flex items-center gap-2 bg-foreground text-background rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Add {rawData.length} row{rawData.length === 1 ? "" : "s"} to master list
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
