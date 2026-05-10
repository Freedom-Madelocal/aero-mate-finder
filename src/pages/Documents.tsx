import DashboardLayout from "@/components/DashboardLayout";
import StatusTooltip from "@/components/StatusTooltip";
import { FileText, Plus, Upload, Info, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMaterialStore, STATUS_TOOLTIPS } from "@/data/materials";

/*
 * Design: Material Intelligence — Dark Industrial Minimalism
 * Documents page: COC and traceability documentation generation.
 * All data from the shared store — starts empty until stock reports are uploaded.
 */

export default function Documents() {
  const navigate = useNavigate();
  const store = useMaterialStore();
  const materials = store.materials;

  const isEmpty = materials.length === 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Documents & Traceability
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isEmpty
                ? "Upload material data to enable document generation"
                : "COC/COA generation, material genealogy, and certification packages — audit-ready on demand"}
            </p>
          </div>
          {!isEmpty && (
            <button
              onClick={() => toast("Document generation coming soon")}
              className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Generate Document
            </button>
          )}
        </div>

        {/* Empty state */}
        {isEmpty ? (
          <div className="bg-card border border-border rounded-lg p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">No Documents Generated</h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-6">
              Upload a stock report in Inventory to populate your material catalog.
              Documents (COC, COA, Cert Packs, Genealogy Reports) are generated automatically
              when materials are received and shipped through the platform.
            </p>
            <button
              onClick={() => navigate({ to: "/inventory" })}
              className="inline-flex items-center gap-2 bg-foreground text-background px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Upload className="w-4 h-4" />
              Go to Inventory
            </button>

            {/* Document type legend */}
            <div className="mt-8 pt-6 border-t border-border max-w-lg mx-auto">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                Document Types
              </p>
              <div className="space-y-3 text-left">
                <StatusTooltip content={STATUS_TOOLTIPS["doc-coa"]} side="right">
                  <div className="flex items-start gap-3 bg-secondary/50 rounded-md p-3 w-full">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent text-muted-foreground uppercase flex-shrink-0 mt-0.5">COA</span>
                    <div>
                      <span className="text-xs font-medium text-foreground">Certificate of Analysis</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Manufacturer test results proving the batch meets specification
                      </p>
                    </div>
                  </div>
                </StatusTooltip>
                <StatusTooltip content={STATUS_TOOLTIPS["doc-coc"]} side="right">
                  <div className="flex items-start gap-3 bg-secondary/50 rounded-md p-3 w-full">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent text-muted-foreground uppercase flex-shrink-0 mt-0.5">COC</span>
                    <div>
                      <span className="text-xs font-medium text-foreground">Certificate of Conformance</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Distributor-issued chain of custody from receipt to shipment
                      </p>
                    </div>
                  </div>
                </StatusTooltip>
                <StatusTooltip content={STATUS_TOOLTIPS["doc-mtc"]} side="right">
                  <div className="flex items-start gap-3 bg-secondary/50 rounded-md p-3 w-full">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent text-muted-foreground uppercase flex-shrink-0 mt-0.5">MTC</span>
                    <div>
                      <span className="text-xs font-medium text-foreground">Material Test Certificate</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Additional third-party or in-house test data
                      </p>
                    </div>
                  </div>
                </StatusTooltip>
                <StatusTooltip content={STATUS_TOOLTIPS["doc-genealogy"]} side="right">
                  <div className="flex items-start gap-3 bg-secondary/50 rounded-md p-3 w-full">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent text-muted-foreground uppercase flex-shrink-0 mt-0.5">GEN</span>
                    <div>
                      <span className="text-xs font-medium text-foreground">Material Genealogy Report</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Full traceability from raw material source through delivery
                      </p>
                    </div>
                  </div>
                </StatusTooltip>
              </div>
            </div>

            {/* Traceability chain explanation */}
            <div className="mt-6 pt-6 border-t border-border max-w-lg mx-auto">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                Material Genealogy Chain
              </p>
              <div className="relative text-left">
                <div className="absolute left-3 top-3 bottom-3 w-px bg-border" />
                <div className="space-y-4">
                  {[
                    { step: "Manufacturer Cert", desc: "Original COA from material manufacturer" },
                    { step: "Receiving Inspection", desc: "Visual check, COA verification, temp log review" },
                    { step: "Cold Storage Entry", desc: "Material placed in freezer, shelf life countdown begins" },
                    { step: "Quality Hold Release", desc: "QA review and release for customer allocation" },
                    { step: "Customer Allocation", desc: "Material reserved against customer PO" },
                    { step: "COC Generation", desc: "Distributor COC generated with full chain of custody" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-4 relative">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 bg-secondary">
                        <span className="text-[9px] font-mono text-muted-foreground">{i + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0 pb-1">
                        <p className="text-xs font-medium text-foreground">{item.step}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-2xl font-semibold font-mono text-foreground">0</div>
                <div className="text-xs text-muted-foreground mt-1">Total Documents</div>
              </div>
              <StatusTooltip content="Documents that have been fully generated and are ready for download or customer delivery.">
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-compliant)]" />
                    <span className="text-xs text-muted-foreground">Complete</span>
                  </div>
                  <div className="text-2xl font-semibold font-mono text-foreground">0</div>
                </div>
              </StatusTooltip>
              <StatusTooltip content="Documents awaiting additional data or approvals before they can be finalized.">
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-3.5 h-3.5 text-[var(--status-warning)]" />
                    <span className="text-xs text-muted-foreground">Pending</span>
                  </div>
                  <div className="text-2xl font-semibold font-mono text-foreground">0</div>
                </div>
              </StatusTooltip>
              <StatusTooltip content="Draft documents that have been started but not yet submitted for review.">
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Draft</span>
                  </div>
                  <div className="text-2xl font-semibold font-mono text-foreground">0</div>
                </div>
              </StatusTooltip>
            </div>

            {/* Documents placeholder */}
            <div className="bg-card border border-border rounded-lg p-16 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground">No documents generated yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-md mx-auto">
                Documents are generated automatically when materials are received and shipped.
                You can also manually generate COC, COA, and Cert Pack documents for any lot.
              </p>
              <button
                onClick={() => toast("Document generation coming soon")}
                className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity mt-4"
              >
                <Plus className="w-4 h-4" />
                Generate Document
              </button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
