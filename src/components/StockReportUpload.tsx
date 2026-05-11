import { useState, useRef, useCallback } from "react";
import {
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ArrowRight,
  Columns3,
  Loader2,
  Link2,
  Plus,
} from "lucide-react";
import * as XLSX from "xlsx";

/*
 * Design: Material Intelligence — Dark Industrial Minimalism
 * StockReportUpload: Multi-step modal for ingesting Excel/CSV stock reports.
 * Step 1: File upload (drag & drop or browse)
 * Step 2: Column analysis — auto-maps known fields, flags custom columns
 * Step 3: Review & confirm — preview data before ingesting
 */

// Known fields in our Material schema that we try to auto-map
const KNOWN_FIELDS: { key: string; label: string; aliases: string[] }[] = [
  { key: "product", label: "Product / Grade", aliases: ["product", "product name", "product / grade", "grade", "material", "material name", "part number", "p/n", "item"] },
  { key: "supplier", label: "Supplier", aliases: ["supplier", "manufacturer", "mfg", "vendor", "brand"] },
  { key: "form", label: "Form", aliases: ["form", "type", "product form", "material form", "format"] },
  { key: "chemistry", label: "Chemistry", aliases: ["chemistry", "resin", "resin type", "resin system", "polymer", "chemical type"] },
  { key: "maxServiceTemp", label: "Max Service Temp", aliases: ["max service temp", "max temp", "service temp", "max service temperature", "tmax", "max operating temp", "max service"] },
  { key: "cureTemp", label: "Cure Temp", aliases: ["cure temp", "cure temperature", "cure", "process temp"] },
  { key: "ooaCapable", label: "OOA Capable", aliases: ["ooa", "ooa capable", "out of autoclave", "vbo", "vacuum bag only"] },
  { key: "nasaE595", label: "NASA E595", aliases: ["nasa e595", "e595", "outgassing", "nasa outgassing", "tml", "cvcm", "nasa"] },
  { key: "availableQty", label: "Available Qty", aliases: ["available", "qty", "quantity", "stock", "on hand", "available qty", "qty on hand", "inventory", "in stock", "units"] },
  { key: "incomingQty", label: "Incoming Qty", aliases: ["incoming", "incoming qty", "on order", "ordered", "po qty", "inbound", "expected"] },
  { key: "notes", label: "Notes", aliases: ["notes", "comments", "remarks", "description", "desc"] },
  { key: "formerName", label: "Former Name", aliases: ["former name", "legacy name", "old name", "previous name", "aka", "also known as"] },
  { key: "lotNumber", label: "Lot Number", aliases: ["lot", "lot number", "lot #", "lot no", "batch", "batch number", "batch #"] },
  { key: "expirationDate", label: "Expiration Date", aliases: ["expiration", "expiry", "exp date", "expiration date", "shelf life end", "best by"] },
  { key: "location", label: "Storage Location", aliases: ["location", "storage", "warehouse", "bin", "bay", "freezer", "storage location"] },
  { key: "unit", label: "Unit", aliases: ["unit", "uom", "unit of measure", "units", "measure"] },
  { key: "price", label: "Price", aliases: ["price", "cost", "unit price", "unit cost", "$/unit"] },
  { key: "poNumber", label: "PO Number", aliases: ["po", "po number", "po #", "purchase order", "order number"] },
];

interface ColumnMapping {
  sourceColumn: string;
  mappedTo: string | null; // null = custom column
  isCustom: boolean;
  sampleValues: string[];
}

interface ParsedRow {
  [key: string]: string | number | null;
}

interface StockReportUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onIngest: (data: {
    rows: ParsedRow[];
    mappings: ColumnMapping[];
    customColumns: string[];
    fileName: string;
  }) => void;
}

export default function StockReportUpload({ isOpen, onClose, onIngest }: StockReportUploadProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [rawData, setRawData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep(1);
    setFileName("");
    setFileSize("");
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

  // Auto-map a column header to a known field
  const autoMapColumn = (header: string): { key: string; label: string } | null => {
    // Normalize: lowercase, collapse whitespace/newlines, trim
    const normalized = header.toLowerCase().replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();
    // Also create a version without special chars for fuzzy matching
    const stripped = normalized.replace(/[^a-z0-9 ]/g, "").trim();

    // Helper: check if a word appears as a whole word (not substring of another word)
    const wordBoundaryMatch = (text: string, word: string): boolean => {
      // Exact match is always valid
      if (text === word) return true;
      // For multi-word aliases, check if the full alias appears as a phrase
      if (word.includes(" ")) {
        return text.includes(word);
      }
      // For single-word aliases, use word boundary check
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`);
      return regex.test(text);
    };

    for (const field of KNOWN_FIELDS) {
      if (
        field.aliases.some(
          (alias) =>
            normalized === alias ||
            stripped === alias ||
            wordBoundaryMatch(normalized, alias) ||
            wordBoundaryMatch(stripped, alias)
        )
      ) {
        return { key: field.key, label: field.label };
      }
    }
    return null;
  };

  // Detect if a row of headers looks like real column names (not a title row)
  const isLikelyHeaderRow = (headers: string[]): boolean => {
    // If most headers are __EMPTY or single characters, this is probably not the real header row
    const emptyCount = headers.filter((h) => h.startsWith("__EMPTY") || h.trim().length <= 1).length;
    return emptyCount < headers.length * 0.5;
  };

  // Try to find the real header row in a sheet by scanning rows
  const findHeaderRow = (sheet: XLSX.WorkSheet): number => {
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    for (let r = range.s.r; r <= Math.min(range.s.r + 10, range.e.r); r++) {
      const rowValues: string[] = [];
      let nonEmpty = 0;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const val = cell ? String(cell.v ?? "").trim() : "";
        rowValues.push(val);
        if (val.length > 1) nonEmpty++;
      }
      // A header row should have multiple non-empty cells with meaningful text
      if (nonEmpty >= 3 && rowValues.some((v) => /^[A-Za-z]/.test(v) && v.length > 2)) {
        return r;
      }
    }
    return 0; // default to first row
  };

  // Parse the uploaded file
  const parseFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setFileName(file.name);
    setFileSize(formatFileSize(file.size));

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      // First attempt: standard parse
      let jsonData = XLSX.utils.sheet_to_json<ParsedRow>(firstSheet, { defval: null });

      if (jsonData.length === 0) {
        setError("The file appears to be empty or has no data rows.");
        setIsProcessing(false);
        return;
      }

      let fileHeaders = Object.keys(jsonData[0]);

      // If headers look like __EMPTY, try to find the real header row
      if (!isLikelyHeaderRow(fileHeaders)) {
        const headerRowIdx = findHeaderRow(firstSheet);
        if (headerRowIdx > 0) {
          // Re-parse with the correct header row by using range option
          const range = XLSX.utils.decode_range(firstSheet["!ref"] ?? "A1");
          range.s.r = headerRowIdx; // start from the detected header row
          jsonData = XLSX.utils.sheet_to_json<ParsedRow>(firstSheet, {
            defval: null,
            range,
          });
          fileHeaders = Object.keys(jsonData[0] ?? {});
        }
      }

      // Filter out completely empty rows
      jsonData = jsonData.filter((row) =>
        Object.values(row).some((v) => v !== null && v !== "" && v !== undefined)
      );

      if (jsonData.length === 0) {
        setError("No data rows found after filtering empty rows.");
        setIsProcessing(false);
        return;
      }

      // Clean up header names — remove __EMPTY prefix patterns that remain
      const cleanHeaders = fileHeaders.filter((h) => !h.startsWith("__EMPTY"));
      const finalHeaders = cleanHeaders.length > 0 ? cleanHeaders : fileHeaders;

      setHeaders(finalHeaders);
      setRawData(jsonData);

      // Auto-map columns
      const columnMappings: ColumnMapping[] = finalHeaders.map((header) => {
        const match = autoMapColumn(header);
        const sampleValues = jsonData
          .slice(0, 5)
          .map((row) => String(row[header] ?? ""))
          .filter((v) => v !== "" && v !== "null" && v !== "undefined");

        return {
          sourceColumn: header,
          mappedTo: match ? match.key : null,
          isCustom: !match,
          sampleValues,
        };
      });

      setMappings(columnMappings);
      setIsProcessing(false);
      setStep(2);
    } catch (err) {
      setError(`Failed to parse file: ${err instanceof Error ? err.message : "Unknown error"}`);
      setIsProcessing(false);
    }
  };

  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && isValidFile(file)) {
      parseFile(file);
    } else {
      setError("Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.");
    }
  };

  // Handle file select
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isValidFile(file)) {
      parseFile(file);
    } else {
      setError("Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.");
    }
  };

  // Update a column mapping
  const updateMapping = (index: number, mappedTo: string | null) => {
    setMappings((prev) =>
      prev.map((m, i) =>
        i === index
          ? { ...m, mappedTo, isCustom: mappedTo === null || !KNOWN_FIELDS.some((f) => f.key === mappedTo) }
          : m
      )
    );
  };

  // Confirm and ingest
  const handleIngest = () => {
    const customColumns = mappings.filter((m) => m.isCustom).map((m) => m.sourceColumn);
    onIngest({
      rows: rawData,
      mappings,
      customColumns,
      fileName,
    });
    handleClose();
  };

  if (!isOpen) return null;

  const mappedCount = mappings.filter((m) => !m.isCustom).length;
  const customCount = mappings.filter((m) => m.isCustom).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Upload Stock Report</h2>
              <p className="text-xs text-muted-foreground">
                {step === 1 && "Select an Excel or CSV file to analyze"}
                {step === 2 && "Review column mappings and custom fields"}
                {step === 3 && "Preview data before ingesting"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Step indicator */}
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono ${
                      s === step
                        ? "bg-foreground text-background"
                        : s < step
                        ? "bg-[var(--status-compliant)] text-background"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {s < step ? "✓" : s}
                  </div>
                  {s < 3 && (
                    <div className={`w-6 h-px ${s < step ? "bg-[var(--status-compliant)]" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>
            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: File Upload */}
          {step === 1 && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-foreground bg-accent/30"
                    : "border-border hover:border-muted-foreground hover:bg-accent/10"
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
                      <p className="text-sm text-foreground font-medium">
                        Drop your stock report here, or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports .xlsx, .xls, and .csv files
                      </p>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[oklch(0.63_0.2_25_/_0.08)] border border-[oklch(0.63_0.2_25_/_0.2)]">
                  <AlertCircle className="w-4 h-4 text-[var(--status-critical)] flex-shrink-0" />
                  <p className="text-sm text-[var(--status-critical)]">{error}</p>
                </div>
              )}

              <div className="bg-secondary/30 rounded-lg p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">How it works</p>
                <div className="space-y-2">
                  {[
                    "Upload your supplier stock report (Excel or CSV)",
                    "Traceum auto-detects and maps columns to known material fields",
                    "New columns not in our schema become custom fields on each item",
                    "Review the mapping and confirm to ingest into inventory",
                  ].map((text, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-xs font-mono text-muted-foreground/60 mt-0.5 w-4">{i + 1}.</span>
                      <p className="text-xs text-muted-foreground">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 2 && (
            <div className="space-y-5">
              {/* File info bar */}
              <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-foreground font-medium">{fileName}</p>
                    <p className="text-xs text-muted-foreground">{fileSize} — {rawData.length} rows, {headers.length} columns</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Link2 className="w-3 h-3 text-[var(--status-compliant)]" />
                    <span className="text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">{mappedCount}</span> mapped
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Plus className="w-3 h-3 text-[var(--status-info)]" />
                    <span className="text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">{customCount}</span> custom
                    </span>
                  </div>
                </div>
              </div>

              {/* Column mapping list */}
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_32px_1fr_1fr] gap-3 px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source Column</span>
                  <span />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Maps To</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sample Values</span>
                </div>

                {mappings.map((mapping, index) => (
                  <div
                    key={mapping.sourceColumn}
                    className={`grid grid-cols-[1fr_32px_1fr_1fr] gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      mapping.isCustom ? "bg-[oklch(0.55_0.15_250_/_0.06)] border border-[oklch(0.55_0.15_250_/_0.15)]" : "bg-secondary/20 border border-transparent"
                    }`}
                  >
                    {/* Source column name */}
                    <div className="flex items-center gap-2">
                      <Columns3 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-foreground font-mono truncate">{mapping.sourceColumn}</span>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center justify-center">
                      <ArrowRight className={`w-3.5 h-3.5 ${mapping.isCustom ? "text-[var(--status-info)]" : "text-[var(--status-compliant)]"}`} />
                    </div>

                    {/* Mapping selector */}
                    <div>
                      <select
                        value={mapping.mappedTo ?? "__custom__"}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateMapping(index, val === "__custom__" ? null : val);
                        }}
                        className={`w-full bg-secondary border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
                          mapping.isCustom ? "text-[var(--status-info)]" : "text-foreground"
                        }`}
                      >
                        <option value="__custom__">+ Custom Column</option>
                        <optgroup label="Known Fields">
                          {KNOWN_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    {/* Sample values */}
                    <div className="flex items-center gap-1 overflow-hidden">
                      {mapping.sampleValues.slice(0, 3).map((v, i) => (
                        <span key={i} className="text-xs text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded truncate max-w-[100px]">
                          {v}
                        </span>
                      ))}
                      {mapping.sampleValues.length === 0 && (
                        <span className="text-xs text-muted-foreground/40 italic">empty</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Custom columns explanation */}
              {customCount > 0 && (
                <div className="bg-[oklch(0.55_0.15_250_/_0.06)] border border-[oklch(0.55_0.15_250_/_0.15)] rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Plus className="w-4 h-4 text-[var(--status-info)] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-foreground font-medium">
                        {customCount} custom column{customCount !== 1 ? "s" : ""} detected
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        These columns don't match any known material fields. They'll be added as custom data columns
                        on each material record, visible in the inventory table and material detail view.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-secondary/30 rounded-lg p-4">
                  <p className="text-2xl font-semibold font-mono text-foreground">{rawData.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Rows to ingest</p>
                </div>
                <div className="bg-secondary/30 rounded-lg p-4">
                  <p className="text-2xl font-semibold font-mono text-foreground">{mappedCount}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Mapped columns</p>
                </div>
                <div className="bg-secondary/30 rounded-lg p-4">
                  <p className="text-2xl font-semibold font-mono text-[var(--status-info)]">{customCount}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Custom columns added</p>
                </div>
              </div>

              {/* Mapped fields summary */}
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-secondary/20">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Column Mapping Summary</p>
                </div>
                <div className="divide-y divide-border/50">
                  {mappings.map((m) => (
                    <div key={m.sourceColumn} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm font-mono text-muted-foreground">{m.sourceColumn}</span>
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                        {m.isCustom ? (
                          <span className="text-xs font-medium text-[var(--status-info)] bg-[oklch(0.55_0.15_250_/_0.1)] px-2 py-0.5 rounded">
                            Custom: {m.sourceColumn}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-[var(--status-compliant)] bg-[oklch(0.72_0.17_155_/_0.1)] px-2 py-0.5 rounded">
                            {KNOWN_FIELDS.find((f) => f.key === m.mappedTo)?.label ?? m.mappedTo}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data preview table */}
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-secondary/20">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Data Preview — first 5 rows
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {headers.map((h) => {
                          const mapping = mappings.find((m) => m.sourceColumn === h);
                          return (
                            <th key={h} className="text-left py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                {mapping?.isCustom && <Plus className="w-2.5 h-2.5 text-[var(--status-info)]" />}
                                {h}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-border/30">
                          {headers.map((h) => (
                            <td key={h} className="py-2 px-3 font-mono text-foreground whitespace-nowrap max-w-[200px] truncate">
                              {String(row[h] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-between bg-secondary/10">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep((step - 1) as 1 | 2)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            {step === 2 && (
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Review Data
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleIngest}
                className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <CheckCircle2 className="w-4 h-4" />
                Ingest {rawData.length} Rows
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function isValidFile(file: File): boolean {
  const validTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/csv",
  ];
  const validExtensions = [".xlsx", ".xls", ".csv"];
  const hasValidType = validTypes.includes(file.type);
  const hasValidExtension = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
  return hasValidType || hasValidExtension;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
