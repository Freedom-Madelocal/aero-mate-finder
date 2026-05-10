import DashboardLayout from "@/components/DashboardLayout";
import StatusTooltip from "@/components/StatusTooltip";
import { useParams, useLocation } from "wouter";
import { useState } from "react";
import {
  ArrowLeft,
  Package,
  Snowflake,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  TruckIcon,
  MapPin,
  Shield,
  ChevronRight,
  Info,
} from "lucide-react";
import { useMaterialStore, STATUS_TOOLTIPS, METRIC_TOOLTIPS } from "@/data/materials";
import type { Material, MaterialLot, COARecord, COCRecord } from "@/data/materials";

/*
 * MaterialDetail — Deep-dive into a single material.
 * Shows volumes (available + incoming), lot-level breakdown, and COA/COC records.
 * All data comes from the shared reactive store (populated via stock report uploads).
 */

export default function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"lots" | "coa" | "coc">("lots");
  const store = useMaterialStore();

  const material = store.materials.find((m: Material) => m.id === id);
  const lots = store.lots.filter((l: MaterialLot) => l.materialId === id);
  const coas = store.coaRecords.filter((c: COARecord) => c.materialId === id);
  const cocs = store.cocRecords.filter((c: COCRecord) => c.materialId === id);

  if (!material) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-3">
          <Package className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-muted-foreground">Material not found</p>
          <button
            onClick={() => setLocation("/inventory")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Return to Inventory
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back navigation */}
        <button
          onClick={() => setLocation("/inventory")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Inventory
        </button>

        {/* Material header */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 bg-secondary rounded text-muted-foreground">
                  {material.supplier}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 bg-secondary rounded text-muted-foreground">
                  {material.form}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 bg-secondary rounded text-muted-foreground">
                  {material.chemistry}
                </span>
              </div>
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                {material.product}
              </h1>
              {material.formerName && (
                <p className="text-sm text-muted-foreground mt-1">
                  Formerly: {material.formerName}
                </p>
              )}
              {material.notes && (
                <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
                  {material.notes}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
                    material.nasaE595 === "✓"
                      ? "bg-[oklch(0.72_0.17_155_/_0.1)] text-[var(--status-compliant)]"
                      : material.nasaE595 === "—"
                      ? "bg-secondary text-muted-foreground"
                      : "bg-[oklch(0.75_0.15_75_/_0.1)] text-[var(--status-warning)]"
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  NASA E595: {material.nasaE595 === "✓" ? "Passed" : material.nasaE595 === "—" ? "N/A" : "Verify by Grade"}
                </span>
              </StatusTooltip>
            </div>
          </div>

          {/* Specs row */}
          <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground">Max Service Temp</p>
              <p className="text-sm font-mono text-foreground mt-0.5">
                {material.maxServiceTemp === "—" ? "N/A" : `${material.maxServiceTemp}°C`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cure Temp</p>
              <p className="text-sm font-mono text-foreground mt-0.5">
                {material.cureTemp === "—" ? "N/A" : `${material.cureTemp}°C`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">OOA Capable</p>
              <StatusTooltip
                content={
                  material.ooaCapable === "Yes"
                    ? STATUS_TOOLTIPS["ooa-yes"]
                    : STATUS_TOOLTIPS["ooa-no"]
                }
              >
                <p className="text-sm font-mono text-foreground mt-0.5">{material.ooaCapable}</p>
              </StatusTooltip>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Material ID</p>
              <p className="text-sm font-mono text-foreground mt-0.5">{material.id}</p>
            </div>
          </div>

          {/* Custom fields from stock report */}
          {material.customFields && Object.keys(material.customFields).length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                Application Data
                <StatusTooltip content="These fields were added from a stock report upload and indicate material suitability for specific application categories.">
                  <Info className="w-3 h-3 ml-1 inline text-muted-foreground/60" />
                </StatusTooltip>
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(material.customFields).map(([key, value]) => (
                  <StatusTooltip
                    key={key}
                    content={
                      value === "✓" ? STATUS_TOOLTIPS["custom-check"]
                        : value === "✗" ? STATUS_TOOLTIPS["custom-cross"]
                        : STATUS_TOOLTIPS["custom-dash"]
                    }
                  >
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono ${
                        value === "✓"
                          ? "bg-[oklch(0.72_0.17_155_/_0.08)] text-[var(--status-compliant)]"
                          : value === "✗"
                          ? "bg-secondary text-muted-foreground/50"
                          : "bg-secondary text-muted-foreground/30"
                      }`}
                    >
                      {key}: {value || "—"}
                    </span>
                  </StatusTooltip>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Volume cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatusTooltip content={METRIC_TOOLTIPS.unitsAvailable}>
            <div className="bg-card border border-border rounded-lg p-4 w-full">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Available</span>
              </div>
              <div className="text-2xl font-semibold font-mono text-foreground">
                {material.availableQty}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{material.availableUnit}</div>
            </div>
          </StatusTooltip>

          <StatusTooltip content={STATUS_TOOLTIPS["incoming-qty"]}>
            <div className="bg-card border border-border rounded-lg p-4 w-full">
              <div className="flex items-center gap-2 mb-3">
                <TruckIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Incoming</span>
              </div>
              <div className="text-2xl font-semibold font-mono text-foreground">
                {material.incomingQty}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {material.incomingEta ? `ETA: ${material.incomingEta}` : "None scheduled"}
              </div>
            </div>
          </StatusTooltip>

          <StatusTooltip content={METRIC_TOOLTIPS.activeLots}>
            <div className="bg-card border border-border rounded-lg p-4 w-full">
              <div className="flex items-center gap-2 mb-3">
                <Snowflake className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Active Lots</span>
              </div>
              <div className="text-2xl font-semibold font-mono text-foreground">
                {material.activeLots}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                of {material.totalLots} total
              </div>
            </div>
          </StatusTooltip>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Documents</span>
            </div>
            <div className="text-2xl font-semibold font-mono text-foreground">
              {coas.length + cocs.length}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">COA + COC records</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex items-center gap-6">
            {[
              { key: "lots", label: "Lot Inventory", count: lots.length },
              { key: "coa", label: "Certificates of Analysis", count: coas.length },
              { key: "coc", label: "Certificates of Conformance", count: cocs.length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as "lots" | "coa" | "coc")}
                className={`pb-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <StatusTooltip
                  content={
                    tab.key === "lots"
                      ? "Individual lot records for this material, showing freezer life, out-time, and compliance status."
                      : tab.key === "coa"
                      ? STATUS_TOOLTIPS["doc-coa"]
                      : STATUS_TOOLTIPS["doc-coc"]
                  }
                >
                  {tab.label}
                  <span className="ml-2 text-xs font-mono text-muted-foreground">
                    ({tab.count})
                  </span>
                </StatusTooltip>
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === "lots" && <LotsTab lots={lots} />}
        {activeTab === "coa" && <COATab records={coas} />}
        {activeTab === "coc" && <COCTab records={cocs} />}
      </div>
    </DashboardLayout>
  );
}

function LotsTab({ lots }: { lots: MaterialLot[] }) {
  if (lots.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <Snowflake className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">No lot records available for this material.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Lot data will appear here once material is received and tracked through the "Receive Material" workflow.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Lot ID
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Qty
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Location
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <StatusTooltip content={STATUS_TOOLTIPS["freezer-life"]}>
                Freezer Life
                <Info className="w-3 h-3 ml-1 text-muted-foreground/40" />
              </StatusTooltip>
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <StatusTooltip content={STATUS_TOOLTIPS["out-time"]}>
                Out-Time
                <Info className="w-3 h-3 ml-1 text-muted-foreground/40" />
              </StatusTooltip>
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr
              key={lot.lotId}
              className="border-b border-border/50 hover:bg-accent/20 transition-colors"
            >
              <td className="py-3 px-4">
                <span className="font-mono text-foreground text-sm">{lot.lotId}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Received: {lot.receivedDate}
                </p>
              </td>
              <td className="py-3 px-4 font-mono text-foreground">
                {lot.quantity} {lot.unit}
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{lot.location}</span>
                </div>
              </td>
              <td className="py-3 px-4">
                <StatusTooltip
                  content={
                    lot.freezerLife <= 7
                      ? `Critical: Only ${lot.freezerLife} days remaining. ${STATUS_TOOLTIPS.critical}`
                      : lot.freezerLife <= 30
                      ? `Warning: ${lot.freezerLife} days remaining. ${STATUS_TOOLTIPS.warning}`
                      : `${lot.freezerLife} days remaining. ${STATUS_TOOLTIPS.compliant}`
                  }
                >
                  <div className="flex items-center gap-2">
                    <Snowflake className="w-3 h-3 text-muted-foreground" />
                    <span
                      className={`text-sm font-mono ${
                        lot.freezerLife <= 7
                          ? "text-[var(--status-critical)]"
                          : lot.freezerLife <= 30
                          ? "text-[var(--status-warning)]"
                          : "text-foreground"
                      }`}
                    >
                      {lot.freezerLife}d
                    </span>
                  </div>
                </StatusTooltip>
              </td>
              <td className="py-3 px-4">
                <StatusTooltip
                  content={`${lot.outTime} of ${lot.maxOutTime} hours used (${Math.round((lot.outTime / lot.maxOutTime) * 100)}%). ${STATUS_TOOLTIPS["out-time"]}`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm font-mono text-muted-foreground">
                      {lot.outTime}/{lot.maxOutTime}h
                    </span>
                    <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min((lot.outTime / lot.maxOutTime) * 100, 100)}%`,
                          backgroundColor:
                            lot.outTime / lot.maxOutTime > 0.75
                              ? "var(--status-critical)"
                              : lot.outTime / lot.maxOutTime > 0.5
                              ? "var(--status-warning)"
                              : "var(--status-compliant)",
                        }}
                      />
                    </div>
                  </div>
                </StatusTooltip>
              </td>
              <td className="py-3 px-4">
                <StatusTooltip content={STATUS_TOOLTIPS[lot.status]}>
                  <StatusBadge status={lot.status} />
                </StatusTooltip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function COATab({ records }: { records: COARecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(
    records.length > 0 ? records[0].id : null
  );

  if (records.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">No COA records available for this material.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Certificate of Analysis data will appear once manufacturer test results are uploaded.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <div key={record.id} className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
            className="w-full flex items-center justify-between p-4 hover:bg-accent/20 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center">
                <FileText className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">{record.id}</p>
                <p className="text-xs text-muted-foreground">
                  Batch: {record.batchNumber} — Issued: {record.issueDate}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{record.manufacturer}</span>
              <ChevronRight
                className={`w-4 h-4 text-muted-foreground transition-transform ${
                  expandedId === record.id ? "rotate-90" : ""
                }`}
              />
            </div>
          </button>

          {expandedId === record.id && (
            <div className="border-t border-border p-5 space-y-5">
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Test Results
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-xs text-muted-foreground font-medium">Property</th>
                      <th className="text-left py-2 text-xs text-muted-foreground font-medium">Result</th>
                      <th className="text-left py-2 text-xs text-muted-foreground font-medium">Specification</th>
                      <th className="text-left py-2 text-xs text-muted-foreground font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.testResults.map((test, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-2 text-foreground">{test.property}</td>
                        <td className="py-2 font-mono text-foreground">{test.value} {test.unit}</td>
                        <td className="py-2 font-mono text-muted-foreground">{test.spec}</td>
                        <td className="py-2">
                          <StatusTooltip
                            content={test.pass ? "Test result meets or exceeds the specification requirement." : "Test result does NOT meet the specification. Material may be non-conforming for this property."}
                          >
                            {test.pass ? (
                              <CheckCircle2 className="w-4 h-4 text-[var(--status-compliant)]" />
                            ) : (
                              <XCircle className="w-4 h-4 text-[var(--status-critical)]" />
                            )}
                          </StatusTooltip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Shelf Life</p>
                  <p className="text-sm text-foreground mt-0.5">{record.shelfLife}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Storage Conditions</p>
                  <p className="text-sm text-foreground mt-0.5">{record.storageConditions}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Certified By</p>
                  <p className="text-sm text-foreground mt-0.5">{record.certifiedBy}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function COCTab({ records }: { records: COCRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(
    records.length > 0 ? records[0].id : null
  );

  if (records.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">No COC records available for this material.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Certificate of Conformance data will appear once material is shipped to a customer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <div key={record.id} className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
            className="w-full flex items-center justify-between p-4 hover:bg-accent/20 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center">
                <Shield className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">{record.id}</p>
                <p className="text-xs text-muted-foreground">
                  Order: {record.orderNumber} — Customer: {record.customer}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Shipped: {record.shipDate}</span>
              <ChevronRight
                className={`w-4 h-4 text-muted-foreground transition-transform ${
                  expandedId === record.id ? "rotate-90" : ""
                }`}
              />
            </div>
          </button>

          {expandedId === record.id && (
            <div className="border-t border-border p-5 space-y-5">
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Chain of Custody
                </h3>
                <div className="space-y-0">
                  {record.chainOfCustody.map((event, i) => (
                    <div key={i} className="flex items-start gap-3 relative">
                      {i < record.chainOfCustody.length - 1 && (
                        <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border" />
                      )}
                      <div className="w-[15px] h-[15px] rounded-full bg-secondary border-2 border-border flex-shrink-0 mt-0.5 relative z-10" />
                      <div className="pb-4 flex-1">
                        <p className="text-sm text-foreground">{event.event}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono">{event.timestamp}</span>
                          <span className="text-xs text-muted-foreground">{event.actor}</span>
                          {event.temp && (
                            <span className="text-xs font-mono text-muted-foreground">{event.temp}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">{event.location}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Compliance Statements
                </h3>
                <ul className="space-y-2">
                  {record.complianceStatements.map((statement, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-compliant)] mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-foreground">{statement}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Signed By</p>
                  <p className="text-sm text-foreground mt-0.5">{record.signedBy}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Issue Date</p>
                  <p className="text-sm font-mono text-foreground mt-0.5">{record.issueDate}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    compliant: {
      label: "Compliant",
      color: "var(--status-compliant)",
      bg: "oklch(0.72 0.17 155 / 0.1)",
    },
    warning: {
      label: "Warning",
      color: "var(--status-warning)",
      bg: "oklch(0.75 0.15 75 / 0.1)",
    },
    critical: {
      label: "Critical",
      color: "var(--status-critical)",
      bg: "oklch(0.63 0.2 25 / 0.1)",
    },
    expired: {
      label: "Expired",
      color: "oklch(0.5 0 0)",
      bg: "oklch(0.3 0 0 / 0.3)",
    },
  };

  const { label, color, bg } = config[status] || config.compliant;

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color, backgroundColor: bg }}
    >
      {label}
    </span>
  );
}
