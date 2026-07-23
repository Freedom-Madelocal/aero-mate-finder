import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import AdminShell from "@/components/AdminShell";
import { FileText, FileX2, CheckCircle2, Flag, Circle, Search } from "lucide-react";
import {
  getReviewSummary,
  listSpecsForReview,
} from "@/lib/specManualReview.functions";
import { SpecReviewWorkspace, StatusPill } from "@/components/SpecReviewWorkspace";
import { useMasterSpecStore } from "@/data/masterSpecs";

type ReviewStatusFilter = "all" | "unreviewed" | "in_review" | "checked" | "flagged";
type PdfFilter = "all" | "yes" | "no";

export default function DataAudit() {
  const fetchSummary = useServerFn(getReviewSummary);
  const fetchList = useServerFn(listSpecsForReview);

  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState<string>("All");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatusFilter>("all");
  const [hasPdf, setHasPdf] = useState<PdfFilter>("all");
  const [openSpec, setOpenSpec] = useState<string | null>(null);

  // Vendor list from local store (mirrors master specs data)
  const store = useMasterSpecStore();
  const vendors = useMemo(() => {
    const set = new Set<string>();
    for (const s of store.specs) if (s.vendor) set.add(s.vendor);
    return ["All", ...Array.from(set).sort()];
  }, [store.specs]);

  const summaryQ = useQuery({
    queryKey: ["review-summary"],
    queryFn: () => fetchSummary({}),
    staleTime: 15_000,
  });

  const listQ = useQuery({
    queryKey: ["review-list", search, vendor, reviewStatus, hasPdf],
    queryFn: () =>
      fetchList({
        data: {
          search: search.trim() || undefined,
          vendor: vendor === "All" ? undefined : vendor,
          reviewStatus,
          hasPdf,
          limit: 200,
          offset: 0,
        },
      }),
    staleTime: 10_000,
  });

  const s = summaryQ.data;

  return (
    <AdminShell>
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Data Audit</h1>
          <p className="text-xs text-muted-foreground">
            Track TDS PDF coverage, review status, and manual edits. Assign records to a
            reviewer, verify each field against the source PDF, and mark it checked.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Metric icon={<FileText className="w-4 h-4" />} label="Total specs" value={s?.total} />
          <Metric icon={<FileText className="w-4 h-4 text-[var(--accent-blue)]" />} label="With TDS PDF" value={s?.withPdf} />
          <Metric icon={<FileX2 className="w-4 h-4 text-muted-foreground" />} label="Without PDF" value={s?.withoutPdf} />
          <Metric icon={<Circle className="w-4 h-4 text-muted-foreground" />} label="Unreviewed" value={s?.unreviewed} />
          <Metric icon={<CheckCircle2 className="w-4 h-4 text-[var(--status-compliant)]" />} label="Checked" value={s?.checked} />
          <Metric icon={<Flag className="w-4 h-4 text-[var(--status-warning)]" />} label="Flagged" value={s?.flagged} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, product, category…"
              className="w-full pl-8 pr-2 py-1.5 text-xs bg-background border border-border rounded"
            />
          </div>
          <Select label="Vendor" value={vendor} onChange={setVendor} options={vendors} />
          <Select
            label="PDF"
            value={hasPdf}
            onChange={(v) => setHasPdf(v as PdfFilter)}
            options={[
              { value: "all", label: "All" },
              { value: "yes", label: "With PDF" },
              { value: "no", label: "Missing PDF" },
            ]}
          />
          <Select
            label="Status"
            value={reviewStatus}
            onChange={(v) => setReviewStatus(v as ReviewStatusFilter)}
            options={[
              { value: "all", label: "All" },
              { value: "unreviewed", label: "Unreviewed" },
              { value: "in_review", label: "In Review" },
              { value: "checked", label: "Checked" },
              { value: "flagged", label: "Flagged" },
            ]}
          />
          <span className="text-[11px] text-muted-foreground ml-auto">
            {listQ.data?.count ?? 0} matches
          </span>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <Th>Traceium ID</Th>
                <Th>Vendor</Th>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th>PDF</Th>
                <Th>Analyzed</Th>
                <Th>Status</Th>
                <Th>Reviewed</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {listQ.error && (
                <tr><td colSpan={9} className="p-6 text-center text-destructive">{(listQ.error as Error).message}</td></tr>
              )}
              {listQ.data?.rows.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No specs match those filters.</td></tr>
              )}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(listQ.data?.rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                  <Td mono>{r.material_number ?? "—"}</Td>
                  <Td>{r.vendor ?? "—"}</Td>
                  <Td className="text-foreground">{r.product_name ?? "—"}</Td>
                  <Td>{r.material_category ?? "—"}</Td>
                  <Td>
                    {r.tds_pdf_path ? (
                      <span className="text-[var(--accent-blue)]">Yes</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
                  <Td>{r.tds_analyzed_at ? new Date(r.tds_analyzed_at).toLocaleDateString() : "—"}</Td>
                  <Td><StatusPill status={r.review_status ?? "unreviewed"} /></Td>
                  <Td>{r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString() : "—"}</Td>
                  <Td>
                    <button
                      onClick={() => setOpenSpec(r.id)}
                      className="text-[var(--accent-blue)] hover:underline"
                    >
                      Review
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openSpec && (
        <SpecReviewWorkspace specId={openSpec} onClose={() => setOpenSpec(null)} />
      )}
    </AdminShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-xl font-semibold text-foreground mt-1">{value ?? "…"}</p>
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: (string | { value: string; label: string })[];
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-background border border-border rounded px-1.5 py-1 text-xs text-foreground"
      >
        {options.map((o) => {
          const val = typeof o === "string" ? o : o.value;
          const lbl = typeof o === "string" ? o : o.label;
          return (
            <option key={val} value={val}>{lbl}</option>
          );
        })}
      </select>
    </label>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left font-medium uppercase tracking-wider text-[10px] px-3 py-2">{children}</th>;
}
function Td({ children, mono, className = "" }: { children?: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <td className={`px-3 py-2 ${mono ? "font-mono text-[11px]" : ""} ${className}`}>{children}</td>
  );
}
