import DashboardLayout from "@/components/DashboardLayout";
import StatusTooltip from "@/components/StatusTooltip";
import {
  Package,
  Thermometer,
  AlertTriangle,
  Clock,
  TrendingUp,
  ArrowUpRight,
  Snowflake,
  TruckIcon,
  Upload,
  Info,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMaterialStore, STATUS_TOOLTIPS, METRIC_TOOLTIPS, HEALTH_BAR_TOOLTIPS } from "@/data/materials";
import type { Material, MaterialLot } from "@/data/materials";

/*
 * Design: Material Intelligence — Dark Industrial Minimalism
 * Dashboard serves as the operational command center.
 * All data is derived from the shared store (populated via stock report uploads or seed data).
 */

export default function Dashboard() {
  const navigate = useNavigate();
  const store = useMaterialStore();
  const materials = store.materials;
  const lots = store.lots;

  const totalAvailable = materials.reduce((sum: number, m: Material) => sum + m.availableQty, 0);
  const totalIncoming = materials.reduce((sum: number, m: Material) => sum + m.incomingQty, 0);
  const totalProducts = materials.length;
  const totalActiveLots = lots.length;

  // Lot health breakdown
  const compliantLots = lots.filter((l: MaterialLot) => l.status === "compliant");
  const warningLots = lots.filter((l: MaterialLot) => l.status === "warning");
  const criticalLots = lots.filter((l: MaterialLot) => l.status === "critical");
  const expiredLots = lots.filter((l: MaterialLot) => l.status === "expired");

  const totalLots = lots.length;
  const compliantPct = totalLots > 0 ? (compliantLots.length / totalLots) * 100 : 0;
  const warningPct = totalLots > 0 ? (warningLots.length / totalLots) * 100 : 0;
  const criticalPct = totalLots > 0 ? (criticalLots.length / totalLots) * 100 : 0;
  const expiredPct = totalLots > 0 ? (expiredLots.length / totalLots) * 100 : 0;

  // Average remaining freezer life
  const activeLotsList = lots.filter((l: MaterialLot) => l.status !== "expired");
  const avgFreezerLife = activeLotsList.length > 0
    ? Math.round(activeLotsList.reduce((sum, l) => sum + l.freezerLife, 0) / activeLotsList.length)
    : 0;

  // Alerts — critical and warning lots
  const alertLots = [...criticalLots, ...warningLots, ...expiredLots].slice(0, 6);

  // Derive supplier count
  const uniqueSuppliers = new Set(materials.map((m: Material) => m.supplier));

  // Top movers — materials with highest combined available + incoming
  const topMovers = [...materials]
    .sort((a: Material, b: Material) => (b.availableQty + b.incomingQty) - (a.availableQty + a.incomingQty))
    .slice(0, 6);

  // Mock orders for commitment feasibility
  const mockOrders = [
    { id: "ORD-2025-NG-0441", customer: "Northrop Grumman", material: "AF 191", qty: 100, unit: "sqft", dueDate: "2025-05-15", status: "confirmed" as const },
    { id: "ORD-2025-L3H-0218", customer: "L3Harris Technologies", material: "FM® 300", qty: 150, unit: "sqft", dueDate: "2025-05-18", status: "confirmed" as const },
    { id: "ORD-2025-SA-0093", customer: "Spirit AeroSystems", material: "EA 9695 AERO", qty: 130, unit: "sqft", dueDate: "2025-05-12", status: "at-risk" as const },
    { id: "ORD-2025-NG-0442", customer: "Northrop Grumman", material: "AF 3028", qty: 50, unit: "sqft", dueDate: "2025-05-20", status: "blocked" as const },
  ];

  const isEmpty = materials.length === 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Operations Overview
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isEmpty
                ? "Upload a stock report to populate your dashboard"
                : `Real-time material status — ${totalProducts} products across ${uniqueSuppliers.size} suppliers`}
            </p>
          </div>
          {!isEmpty && (
            <div className="text-xs text-muted-foreground font-mono">
              Last upload:{" "}
              <span className="text-foreground">
                {store.stockReports.length > 0
                  ? store.stockReports[store.stockReports.length - 1].uploadedAt
                  : "—"}
              </span>
            </div>
          )}
        </div>

        {/* Empty state */}
        {isEmpty ? (
          <div className="bg-card border border-border rounded-lg p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Upload className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">No Materials Loaded</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Your dashboard will populate automatically once you upload a stock report.
              Go to Inventory and click "Upload Stock Report" to import your material catalog.
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
            {/* Key metrics row */}
            <div className="grid grid-cols-5 gap-4">
              <StatusTooltip content={METRIC_TOOLTIPS.activeLots}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center justify-between mb-3">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <Info className="w-3 h-3 text-muted-foreground/30" />
                  </div>
                  <div className="text-2xl font-semibold text-foreground font-mono">{totalActiveLots}</div>
                  <div className="text-xs text-muted-foreground mt-1">Active Lots</div>
                </div>
              </StatusTooltip>

              <StatusTooltip content={METRIC_TOOLTIPS.unitsAvailable}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center justify-between mb-3">
                    <Snowflake className="w-4 h-4 text-muted-foreground" />
                    <Info className="w-3 h-3 text-muted-foreground/30" />
                  </div>
                  <div className="text-2xl font-semibold text-foreground font-mono">{totalAvailable.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">Units Available</div>
                </div>
              </StatusTooltip>

              <StatusTooltip content={METRIC_TOOLTIPS.unitsIncoming}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center justify-between mb-3">
                    <TruckIcon className="w-4 h-4 text-muted-foreground" />
                    <Info className="w-3 h-3 text-muted-foreground/30" />
                  </div>
                  <div className="text-2xl font-semibold text-foreground font-mono">{totalIncoming.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">Units Incoming</div>
                </div>
              </StatusTooltip>

              <StatusTooltip content={METRIC_TOOLTIPS.avgRemainingLife}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center justify-between mb-3">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <Info className="w-3 h-3 text-muted-foreground/30" />
                  </div>
                  <div className="text-2xl font-semibold text-foreground font-mono">
                    {avgFreezerLife > 0 ? avgFreezerLife : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Avg. Days Remaining</div>
                </div>
              </StatusTooltip>

              <StatusTooltip content={METRIC_TOOLTIPS.ordersPending}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center justify-between mb-3">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    <Info className="w-3 h-3 text-muted-foreground/30" />
                  </div>
                  <div className="text-2xl font-semibold text-foreground font-mono">{mockOrders.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Orders Pending</div>
                </div>
              </StatusTooltip>
            </div>

            {/* Main content grid */}
            <div className="grid grid-cols-12 gap-4">
              {/* Material Health Overview */}
              <div className="col-span-5 bg-card border border-border rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-foreground">Material Health</h2>
                  <span className="text-xs text-muted-foreground">{totalLots} lots tracked</span>
                </div>

                {/* Health bar */}
                <div className="flex h-3 rounded-full overflow-hidden mb-4 bg-secondary">
                  {compliantPct > 0 && (
                    <StatusTooltip content={`${compliantLots.length} compliant lots (${Math.round(compliantPct)}%). ${HEALTH_BAR_TOOLTIPS.compliant}`}>
                      <div style={{ width: `${compliantPct}%`, backgroundColor: "var(--status-compliant)" }} className="h-full" />
                    </StatusTooltip>
                  )}
                  {warningPct > 0 && (
                    <StatusTooltip content={`${warningLots.length} warning lots (${Math.round(warningPct)}%). ${HEALTH_BAR_TOOLTIPS.warning}`}>
                      <div style={{ width: `${warningPct}%`, backgroundColor: "var(--status-warning)" }} className="h-full" />
                    </StatusTooltip>
                  )}
                  {criticalPct > 0 && (
                    <StatusTooltip content={`${criticalLots.length} critical lots (${Math.round(criticalPct)}%). ${HEALTH_BAR_TOOLTIPS.critical}`}>
                      <div style={{ width: `${criticalPct}%`, backgroundColor: "var(--status-critical)" }} className="h-full" />
                    </StatusTooltip>
                  )}
                  {expiredPct > 0 && (
                    <StatusTooltip content={`${expiredLots.length} expired lots (${Math.round(expiredPct)}%). ${HEALTH_BAR_TOOLTIPS.expired}`}>
                      <div style={{ width: `${expiredPct}%`, backgroundColor: "oklch(0.4 0 0)" }} className="h-full" />
                    </StatusTooltip>
                  )}
                </div>

                {/* Legend with counts */}
                <div className="space-y-2.5">
                  {[
                    { label: "Compliant", count: compliantLots.length, tooltip: HEALTH_BAR_TOOLTIPS.compliant, color: "var(--status-compliant)" },
                    { label: "Expiring <30d", count: warningLots.length, tooltip: HEALTH_BAR_TOOLTIPS.warning, color: "var(--status-warning)" },
                    { label: "Critical <7d", count: criticalLots.length, tooltip: HEALTH_BAR_TOOLTIPS.critical, color: "var(--status-critical)" },
                    { label: "Expired", count: expiredLots.length, tooltip: HEALTH_BAR_TOOLTIPS.expired, color: "oklch(0.4 0 0)" },
                  ].map((item) => (
                    <StatusTooltip key={item.label} content={item.tooltip}>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                        </div>
                        <span className="text-sm font-mono text-foreground">{item.count}</span>
                      </div>
                    </StatusTooltip>
                  ))}
                </div>

                {/* Supplier breakdown */}
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">By Supplier</p>
                  <div className="space-y-1.5">
                    {Array.from(uniqueSuppliers).slice(0, 5).map((supplier) => {
                      const count = materials.filter((m: Material) => m.supplier === supplier).length;
                      const pct = (count / totalProducts) * 100;
                      return (
                        <div key={supplier as string} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-28 truncate">{supplier as string}</span>
                          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-foreground/30 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground w-6 text-right">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Alerts panel */}
              <div className="col-span-7 bg-card border border-border rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-foreground">Active Alerts</h2>
                  <span className="text-xs text-muted-foreground">{alertLots.length} requiring attention</span>
                </div>

                {alertLots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle2 className="w-8 h-8 text-[var(--status-compliant)]/40 mb-3" />
                    <p className="text-sm text-muted-foreground">All lots within compliance</p>
                    <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">
                      No lots are approaching expiration or out-time limits.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alertLots.map((lot: MaterialLot) => {
                      const material = materials.find((m: Material) => m.id === lot.materialId);
                      const isExpired = lot.status === "expired";
                      const isCritical = lot.status === "critical";
                      const statusColor = isExpired ? "oklch(0.4 0 0)" : isCritical ? "var(--status-critical)" : "var(--status-warning)";
                      const Icon = isExpired ? XCircle : isCritical ? AlertCircle : AlertTriangle;
                      return (
                        <StatusTooltip
                          key={lot.lotId}
                          content={STATUS_TOOLTIPS[lot.status as keyof typeof STATUS_TOOLTIPS] || ""}
                        >
                          <div
                            className="flex items-start gap-3 p-3 rounded-md bg-secondary/40 border border-border/50 cursor-pointer hover:bg-accent/10 transition-colors"
                            onClick={() => navigate({ to: "/material/$id", params: { id: String(lot.materialId) } })}
                          >
                            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: statusColor }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {material?.product ?? lot.materialId}
                                </p>
                                <span
                                  className="text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                                  style={{ color: statusColor, backgroundColor: `color-mix(in oklch, ${statusColor} 15%, transparent)` }}
                                >
                                  {lot.status.toUpperCase()}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {lot.lotId} · {lot.location} ·{" "}
                                {isExpired
                                  ? "Shelf life exceeded — quarantine required"
                                  : isCritical
                                  ? `${lot.freezerLife} days freezer life remaining`
                                  : `${lot.freezerLife} days freezer life remaining`}
                              </p>
                            </div>
                          </div>
                        </StatusTooltip>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Top movers — volume overview */}
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-foreground">
                  Top Materials by Volume
                </h2>
                <button
                  onClick={() => navigate({ to: "/inventory" })}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  View all inventory <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>

              {topMovers.length > 0 ? (
                <div className="grid grid-cols-6 gap-3">
                  {topMovers.map((m: Material) => {
                    const mLots = lots.filter((l: MaterialLot) => l.materialId === m.id);
                    const hasAlert = mLots.some((l) => l.status === "critical" || l.status === "expired");
                    const hasWarning = mLots.some((l) => l.status === "warning");
                    return (
                      <div
                        key={m.id}
                        onClick={() => navigate({ to: "/material/$id", params: { id: String(m.id) } })}
                        className="bg-secondary/50 border border-border/50 rounded-lg p-3 cursor-pointer hover:bg-accent/20 transition-colors relative"
                      >
                        {(hasAlert || hasWarning) && (
                          <div
                            className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: hasAlert ? "var(--status-critical)" : "var(--status-warning)" }}
                          />
                        )}
                        <p className="text-xs text-muted-foreground">{m.supplier}</p>
                        <p className="text-sm font-medium text-foreground mt-0.5 truncate">{m.product}</p>
                        <div className="flex items-center justify-between mt-3">
                          <div>
                            <span className="text-lg font-mono font-semibold text-foreground">
                              {m.availableQty}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">{m.availableUnit}</span>
                          </div>
                          {m.incomingQty > 0 && (
                            <StatusTooltip content={STATUS_TOOLTIPS["incoming-qty"]}>
                              <div className="flex items-center gap-1">
                                <TruckIcon className="w-3 h-3 text-[var(--status-info)]" />
                                <span className="text-xs font-mono text-[var(--status-info)]">
                                  +{m.incomingQty}
                                </span>
                              </div>
                            </StatusTooltip>
                          )}
                        </div>
                        {mLots.length > 0 && (
                          <p className="text-xs text-muted-foreground/60 mt-1">{mLots.length} lot{mLots.length !== 1 ? "s" : ""}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Upload a stock report to see your top materials by volume.
                </p>
              )}
            </div>

            {/* Commitment feasibility */}
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-foreground">
                  Commitment Feasibility — Next 72 Hours
                </h2>
                <StatusTooltip content="Shows whether current inventory can fulfill upcoming customer orders. Status is derived from lot-level compliance data.">
                  <Info className="w-3.5 h-3.5 text-muted-foreground/40" />
                </StatusTooltip>
              </div>

              <div className="space-y-2">
                {mockOrders.map((order) => {
                  const statusColor =
                    order.status === "confirmed" ? "var(--status-compliant)"
                    : order.status === "at-risk" ? "var(--status-warning)"
                    : "var(--status-critical)";
                  const StatusIcon =
                    order.status === "confirmed" ? CheckCircle2
                    : order.status === "at-risk" ? AlertTriangle
                    : XCircle;
                  return (
                    <StatusTooltip
                      key={order.id}
                      content={STATUS_TOOLTIPS[order.status as keyof typeof STATUS_TOOLTIPS] || ""}
                    >
                      <div
                        className="flex items-center gap-4 p-3 rounded-md bg-secondary/40 border border-border/50 cursor-pointer hover:bg-accent/10 transition-colors"
                        onClick={() => navigate({ to: "/orders" })}
                      >
                        <StatusIcon className="w-4 h-4 flex-shrink-0" style={{ color: statusColor }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{order.customer}</span>
                            <span className="text-xs text-muted-foreground font-mono">{order.id}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {order.qty} {order.unit} of {order.material} · Due {order.dueDate}
                          </p>
                        </div>
                        <span
                          className="text-xs font-mono px-2 py-0.5 rounded flex-shrink-0 capitalize"
                          style={{ color: statusColor, backgroundColor: `color-mix(in oklch, ${statusColor} 15%, transparent)` }}
                        >
                          {order.status.replace("-", " ")}
                        </span>
                      </div>
                    </StatusTooltip>
                  );
                })}
              </div>

              <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border">
                <StatusTooltip content={STATUS_TOOLTIPS.confirmed}>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--status-compliant)" }} />
                    <span className="text-muted-foreground">Confirmed</span>
                  </span>
                </StatusTooltip>
                <StatusTooltip content={STATUS_TOOLTIPS["at-risk"]}>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--status-warning)" }} />
                    <span className="text-muted-foreground">At Risk</span>
                  </span>
                </StatusTooltip>
                <StatusTooltip content={STATUS_TOOLTIPS.blocked}>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--status-critical)" }} />
                    <span className="text-muted-foreground">Blocked</span>
                  </span>
                </StatusTooltip>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
