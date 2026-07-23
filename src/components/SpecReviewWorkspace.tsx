import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Save, CheckCircle2, Flag, ExternalLink, FileText, Loader2 } from "lucide-react";
import {
  getSpecForEdit,
  updateSpecFields,
  setReviewStatus,
} from "@/lib/specManualReview.functions";

type FieldKind = "text" | "number" | "boolean" | "textarea";
interface FieldDef {
  column: string;
  label: string;
  kind: FieldKind;
  section: string;
}

const FIELDS: FieldDef[] = [
  // Identity
  { column: "product_name", label: "Product Name", kind: "text", section: "Identity" },
  { column: "product_family", label: "Product Family", kind: "text", section: "Identity" },
  { column: "material_category", label: "Category", kind: "text", section: "Identity" },
  { column: "resin_chemistry", label: "Resin Chemistry", kind: "text", section: "Identity" },
  { column: "reinforcement", label: "Reinforcement", kind: "text", section: "Identity" },
  { column: "product_form", label: "Product Form", kind: "text", section: "Identity" },
  { column: "active_ingredient_or_resin", label: "Active Ingredient / Resin", kind: "text", section: "Identity" },
  { column: "process_method", label: "Process Method", kind: "text", section: "Identity" },
  { column: "application_process", label: "Application Process", kind: "text", section: "Identity" },
  // Cure & Thermal
  { column: "cure_temperature_c", label: "Cure Temp (°C)", kind: "number", section: "Cure & Thermal" },
  { column: "cure_time", label: "Cure Time", kind: "text", section: "Cure & Thermal" },
  { column: "dry_tg_onset_c", label: "Dry Tg Onset (°C)", kind: "number", section: "Cure & Thermal" },
  { column: "wet_tg_c", label: "Wet Tg (°C)", kind: "number", section: "Cure & Thermal" },
  { column: "peak_tg_c", label: "Peak Tg (°C)", kind: "number", section: "Cure & Thermal" },
  { column: "max_service_temperature_c", label: "Max Service Temp (°C)", kind: "number", section: "Cure & Thermal" },
  // Storage
  { column: "out_life_days", label: "Out Life (days)", kind: "number", section: "Storage" },
  { column: "freezer_life_months", label: "Freezer Life (months)", kind: "number", section: "Storage" },
  { column: "shelf_life_months", label: "Shelf Life (months)", kind: "number", section: "Storage" },
  { column: "storage_temp_min_c", label: "Storage Min (°C)", kind: "number", section: "Storage" },
  { column: "storage_temp_max_c", label: "Storage Max (°C)", kind: "number", section: "Storage" },
  // Outgassing / Mechanical
  { column: "tml_pct", label: "TML (%)", kind: "number", section: "Outgassing & Mechanical" },
  { column: "cvcm_pct", label: "CVCM (%)", kind: "number", section: "Outgassing & Mechanical" },
  { column: "tensile_lap_shear_mpa", label: "Tensile Lap Shear (MPa)", kind: "number", section: "Outgassing & Mechanical" },
  { column: "t_peel_n_per_25mm", label: "T-Peel (N/25mm)", kind: "number", section: "Outgassing & Mechanical" },
  { column: "flatwise_tension_mpa", label: "Flatwise Tension (MPa)", kind: "number", section: "Outgassing & Mechanical" },
  { column: "climbing_drum_peel_in_lb_per_in", label: "Climbing Drum Peel (in·lb/in)", kind: "number", section: "Outgassing & Mechanical" },
  // Flags
  { column: "ooa_vbo_capable", label: "OOA / VBO Capable", kind: "boolean", section: "Flags" },
  { column: "toughened", label: "Toughened", kind: "boolean", section: "Flags" },
  { column: "flame_retardant", label: "Flame Retardant", kind: "boolean", section: "Flags" },
  { column: "low_dielectric", label: "Low Dielectric", kind: "boolean", section: "Flags" },
  { column: "low_moisture_absorption", label: "Low Moisture Absorption", kind: "boolean", section: "Flags" },
  { column: "impact_resistant", label: "Impact Resistant", kind: "boolean", section: "Flags" },
  { column: "high_temperature", label: "High Temperature", kind: "boolean", section: "Flags" },
  // Free text
  { column: "applications", label: "Applications", kind: "textarea", section: "Notes" },
  { column: "qualifications_standards", label: "Qualifications / Standards", kind: "textarea", section: "Notes" },
  { column: "minimum_order_quantity", label: "Minimum Order Quantity", kind: "text", section: "Notes" },
  { column: "notes", label: "Notes", kind: "textarea", section: "Notes" },
];

const SECTIONS = Array.from(new Set(FIELDS.map((f) => f.section)));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toInputValue(v: any, kind: FieldKind): string | boolean {
  if (kind === "boolean") return !!v;
  if (v === null || v === undefined) return "";
  return String(v);
}
function fromInputValue(v: string | boolean, kind: FieldKind): string | number | boolean | null {
  if (kind === "boolean") return !!v;
  const s = String(v).trim();
  if (s === "") return null;
  if (kind === "number") {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return s;
}

export function SpecReviewWorkspace({
  specId,
  onClose,
}: {
  specId: string;
  onClose: () => void;
}) {
  const fetchSpec = useServerFn(getSpecForEdit);
  const doUpdate = useServerFn(updateSpecFields);
  const doSetStatus = useServerFn(setReviewStatus);
  const qc = useQueryClient();

  const { data: spec, isLoading, error } = useQuery({
    queryKey: ["spec-edit", specId],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchSpec({ data: { specId } }) as Promise<any>,
    staleTime: 5_000,
  });

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!spec?.tds_pdf_path) {
      setPdfUrl(null);
      return;
    }
    (async () => {
      try {
        const { getTdsDownloadUrl } = await import("@/lib/tdsUpload.functions");
        const res = await getTdsDownloadUrl({ data: { path: spec.tds_pdf_path } });
        if (!cancelled) setPdfUrl(res.url);
      } catch (e) {
        if (!cancelled) setPdfError(e instanceof Error ? e.message : "Failed to load PDF");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spec?.tds_pdf_path]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [note, setNote] = useState("");

  useEffect(() => {
    // reset drafts when spec loads
    if (spec) setDrafts({});
  }, [spec?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changes = useMemo(() => {
    if (!spec) return {} as Record<string, string | number | boolean | null>;
    const out: Record<string, string | number | boolean | null> = {};
    for (const f of FIELDS) {
      if (!(f.column in drafts)) continue;
      const draft = drafts[f.column];
      const cur = spec[f.column];
      const next = fromInputValue(draft, f.kind);
      const norm = (x: unknown) => (x === "" || x === undefined ? null : x);
      if (norm(cur) !== norm(next)) out[f.column] = next;
    }
    return out;
  }, [drafts, spec]);

  const changeCount = Object.keys(changes).length;

  const saveMut = useMutation({
    mutationFn: async (opts: { markChecked?: boolean }) => {
      return doUpdate({
        data: {
          specId,
          changes,
          note: note.trim() || undefined,
          markChecked: opts.markChecked,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spec-edit", specId] });
      qc.invalidateQueries({ queryKey: ["review-list"] });
      qc.invalidateQueries({ queryKey: ["review-summary"] });
      qc.invalidateQueries({ queryKey: ["spec-manual-edits", specId] });
      setDrafts({});
      setNote("");
    },
  });

  const flagMut = useMutation({
    mutationFn: async () =>
      doSetStatus({ data: { specId, status: "flagged", note: note.trim() || undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spec-edit", specId] });
      qc.invalidateQueries({ queryKey: ["review-list"] });
      qc.invalidateQueries({ queryKey: ["review-summary"] });
    },
  });

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Review & Edit
          </p>
          <h2 className="text-sm font-semibold text-foreground truncate">
            {spec ? `${spec.vendor} · ${spec.product_name}` : "Loading…"}
            {spec?.material_number != null && (
              <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground/80">
                Traceium ID {spec.material_number}
              </span>
            )}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={spec?.review_status ?? "unreviewed"} />
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>
      </div>

      {/* Body: split panes */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: PDF */}
        <div className="w-[55%] border-r border-border bg-secondary/20 relative">
          {!spec?.tds_pdf_path ? (
            <div className="absolute inset-0 flex items-center justify-center text-center p-6">
              <div className="max-w-sm">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-foreground">No TDS PDF attached</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload one from the Master Specs list to review side-by-side.
                </p>
              </div>
            </div>
          ) : pdfError ? (
            <div className="absolute inset-0 flex items-center justify-center text-destructive text-sm p-6 text-center">
              {pdfError}
            </div>
          ) : !pdfUrl ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Preparing PDF…
            </div>
          ) : (
            <iframe
              src={pdfUrl}
              title="TDS PDF"
              className="w-full h-full border-0"
            />
          )}
        </div>

        {/* Right: editor */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <p className="p-6 text-sm text-muted-foreground">Loading spec…</p>
          )}
          {error && (
            <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
          )}
          {spec && (
            <div className="p-5 space-y-6">
              {SECTIONS.map((section) => (
                <div key={section}>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    {section}
                  </p>
                  <div className="space-y-2">
                    {FIELDS.filter((f) => f.section === section).map((f) => {
                      const rawCur = spec[f.column];
                      const value =
                        f.column in drafts
                          ? drafts[f.column]
                          : toInputValue(rawCur, f.kind);
                      const dirty = f.column in changes;
                      return (
                        <div
                          key={f.column}
                          className={`grid grid-cols-[10rem_1fr] gap-2 items-start ${
                            dirty ? "bg-[var(--accent-blue)]/5 rounded px-1 -mx-1" : ""
                          }`}
                        >
                          <label className="text-xs text-muted-foreground pt-1.5">
                            {f.label}
                            {dirty && (
                              <span className="ml-1 text-[9px] uppercase tracking-wider text-[var(--accent-blue)]">
                                edited
                              </span>
                            )}
                          </label>
                          <div>
                            {f.kind === "boolean" ? (
                              <label className="inline-flex items-center gap-2 text-xs text-foreground">
                                <input
                                  type="checkbox"
                                  checked={!!value}
                                  onChange={(e) =>
                                    setDrafts((d) => ({ ...d, [f.column]: e.target.checked }))
                                  }
                                />
                                {value ? "Yes" : "No"}
                              </label>
                            ) : f.kind === "textarea" ? (
                              <textarea
                                value={value as string}
                                rows={3}
                                onChange={(e) =>
                                  setDrafts((d) => ({ ...d, [f.column]: e.target.value }))
                                }
                                className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                              />
                            ) : (
                              <input
                                type={f.kind === "number" ? "number" : "text"}
                                step="any"
                                value={value as string}
                                onChange={(e) =>
                                  setDrafts((d) => ({ ...d, [f.column]: e.target.value }))
                                }
                                className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Reviewer Note (optional)
                </p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. corrected cure temp from datasheet page 2"
                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t border-border bg-card px-4 py-2.5 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {changeCount === 0 ? "No changes" : `${changeCount} field${changeCount === 1 ? "" : "s"} changed`}
          {spec?.reviewed_at && (
            <> · last reviewed {new Date(spec.reviewed_at).toLocaleString()}</>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => flagMut.mutate()}
            disabled={flagMut.isPending}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 text-[var(--status-warning)] hover:bg-[var(--status-warning)]/20"
          >
            <Flag className="w-3.5 h-3.5" /> Flag
          </button>
          <button
            onClick={() => saveMut.mutate({ markChecked: false })}
            disabled={saveMut.isPending || changeCount === 0}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-border bg-secondary text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> Save
          </button>
          <button
            onClick={() => saveMut.mutate({ markChecked: true })}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-[var(--status-compliant)] text-background hover:opacity-90"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Save & mark checked
          </button>
          {pdfUrl && (
            <button
              onClick={() => window.open(pdfUrl, "_blank", "noopener")}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              PDF <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const cls =
    status === "checked"
      ? "border-[var(--status-compliant)]/40 bg-[var(--status-compliant)]/10 text-[var(--status-compliant)]"
      : status === "flagged"
      ? "border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 text-[var(--status-warning)]"
      : status === "in_review"
      ? "border-[var(--accent-blue)]/40 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
      : "border-border bg-secondary text-muted-foreground";
  const label =
    status === "in_review" ? "In Review" :
    status === "unreviewed" ? "Unreviewed" :
    status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}
