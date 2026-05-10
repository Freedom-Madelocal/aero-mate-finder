import DashboardLayout from "@/components/DashboardLayout";
import StatusTooltip from "@/components/StatusTooltip";
import { Truck, AlertTriangle, CheckCircle2, Clock, Package, Upload, Info } from "lucide-react";
import { useLocation } from "wouter";
import { useMaterialStore, STATUS_TOOLTIPS } from "@/data/materials";
import type { Material } from "@/data/materials";
import { useMemo } from "react";

/*
 * Design: Material Intelligence — Dark Industrial Minimalism
 * Suppliers page: Supplier delay visibility and inbound tracking.
 * All data from the shared store — starts empty until stock reports are uploaded.
 */

export default function Suppliers() {
  const [, setLocation] = useLocation();
  const store = useMaterialStore();
  const materials = store.materials;

  const isEmpty = materials.length === 0;

  // Derive unique suppliers and their product counts from the store
  const supplierData = useMemo(() => {
    const map = new Map<string, { count: number; available: number; incoming: number }>();
    materials.forEach((m: Material) => {
      const existing = map.get(m.supplier) || { count: 0, available: 0, incoming: 0 };
      existing.count += 1;
      existing.available += m.availableQty;
      existing.incoming += m.incomingQty;
      map.set(m.supplier, existing);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [materials]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Supplier Visibility
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isEmpty
                ? "Upload material data to see supplier overview"
                : `Tracking ${supplierData.length} suppliers — inbound shipment tracking activates with purchase orders`}
            </p>
          </div>
        </div>

        {/* Empty state */}
        {isEmpty ? (
          <div className="bg-card border border-border rounded-lg p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Truck className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">No Supplier Data</h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-6">
              Upload a stock report in Inventory to populate supplier data.
              Inbound shipment tracking and delay visibility will activate once purchase orders are created.
            </p>
            <button
              onClick={() => setLocation("/inventory")}
              className="inline-flex items-center gap-2 bg-foreground text-background px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Upload className="w-4 h-4" />
              Go to Inventory
            </button>

            {/* Shipment status legend */}
            <div className="mt-8 pt-6 border-t border-border max-w-lg mx-auto">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                Shipment Status Legend
              </p>
              <div className="grid grid-cols-2 gap-3 text-left">
                <StatusTooltip content={STATUS_TOOLTIPS["shipment-on-track"]} side="right">
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-md p-2.5 w-full">
                    <CheckCircle2 className="w-4 h-4 text-[var(--status-compliant)] flex-shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-foreground">On Track</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Arriving as scheduled</p>
                    </div>
                  </div>
                </StatusTooltip>
                <StatusTooltip content={STATUS_TOOLTIPS["shipment-delayed"]} side="left">
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-md p-2.5 w-full">
                    <AlertTriangle className="w-4 h-4 text-[var(--status-critical)] flex-shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-foreground">Delayed</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Confirmed supplier delay</p>
                    </div>
                  </div>
                </StatusTooltip>
                <StatusTooltip content={STATUS_TOOLTIPS["shipment-arrived"]} side="right">
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-md p-2.5 w-full">
                    <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-foreground">Arrived</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Pending incoming inspection</p>
                    </div>
                  </div>
                </StatusTooltip>
                <StatusTooltip content={STATUS_TOOLTIPS["shipment-inspecting"]} side="left">
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-md p-2.5 w-full">
                    <Clock className="w-4 h-4 text-[var(--status-warning)] flex-shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-foreground">Inspecting</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Undergoing incoming QC</p>
                    </div>
                  </div>
                </StatusTooltip>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Suppliers</span>
                </div>
                <div className="text-2xl font-semibold font-mono text-foreground">{supplierData.length}</div>
                <div className="text-xs text-muted-foreground mt-1">active suppliers</div>
              </div>
              <StatusTooltip content="Total number of unique products from all suppliers in your inventory.">
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Products</span>
                  </div>
                  <div className="text-2xl font-semibold font-mono text-foreground">{materials.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">across all suppliers</div>
                </div>
              </StatusTooltip>
              <StatusTooltip content="Number of inbound shipments currently in transit. Populated when purchase orders are created.">
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-[var(--status-compliant)]" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Inbound</span>
                  </div>
                  <div className="text-2xl font-semibold font-mono text-foreground">0</div>
                  <div className="text-xs text-muted-foreground mt-1">active shipments</div>
                </div>
              </StatusTooltip>
              <StatusTooltip content="Number of shipments with confirmed delays from suppliers. Triggers customer impact analysis.">
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--status-critical)]" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Delayed</span>
                  </div>
                  <div className="text-2xl font-semibold font-mono text-foreground">0</div>
                  <div className="text-xs text-muted-foreground mt-1">confirmed delays</div>
                </div>
              </StatusTooltip>
            </div>

            <div className="grid grid-cols-12 gap-4">
              {/* Inbound shipments placeholder */}
              <div className="col-span-8 bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-sm font-medium text-foreground">Inbound Shipments</h2>
                  <StatusTooltip content="Tracks all inbound purchase orders from suppliers. Shows expected arrival dates, delay status, and affected customer orders.">
                    <Info className="w-3.5 h-3.5 text-muted-foreground/40" />
                  </StatusTooltip>
                </div>

                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Truck className="w-8 h-8 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">No inbound shipments</p>
                  <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">
                    Shipment tracking activates when purchase orders are created.
                    Delays will be flagged automatically with affected customer impact analysis.
                  </p>
                </div>
              </div>

              {/* Supplier performance */}
              <div className="col-span-4 bg-card border border-border rounded-lg">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-sm font-medium text-foreground">Supplier Overview</h2>
                  <StatusTooltip content="Shows product count and inventory volume per supplier. Performance metrics (on-time %, avg delay) will populate with order history.">
                    <Info className="w-3.5 h-3.5 text-muted-foreground/40" />
                  </StatusTooltip>
                </div>

                <div className="divide-y divide-border/50">
                  {supplierData.map((supplier) => (
                    <div key={supplier.name} className="px-5 py-3 hover:bg-accent/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{supplier.name}</span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {supplier.count} product{supplier.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="text-xs text-muted-foreground">
                          Available: <span className="font-mono text-foreground">{supplier.available}</span>
                        </span>
                        {supplier.incoming > 0 && (
                          <span className="text-xs text-[var(--status-info)]">
                            Incoming: <span className="font-mono">+{supplier.incoming}</span>
                          </span>
                        )}
                      </div>
                      {/* Performance bar placeholder */}
                      <div className="mt-2">
                        <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-muted-foreground/20 rounded-full" style={{ width: "0%" }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground/40 mt-1">On-time % will populate with order history</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
