import StatusTooltip from "@/components/StatusTooltip";
import {
  Thermometer,
  Snowflake,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Info,
  Upload,
  Shield,
  History,
  XCircle,
} from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMaterialStore, STATUS_TOOLTIPS } from "@/data/materials";
import type { Material, MaterialLot } from "@/data/materials";

/*
 * Design: Material Intelligence — Dark Industrial Minimalism
 * Compliance page: TSM (Time-Sensitive Material) compliance tracking.
 * Shows freezer temperatures, lot-level compliance status, and movement logs.
 */

// Mock freezer sensors
const FREEZERS = [
  { name: "Freezer A", temp: -18.2, status: "normal" as const },
  { name: "Freezer B", temp: -17.8, status: "normal" as const },
  { name: "Freezer C", temp: -15.1, status: "warning" as const },
];

// Mock movement log
const MOVEMENT_LOG = [
  { time: "2025-05-09 08:14", lot: "LOT-AF191-2025-001", material: "AF 191", action: "Removed for kitting", duration: null, operator: "J. Martinez" },
  { time: "2025-05-09 06:30", lot: "LOT-FM300-2025-003", material: "FM® 300", action: "Returned to freezer", duration: "4.5 hrs", operator: "K. Osei" },
  { time: "2025-05-08 14:22", lot: "LOT-EA9695-2025-001", material: "EA 9695 AERO", action: "Removed for inspection", duration: null, operator: "S. Park" },
  { time: "2025-05-08 09:00", lot: "LOT-AF163-2025-002", material: "AF 163-2", action: "Returned to freezer", duration: "2.0 hrs", operator: "J. Martinez" },
  { time: "2025-05-07 16:45", lot: "LOT-FM73-2025-001", material: "FM® 73", action: "Removed for shipment prep", duration: null, operator: "T. Nguyen" },
];

export default function Compliance() {
  const navigate = useNavigate();
  const store = useMaterialStore();
  const materials = store.materials;
  const lots = store.lots;

  const isEmpty = materials.length === 0;

  // Lot compliance counts
  const compliantLots = lots.filter((l: MaterialLot) => l.status === "compliant");
  const warningLots = lots.filter((l: MaterialLot) => l.status === "warning");
  const criticalLots = lots.filter((l: MaterialLot) => l.status === "critical");
  const expiredLots = lots.filter((l: MaterialLot) => l.status === "expired");
  const defrostEvents = 2; // mock

  return (
    <>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              TSM Compliance
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isEmpty
                ? "Upload material data to begin compliance tracking"
                : `Monitoring ${lots.length} lots across ${materials.length} materials`}
            </p>
          </div>
          {!isEmpty && (
            <div className="flex items-center gap-3">
              {FREEZERS.map((f) => (
                <StatusTooltip
                  key={f.name}
                  content={STATUS_TOOLTIPS[f.status === "warning" ? "temp-warning" : "temp-normal"]}
                >
                  <div className={`flex items-center gap-2 bg-card border rounded-md px-3 py-1.5 ${f.status === "warning" ? "border-[var(--status-warning)]/40" : "border-border"}`}>
                    <Thermometer className={`w-3.5 h-3.5 ${f.status === "warning" ? "text-[var(--status-warning)]" : "text-muted-foreground"}`} />
                    <span className="text-xs text-muted-foreground">{f.name}</span>
                    <span className={`text-xs font-mono ${f.status === "warning" ? "text-[var(--status-warning)]" : "text-foreground"}`}>
                      {f.temp}°C
                    </span>
                  </div>
                </StatusTooltip>
              ))}
            </div>
          )}
        </div>

        {/* Empty state */}
        {isEmpty ? (
          <div className="bg-card border border-border rounded-lg p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Shield className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">No Compliance Data</h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-6">
              Compliance tracking requires material data. Upload a stock report in Inventory first,
              then use the "Receive Material" workflow to create lot-level records with freezer life
              and out-time tracking.
            </p>
            <button
              onClick={() => navigate({ to: "/inventory" })}
              className="inline-flex items-center gap-2 bg-foreground text-background px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Upload className="w-4 h-4" />
              Go to Inventory
            </button>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatusTooltip content={STATUS_TOOLTIPS["compliance-pass"]}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-[var(--status-compliant)]" />
                    <span className="text-xs text-muted-foreground">Compliant</span>
                  </div>
                  <div className="text-2xl font-semibold font-mono text-foreground">{compliantLots.length}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">lots within limits</div>
                </div>
              </StatusTooltip>
              <StatusTooltip content={STATUS_TOOLTIPS["compliance-warning"]}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--status-warning)]" />
                    <span className="text-xs text-muted-foreground">Warning</span>
                  </div>
                  <div className="text-2xl font-semibold font-mono text-foreground">{warningLots.length}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">lots approaching limits</div>
                </div>
              </StatusTooltip>
              <StatusTooltip content={STATUS_TOOLTIPS["compliance-fail"]}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-4 h-4 text-[var(--status-critical)]" />
                    <span className="text-xs text-muted-foreground">Non-Compliant</span>
                  </div>
                  <div className="text-2xl font-semibold font-mono text-foreground">{criticalLots.length + expiredLots.length}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">lots exceeding limits</div>
                </div>
              </StatusTooltip>
              <StatusTooltip content={STATUS_TOOLTIPS["temp-critical"]}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <History className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Defrost Events</span>
                  </div>
                  <div className="text-2xl font-semibold font-mono text-foreground">{defrostEvents}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">this month</div>
                </div>
              </StatusTooltip>
            </div>

            {/* Lot compliance table */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-sm font-medium text-foreground">Lot Compliance Status</h2>
                <StatusTooltip content="Each row represents a single material lot in cold storage. Freezer life and out-time are tracked continuously.">
                  <Info className="w-3.5 h-3.5 text-muted-foreground/40" />
                </StatusTooltip>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Lot ID</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Material</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Supplier</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Location</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">
                        <StatusTooltip content={STATUS_TOOLTIPS["freezer-life"]}>
                          <span className="flex items-center justify-end gap-1 cursor-help">
                            <Snowflake className="w-3 h-3" /> Freezer Life
                          </span>
                        </StatusTooltip>
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">
                        <StatusTooltip content={STATUS_TOOLTIPS["out-time"]}>
                          <span className="flex items-center justify-end gap-1 cursor-help">
                            <Clock className="w-3 h-3" /> Out-Time
                          </span>
                        </StatusTooltip>
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Qty</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((lot: MaterialLot) => {
                      const material = materials.find((m: Material) => m.id === lot.materialId);
                      const statusColor =
                        lot.status === "compliant" ? "var(--status-compliant)"
                        : lot.status === "warning" ? "var(--status-warning)"
                        : lot.status === "critical" ? "var(--status-critical)"
                        : "oklch(0.4 0 0)";
                      const freezerPct = Math.min(100, (lot.freezerLife / 365) * 100);
                      const outTimePct = Math.min(100, (lot.outTime / lot.maxOutTime) * 100);
                      return (
                        <tr
                          key={lot.lotId}
                          className="border-b border-border/50 hover:bg-secondary/20 cursor-pointer transition-colors"
                          onClick={() => navigate({ to: "/material/$id", params: { id: String(lot.materialId) } })}
                        >
                          <td className="px-5 py-3 font-mono text-xs text-foreground">{lot.lotId}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{material?.product ?? lot.materialId}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{material?.supplier ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{lot.location}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${freezerPct}%`, backgroundColor: statusColor }}
                                />
                              </div>
                              <span className={`text-xs font-mono ${lot.freezerLife < 7 ? "text-[var(--status-critical)]" : lot.freezerLife < 30 ? "text-[var(--status-warning)]" : "text-foreground"}`}>
                                {lot.freezerLife}d
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${outTimePct}%`, backgroundColor: outTimePct > 80 ? "var(--status-critical)" : outTimePct > 50 ? "var(--status-warning)" : "var(--status-compliant)" }}
                                />
                              </div>
                              <span className={`text-xs font-mono ${outTimePct > 80 ? "text-[var(--status-critical)]" : outTimePct > 50 ? "text-[var(--status-warning)]" : "text-muted-foreground"}`}>
                                {lot.outTime}/{lot.maxOutTime}h
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-mono text-foreground">
                            {lot.quantity} {lot.unit}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusTooltip content={STATUS_TOOLTIPS[lot.status as keyof typeof STATUS_TOOLTIPS] || ""}>
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize"
                                style={{
                                  color: statusColor,
                                  backgroundColor: `color-mix(in oklch, ${statusColor} 15%, transparent)`
                                }}
                              >
                                {lot.status}
                              </span>
                            </StatusTooltip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Movement log */}
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-foreground">Movement Log</h2>
                <StatusTooltip content="Tracks every time a material lot is removed from or returned to cold storage. Each movement accumulates out-time.">
                  <Info className="w-3.5 h-3.5 text-muted-foreground/40" />
                </StatusTooltip>
              </div>
              <div className="space-y-1">
                {MOVEMENT_LOG.map((entry, i) => (
                  <div key={i} className="flex items-center gap-4 py-2.5 border-b border-border/40 last:border-0">
                    <span className="text-xs font-mono text-muted-foreground w-36 flex-shrink-0">{entry.time}</span>
                    <span className="text-xs font-mono text-foreground w-44 flex-shrink-0 truncate">{entry.lot}</span>
                    <span className="text-xs text-muted-foreground flex-1 truncate">{entry.action}</span>
                    {entry.duration ? (
                      <StatusTooltip content={STATUS_TOOLTIPS["out-time"]}>
                        <span className="text-xs font-mono text-[var(--status-warning)] flex-shrink-0">+{entry.duration}</span>
                      </StatusTooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground/40 flex-shrink-0 w-14">ongoing</span>
                    )}
                    <span className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right">{entry.operator}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
