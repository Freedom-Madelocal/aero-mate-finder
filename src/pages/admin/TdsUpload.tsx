import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import AdminShell from "@/components/AdminShell";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
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
}

/** Minimal RFC-4180-ish CSV parser (handles quoted fields with commas). */
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
      } else {
        field += c;
      }
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
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function toIndexRows(text: string): IndexRow[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const header = table[0].map((h) => h.trim().toLowerCase());
  const idIdx = header.findIndex((h) => h.includes("material id") || h === "id");
  const vendorIdx = header.findIndex((h) => h === "vendor" || h === "manufacturer");
  const productIdx = header.findIndex((h) => h === "product");
  const hasIdx = header.findIndex((h) => h.includes("has tds"));
  const fileIdx = header.findIndex((h) => h.includes("pdf filename") || h === "filename");
  if (idIdx < 0 || vendorIdx < 0 || productIdx < 0) {
    throw new Error(
      "CSV must contain 'Material ID', 'Vendor', and 'Product' columns.",
    );
  }
  const rows: IndexRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const id = Number(r[idIdx]);
    if (!Number.isFinite(id) || id < 1) continue;
    rows.push({
      materialNumber: id,
      vendor: (r[vendorIdx] ?? "").trim(),
      product: (r[productIdx] ?? "").trim(),
      hasTdsPdf: hasIdx >= 0 ? (r[hasIdx] ?? "").trim().toUpperCase() === "YES" : false,
      pdfFilename: fileIdx >= 0 ? (r[fileIdx] ?? "").trim() || null : null,
    });
  }
  return rows;
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

export default function TdsUpload() {
  const [csvRows, setCsvRows] = useState<IndexRow[] | null>(null);
  const [csvName, setCsvName] = useState<string>("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);

  const [files, setFiles] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const importIndex = useServerFn(importMaterialIndex);
  const createUrl = useServerFn(createTdsUploadUrl);
  const finalize = useServerFn(finalizeTdsUpload);

  async function onCsvSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = toIndexRows(text);
      if (rows.length === 0) {
        toast.error("No valid rows found in CSV.");
        return;
      }
      setCsvRows(rows);
      setCsvName(file.name);
      setReport(null);
      toast.success(`Parsed ${rows.length} rows from ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function runImport() {
    if (!csvRows) return;
    setImporting(true);
    try {
      const result = await importIndex({ data: { rows: csvRows } });
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
    const pdfs = list.filter((f) => /\.pdf$/i.test(f.name));
    const staged: FileStatus[] = pdfs.map((f) => {
      const match = f.name.match(/^(\d{1,5})[_-]/);
      const materialNumber = match ? Number(match[1]) : null;
      return {
        file: f,
        materialNumber,
        status: materialNumber ? "pending" : "error",
        error: materialNumber ? undefined : "No leading numeric prefix",
      };
    });
    setFiles(staged);
    setProgress({ done: 0, total: staged.filter((s) => s.materialNumber).length });
  }

  function downloadUnmatchedCsv() {
    if (!report || report.unmatched.length === 0) return;
    const csv = [
      "Material ID,Vendor,Product",
      ...report.unmatched.map(
        (u) => `${u.materialNumber},"${u.vendor.replace(/"/g, '""')}","${u.product.replace(/"/g, '""')}"`,
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unmatched_specs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runUpload() {
    if (files.length === 0) return;
    setUploading(true);
    let done = 0;
    const total = files.filter((f) => f.status === "pending").length;
    setProgress({ done, total });
    // Sequential to avoid slamming storage; adjust concurrency if needed.
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      if (item.status !== "pending" || item.materialNumber == null) continue;
      setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f)));
      try {
        const signed = await createUrl({
          data: { materialNumber: item.materialNumber, fileName: item.file.name },
        });
        const putRes = await fetch(signed.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: item.file,
        });
        if (!putRes.ok) throw new Error(`Storage PUT ${putRes.status}`);
        await finalize({
          data: { specId: signed.specId, path: signed.path, size: item.file.size },
        });
        setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "done" } : f)));
      } catch (err) {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? { ...f, status: "error", error: err instanceof Error ? err.message : String(err) }
              : f,
          ),
        );
      }
      done++;
      setProgress({ done, total });
    }
    setUploading(false);
    await refreshMasterSpecStore();
    toast.success(`Upload complete: ${done}/${total}`);
  }

  const stagedValid = files.filter((f) => f.status === "pending" || f.status === "uploading").length;
  const stagedDone = files.filter((f) => f.status === "done").length;
  const stagedErr = files.filter((f) => f.status === "error").length;

  return (
    <AdminShell>
      <div className="max-w-5xl mx-auto p-6 sm:p-10 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">TDS PDF Upload</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk-attach TDS PDFs to master specs using the INDEX CSV as the join manifest.
            Files must be prefixed with the zero-padded Traceium Material ID (e.g. <code>0002_...</code>).
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
            Assigns <code>material_number</code> to every master spec that matches by
            (Vendor, Product). Idempotent — re-import safely.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded text-sm cursor-pointer hover:bg-secondary/40">
              <Upload className="w-4 h-4" />
              <span>Choose CSV</span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onCsvSelected} />
            </label>
            {csvRows && (
              <span className="text-xs text-muted-foreground">
                {csvName} — {csvRows.length} rows
              </span>
            )}
            <button
              onClick={runImport}
              disabled={!csvRows || importing}
              className="inline-flex items-center gap-2 bg-foreground text-background rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Assign Material IDs
            </button>
          </div>

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
            Select the <code>01_By_Material/</code> folder. Every PDF whose name starts with a
            zero-padded material number will be uploaded and linked to that spec, overwriting any
            prior PDF for that material.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded text-sm cursor-pointer hover:bg-secondary/40">
              <Upload className="w-4 h-4" />
              <span>Select folder</span>
              <input
                type="file"
                multiple
                // @ts-expect-error – webkitdirectory is non-standard but widely supported
                webkitdirectory=""
                directory=""
                className="hidden"
                onChange={onFolderSelected}
              />
            </label>
            {files.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {files.length} files staged · {stagedValid} valid · {stagedErr} skipped
              </span>
            )}
            <button
              onClick={runUpload}
              disabled={uploading || files.length === 0 || stagedValid === 0}
              className="inline-flex items-center gap-2 bg-foreground text-background rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload & Attach
            </button>
          </div>

          {(uploading || stagedDone > 0) && (
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
                          <span className="text-[var(--status-warning)]" title={f.error}>
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
