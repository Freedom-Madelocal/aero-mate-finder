import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import AdminShell from "@/components/AdminShell";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader2, XCircle } from "lucide-react";
import {
  importMaterialIndex,
  createTdsUploadUrl,
  finalizeTdsUpload,
} from "@/lib/tdsUpload.functions";
import { refreshMasterSpecStore } from "@/data/masterSpecs";

// ---------- CSV parsing ----------

interface IndexRow {
  materialNumber: number;
  vendor: string;
  product: string;
  hasTdsPdf: boolean;
  pdfFilename: string | null;
  /** 1-indexed CSV row number (data rows only, excludes header). */
  csvRow: number;
}

interface CsvValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  rows: IndexRow[];
  /** materialNumber → row (last-write wins, but duplicates are errors). */
  byMaterial: Map<number, IndexRow>;
  /** normalized filename → materialNumber, for filename cross-check. */
  byFilename: Map<string, number>;
}

const REQUIRED_COLUMNS = ["Material ID", "Vendor", "Product", "Has TDS PDF", "PDF Filename"] as const;

/** Minimal RFC-4180-ish CSV parser. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        field = "";
        row = [];
      } else if (c === "\r") {
        // skip
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function normFilename(name: string): string {
  return name.trim().toLowerCase();
}

/** Full validator: required columns, ID uniqueness/range, filename presence, HasTDS↔filename consistency. */
function validateCsv(text: string): CsvValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: IndexRow[] = [];
  const byMaterial = new Map<number, IndexRow>();
  const byFilename = new Map<string, number>();

  const table = parseCsv(text);
  if (table.length < 2) {
    errors.push("CSV appears empty (no data rows).");
    return { ok: false, errors, warnings, rows, byMaterial, byFilename };
  }

  const header = table[0].map((h) => h.trim());
  const headerLower = header.map((h) => h.toLowerCase());
  const findCol = (label: string) => {
    const l = label.toLowerCase();
    // exact match preferred, fallback to "contains"
    let idx = headerLower.findIndex((h) => h === l);
    if (idx < 0) idx = headerLower.findIndex((h) => h.includes(l));
    return idx;
  };

  const idIdx = findCol("Material ID");
  const vendorIdx = findCol("Vendor");
  const productIdx = findCol("Product");
  const hasIdx = findCol("Has TDS PDF");
  const fileIdx = findCol("PDF Filename");

  const missing: string[] = [];
  if (idIdx < 0) missing.push("Material ID");
  if (vendorIdx < 0) missing.push("Vendor");
  if (productIdx < 0) missing.push("Product");
  if (hasIdx < 0) missing.push("Has TDS PDF");
  if (fileIdx < 0) missing.push("PDF Filename");
  if (missing.length > 0) {
    errors.push(`Missing required column(s): ${missing.join(", ")}`);
    return { ok: false, errors, warnings, rows, byMaterial, byFilename };
  }

  const dupIds = new Map<number, number[]>(); // id → csvRow[]
  const dupFilenames = new Map<string, number[]>();

  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const csvRow = i + 1; // human 1-indexed with header at row 1
    const rawId = (r[idIdx] ?? "").trim();
    const vendor = (r[vendorIdx] ?? "").trim();
    const product = (r[productIdx] ?? "").trim();
    const hasStr = (r[hasIdx] ?? "").trim().toUpperCase();
    const fileRaw = (r[fileIdx] ?? "").trim();
    const filename = fileRaw || null;

    if (!rawId && !vendor && !product) continue; // truly blank

    const id = Number(rawId);
    if (!rawId) {
      errors.push(`Row ${csvRow}: Material ID is empty.`);
      continue;
    }
    if (!Number.isInteger(id) || id < 1) {
      errors.push(`Row ${csvRow}: Material ID "${rawId}" is not a positive integer.`);
      continue;
    }
    if (!vendor) errors.push(`Row ${csvRow}: Vendor is empty (Material ID ${id}).`);
    if (!product) errors.push(`Row ${csvRow}: Product is empty (Material ID ${id}).`);

    const hasTdsPdf = hasStr === "YES" || hasStr === "TRUE" || hasStr === "1";
    if (hasStr && !["YES", "NO", "TRUE", "FALSE", "0", "1"].includes(hasStr)) {
      warnings.push(`Row ${csvRow}: Has TDS PDF = "${hasStr}" is not YES/NO — treating as NO.`);
    }
    if (hasTdsPdf && !filename) {
      errors.push(`Row ${csvRow}: Has TDS PDF = YES but PDF Filename is empty (Material ID ${id}).`);
    }
    if (filename) {
      if (!/\.pdf$/i.test(filename)) {
        errors.push(`Row ${csvRow}: PDF Filename "${filename}" must end in .pdf.`);
      }
      const prefixMatch = filename.match(/^(\d{1,5})[_-]/);
      if (!prefixMatch) {
        errors.push(
          `Row ${csvRow}: PDF Filename "${filename}" must start with a zero-padded Material ID prefix (e.g. 0002_...).`,
        );
      } else if (Number(prefixMatch[1]) !== id) {
        errors.push(
          `Row ${csvRow}: PDF Filename "${filename}" has prefix ${Number(prefixMatch[1])} but Material ID is ${id}.`,
        );
      }
    }

    const row: IndexRow = {
      materialNumber: id,
      vendor,
      product,
      hasTdsPdf,
      pdfFilename: filename,
      csvRow,
    };

    if (byMaterial.has(id)) {
      dupIds.set(id, [...(dupIds.get(id) ?? [byMaterial.get(id)!.csvRow]), csvRow]);
    } else {
      byMaterial.set(id, row);
    }

    if (filename) {
      const key = normFilename(filename);
      if (byFilename.has(key)) {
        dupFilenames.set(key, [...(dupFilenames.get(key) ?? []), csvRow]);
      } else {
        byFilename.set(key, id);
      }
    }

    rows.push(row);
  }

  for (const [id, csvRows] of dupIds) {
    errors.push(`Duplicate Material ID ${id} appears on rows ${csvRows.join(", ")}.`);
  }
  for (const [fname, csvRows] of dupFilenames) {
    errors.push(`Duplicate PDF Filename "${fname}" on rows ${csvRows.join(", ")}.`);
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push("No usable data rows found.");
  }

  return { ok: errors.length === 0, errors, warnings, rows, byMaterial, byFilename };
}

// ---------- Upload page ----------

interface ImportReport {
  totalRows: number;
  matched: number;
  alreadySet: number;
  conflicted: number;
  unmatched: { materialNumber: number; vendor: string; product: string }[];
}

interface FileStatus {
  file: File;
  materialNumber: number | null;
  status: "pending" | "uploading" | "done" | "skipped" | "error";
  error?: string;
}

interface FolderValidation {
  matched: FileStatus[];
  errors: string[]; // hard blockers per file
  warnings: string[]; // non-blockers (e.g. CSV expected file not uploaded)
}

function validateFolderAgainstCsv(files: File[], csv: CsvValidation | null): FolderValidation {
  const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
  const matched: FileStatus[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<number>();

  for (const file of pdfs) {
    const prefix = file.name.match(/^(\d{1,5})[_-]/);
    if (!prefix) {
      matched.push({
        file,
        materialNumber: null,
        status: "error",
        error: "No leading numeric Material ID prefix (expected e.g. 0002_...)",
      });
      continue;
    }
    const id = Number(prefix[1]);

    // CSV-driven checks (only when a CSV is loaded)
    if (csv) {
      const row = csv.byMaterial.get(id);
      if (!row) {
        matched.push({
          file,
          materialNumber: id,
          status: "error",
          error: `Material ID ${id} not present in CSV`,
        });
        continue;
      }
      if (row.pdfFilename && normFilename(row.pdfFilename) !== normFilename(file.name)) {
        matched.push({
          file,
          materialNumber: id,
          status: "error",
          error: `Filename does not match CSV (expected "${row.pdfFilename}")`,
        });
        continue;
      }
    }

    if (seenIds.has(id)) {
      matched.push({
        file,
        materialNumber: id,
        status: "error",
        error: `Duplicate PDF for Material ID ${id} in this folder`,
      });
      continue;
    }
    seenIds.add(id);
    matched.push({ file, materialNumber: id, status: "pending" });
  }

  if (csv) {
    for (const [id, row] of csv.byMaterial) {
      if (row.hasTdsPdf && !seenIds.has(id)) {
        warnings.push(`CSV expects a PDF for Material ID ${id} ("${row.pdfFilename}") — not in folder.`);
      }
    }
  }

  errors.push(
    ...matched
      .filter((m) => m.status === "error")
      .map((m) => `${m.file.name}: ${m.error}`),
  );

  return { matched, errors, warnings };
}

export default function TdsUpload() {
  const [csv, setCsv] = useState<CsvValidation | null>(null);
  const [csvName, setCsvName] = useState<string>("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);

  const [files, setFiles] = useState<FileStatus[]>([]);
  const [folderWarnings, setFolderWarnings] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [bytes, setBytes] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const importIndex = useServerFn(importMaterialIndex);
  const createUrl = useServerFn(createTdsUploadUrl);
  const finalize = useServerFn(finalizeTdsUpload);

  const csvOk = csv?.ok ?? false;

  const folderStats = useMemo(() => {
    const pending = files.filter((f) => f.status === "pending").length;
    const errored = files.filter((f) => f.status === "error").length;
    const done = files.filter((f) => f.status === "done").length;
    const skipped = files.filter((f) => f.status === "skipped").length;
    const uploading = files.filter((f) => f.status === "uploading").length;
    return { pending, errored, done, skipped, uploading };
  }, [files]);

  const failedFiles = useMemo(
    () => files.filter((f) => f.status === "error" || f.status === "skipped"),
    [files],
  );

  async function onCsvSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const v = validateCsv(text);
    setCsv(v);
    setCsvName(file.name);
    setReport(null);
    // Re-validate any already-staged folder against the new CSV.
    if (files.length > 0) {
      const rawFiles = files.map((f) => f.file);
      const folderRes = validateFolderAgainstCsv(rawFiles, v);
      setFiles(folderRes.matched);
      setFolderWarnings(folderRes.warnings);
    }
    if (v.ok) {
      toast.success(`CSV validated: ${v.rows.length} rows, no errors.`);
    } else {
      toast.error(`CSV has ${v.errors.length} error(s). Fix and re-upload.`);
    }
  }

  async function runImport() {
    if (!csv || !csv.ok) return;
    setImporting(true);
    try {
      const result = await importIndex({
        data: {
          rows: csv.rows.map((r) => ({
            materialNumber: r.materialNumber,
            vendor: r.vendor,
            product: r.product,
            pdfFilename: r.pdfFilename,
          })),
        },
      });
      setReport(result as ImportReport);
      toast.success(
        `Matched ${result.matched} new · ${result.alreadySet} already set · ${result.unmatched.length} unmatched`,
      );
      await refreshMasterSpecStore();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  function onFolderSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    if (!csv || !csv.ok) {
      toast.error("Import a valid CSV first — filenames are cross-checked against it.");
      e.target.value = "";
      return;
    }
    const res = validateFolderAgainstCsv(list, csv);
    setFiles(res.matched);
    setFolderWarnings(res.warnings);
    const pending = res.matched.filter((m) => m.status === "pending").length;
    const errored = res.matched.filter((m) => m.status === "error").length;
    setProgress({ done: 0, total: pending });
    if (errored > 0) {
      toast.error(`${errored} file(s) failed validation and will be skipped.`);
    } else {
      toast.success(`${pending} file(s) validated and ready to upload.`);
    }
  }

  function downloadUnmatchedCsv() {
    if (!report || report.unmatched.length === 0) return;
    const rows = [
      "Material ID,Vendor,Product",
      ...report.unmatched.map(
        (u) => `${u.materialNumber},"${u.vendor.replace(/"/g, '""')}","${u.product.replace(/"/g, '""')}"`,
      ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unmatched_specs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runUpload() {
    if (files.length === 0) return;
    // Hard gate: refuse if there are any error rows staged.
    if (files.some((f) => f.status === "error")) {
      toast.error("Fix or remove file errors before uploading.");
      return;
    }
    setUploading(true);
    let done = 0;
    let bytesDone = 0;
    const pendingFiles = files.filter((f) => f.status === "pending");
    const total = pendingFiles.length;
    const bytesTotal = pendingFiles.reduce((s, f) => s + f.file.size, 0);
    setProgress({ done, total });
    setBytes({ done: 0, total: bytesTotal });
    setStartedAt(Date.now());
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      if (item.status !== "pending" || item.materialNumber == null) continue;
      setCurrentFile(item.file.name);
      setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f)));
      try {
        const signed = await createUrl({
          data: {
            materialNumber: item.materialNumber,
            fileName: item.file.name,
            replaceExisting,
          },
        });
        const putRes = await fetch(signed.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: item.file,
        });
        if (!putRes.ok) throw new Error(`Storage PUT ${putRes.status} ${putRes.statusText}`);
        await finalize({
          data: { specId: signed.specId, path: signed.path, size: item.file.size },
        });
        setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "done" } : f)));
        succeeded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isExists = msg.includes("EXISTS:");
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? {
                  ...f,
                  status: isExists ? "skipped" : "error",
                  error: isExists
                    ? "Already has a PDF — enable Replace to overwrite"
                    : msg,
                }
              : f,
          ),
        );
        if (isExists) skipped++;
        else failed++;
      }
      done++;
      bytesDone += item.file.size;
      setProgress({ done, total });
      setBytes({ done: bytesDone, total: bytesTotal });
    }
    setCurrentFile(null);
    setUploading(false);
    await refreshMasterSpecStore();
    if (failed > 0) {
      toast.error(`Upload finished: ${succeeded} uploaded · ${failed} failed · ${skipped} skipped`);
    } else {
      toast.success(`Upload finished: ${succeeded} uploaded · ${skipped} skipped`);
    }
  }

  function downloadErrorLog() {
    const rows = [
      ["material_number", "file", "status", "error"],
      ...failedFiles.map((f) => [
        f.materialNumber != null ? String(f.materialNumber).padStart(4, "0") : "",
        f.file.name,
        f.status,
        (f.error ?? "").replace(/"/g, '""'),
      ]),
    ];
    const csvText = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tds-upload-errors-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <AdminShell>
      <div className="max-w-5xl mx-auto p-6 sm:p-10 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">TDS PDF Upload</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk-attach TDS PDFs to master specs using the INDEX CSV as the join manifest.
            Files must be prefixed with the zero-padded Traceium Material ID (e.g. <code>0002_...</code>).
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Required CSV columns: <code>{REQUIRED_COLUMNS.join(", ")}</code>.
          </p>
        </div>

        {/* Step 1: CSV */}
        <section className="border border-border rounded-md p-5 bg-card space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] text-xs flex items-center justify-center font-semibold">
              1
            </span>
            <h2 className="font-medium">Import INDEX CSV</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            The CSV is fully validated before anything is written. Assigns <code>material_number</code>{" "}
            to each master spec by (Vendor, Product). Idempotent — re-import safely.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded text-sm cursor-pointer hover:bg-secondary/40">
              <Upload className="w-4 h-4" />
              <span>Choose CSV</span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onCsvSelected} />
            </label>
            {csv && (
              <span className="text-xs text-muted-foreground">
                {csvName} — {csv.rows.length} valid rows
                {csv.errors.length > 0 && ` · ${csv.errors.length} errors`}
                {csv.warnings.length > 0 && ` · ${csv.warnings.length} warnings`}
              </span>
            )}
            <button
              onClick={runImport}
              disabled={!csvOk || importing}
              className="inline-flex items-center gap-2 bg-foreground text-background rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
              title={!csvOk ? "Fix CSV errors first" : ""}
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Assign Material IDs
            </button>
          </div>

          {csv && (csv.errors.length > 0 || csv.warnings.length > 0) && (
            <div className="mt-3 space-y-2">
              {csv.errors.length > 0 && (
                <div className="border border-destructive/40 bg-destructive/10 rounded-md p-3 text-xs">
                  <div className="flex items-center gap-1 text-destructive font-medium mb-1">
                    <XCircle className="w-4 h-4" /> {csv.errors.length} validation error(s) — import blocked
                  </div>
                  <ul className="max-h-40 overflow-y-auto space-y-0.5 pl-4 list-disc text-destructive/90">
                    {csv.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {csv.errors.length > 50 && <li>…and {csv.errors.length - 50} more.</li>}
                  </ul>
                </div>
              )}
              {csv.warnings.length > 0 && (
                <div className="border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 rounded-md p-3 text-xs">
                  <div className="flex items-center gap-1 text-[var(--status-warning)] font-medium mb-1">
                    <AlertTriangle className="w-4 h-4" /> {csv.warnings.length} warning(s)
                  </div>
                  <ul className="max-h-32 overflow-y-auto space-y-0.5 pl-4 list-disc">
                    {csv.warnings.slice(0, 30).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {report && (
            <div className="mt-3 border border-border rounded-md p-3 bg-secondary/20 text-sm space-y-2">
              <div className="flex flex-wrap gap-4">
                <span className="inline-flex items-center gap-1 text-[var(--status-compliant)]">
                  <CheckCircle2 className="w-4 h-4" /> {report.matched} newly matched
                </span>
                <span>{report.alreadySet} already set</span>
                {report.conflicted > 0 && (
                  <span className="text-[var(--status-warning)]">
                    {report.conflicted} conflicts (different ID already on spec)
                  </span>
                )}
                {report.unmatched.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[var(--status-warning)]">
                    <AlertTriangle className="w-4 h-4" /> {report.unmatched.length} unmatched
                  </span>
                )}
              </div>
              {report.unmatched.length > 0 && (
                <button
                  onClick={downloadUnmatchedCsv}
                  className="text-xs underline text-[var(--accent-blue)]"
                >
                  Download unmatched_specs.csv
                </button>
              )}
            </div>
          )}
        </section>

        {/* Step 2: folder */}
        <section className="border border-border rounded-md p-5 bg-card space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] text-xs flex items-center justify-center font-semibold">
              2
            </span>
            <h2 className="font-medium">Upload PDF folder</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Select the <code>01_By_Material/</code> folder. Each filename is cross-checked against the CSV
            (Material ID prefix + exact filename match). Any mismatch blocks the upload.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label
              className={`inline-flex items-center gap-2 px-3 py-2 border border-border rounded text-sm ${
                csvOk ? "cursor-pointer hover:bg-secondary/40" : "opacity-50 cursor-not-allowed"
              }`}
              title={!csvOk ? "Import a valid CSV first" : ""}
            >
              <Upload className="w-4 h-4" />
              <span>Select folder</span>
              <input
                type="file"
                multiple
                disabled={!csvOk}
                // @ts-expect-error – webkitdirectory is non-standard but widely supported
                webkitdirectory=""
                directory=""
                className="hidden"
                onChange={onFolderSelected}
              />
            </label>
            {files.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {files.length} files · {folderStats.pending} valid · {folderStats.errored} errors ·{" "}
                {folderStats.done} uploaded
              </span>
            )}
            <button
              onClick={runUpload}
              disabled={
                uploading ||
                files.length === 0 ||
                folderStats.pending === 0 ||
                folderStats.errored > 0
              }
              className="inline-flex items-center gap-2 bg-foreground text-background rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
              title={folderStats.errored > 0 ? "Resolve file errors before uploading" : ""}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload & Attach
            </button>
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                disabled={uploading}
                className="accent-[var(--accent-blue)]"
              />
              Replace existing PDFs
              <span
                className="text-[10px] text-muted-foreground/70"
                title="On: overwrite any PDF already attached to a Material ID (old file removed, link updated — no duplicates, no broken links). Off: skip Material IDs that already have a PDF."
              >
                (?)
              </span>
            </label>
          </div>

          {folderStats.errored > 0 && (
            <div className="border border-destructive/40 bg-destructive/10 rounded-md p-3 text-xs">
              <div className="flex items-center gap-1 text-destructive font-medium mb-1">
                <XCircle className="w-4 h-4" /> {folderStats.errored} file(s) failed validation — upload blocked
              </div>
              <p className="text-destructive/80">See the file table below for per-file reasons.</p>
            </div>
          )}

          {folderWarnings.length > 0 && (
            <div className="border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 rounded-md p-3 text-xs">
              <div className="flex items-center gap-1 text-[var(--status-warning)] font-medium mb-1">
                <AlertTriangle className="w-4 h-4" /> {folderWarnings.length} missing file(s) expected by CSV
              </div>
              <ul className="max-h-32 overflow-y-auto space-y-0.5 pl-4 list-disc">
                {folderWarnings.slice(0, 20).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {folderWarnings.length > 20 && <li>…and {folderWarnings.length - 20} more.</li>}
              </ul>
            </div>
          )}

          {(uploading || folderStats.done > 0) && (
            <div className="text-xs text-muted-foreground">
              {progress.done} / {progress.total} uploaded
              <div className="mt-1 h-1.5 w-full bg-secondary/40 rounded overflow-hidden">
                <div
                  className="h-full bg-[var(--accent-blue)] transition-all"
                  style={{
                    width: progress.total ? `${(progress.done / progress.total) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div className="max-h-80 overflow-y-auto border border-border rounded text-xs">
              <table className="w-full">
                <thead className="bg-secondary/30 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1 font-medium">Material</th>
                    <th className="text-left px-2 py-1 font-medium">File</th>
                    <th className="text-left px-2 py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1 font-mono">
                        {f.materialNumber != null ? String(f.materialNumber).padStart(4, "0") : "—"}
                      </td>
                      <td className="px-2 py-1 truncate max-w-[24rem]" title={f.file.name}>
                        {f.file.name}
                      </td>
                      <td className="px-2 py-1">
                        {f.status === "done" && (
                          <span className="text-[var(--status-compliant)]">Uploaded</span>
                        )}
                        {f.status === "uploading" && <span>Uploading…</span>}
                        {f.status === "pending" && <span className="text-muted-foreground">Queued</span>}
                        {f.status === "error" && (
                          <span className="text-destructive" title={f.error}>
                            {f.error ?? "Error"}
                          </span>
                        )}
                        {f.status === "skipped" && <span className="text-muted-foreground">Skipped</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
