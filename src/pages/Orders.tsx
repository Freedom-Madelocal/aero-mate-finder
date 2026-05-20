import StatusTooltip from "@/components/StatusTooltip";
import { ShoppingCart, CheckCircle2, Clock, AlertTriangle, Package, Upload, Info } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMaterialStore, STATUS_TOOLTIPS } from "@/data/materials";

/*
 * Design: Material Intelligence — Dark Industrial Minimalism
 * Orders page: Real inventory commitment logic.
 * All data from the shared store — starts empty until stock reports are uploaded.
 */

export default function Orders() {
  const navigate = useNavigate();
  const store = useMaterialStore();
  const materials = store.materials;

  const isEmpty = materials.length === 0;

  return (
    <>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Order Commitments
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isEmpty
                ? "Upload material data to enable commitment verification"
                : "Real-time availability verification before delivery promises"}
            </p>
          </div>
          {!isEmpty && (
            <button
              onClick={() => toast("New order creation coming soon")}
              className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <ShoppingCart className="w-4 h-4" />
              New Commitment Check
            </button>
          )}
        </div>

        {/* Empty state */}
        {isEmpty ? (
          <div className="bg-card border border-border rounded-lg p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">No Orders Yet</h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-6">
              Upload a stock report in Inventory to populate your material catalog.
              Once materials are loaded, you can create commitment checks to verify
              real-time availability before making delivery promises to customers.
            </p>
            <button
              onClick={() => navigate({ to: "/inventory" })}
              className="inline-flex items-center gap-2 bg-foreground text-background px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Upload className="w-4 h-4" />
              Go to Inventory
            </button>

            {/* Commitment status legend */}
            <div className="mt-8 pt-6 border-t border-border max-w-lg mx-auto">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                Commitment Status Legend
              </p>
              <div className="grid grid-cols-2 gap-3 text-left">
                <StatusTooltip content={STATUS_TOOLTIPS.confirmed} side="right">
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-md p-2.5 w-full">
                    <CheckCircle2 className="w-4 h-4 text-[var(--status-compliant)] flex-shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-foreground">Confirmed</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Material available & compliant</p>
                    </div>
                  </div>
                </StatusTooltip>
                <StatusTooltip content={STATUS_TOOLTIPS["at-risk"]} side="left">
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-md p-2.5 w-full">
                    <Clock className="w-4 h-4 text-[var(--status-warning)] flex-shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-foreground">At Risk</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Partial availability or aging lots</p>
                    </div>
                  </div>
                </StatusTooltip>
                <StatusTooltip content={STATUS_TOOLTIPS.blocked} side="right">
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-md p-2.5 w-full">
                    <AlertTriangle className="w-4 h-4 text-[var(--status-critical)] flex-shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-foreground">Blocked</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Cannot fulfill from current stock</p>
                    </div>
                  </div>
                </StatusTooltip>
                <StatusTooltip content={STATUS_TOOLTIPS.fulfilled} side="left">
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-md p-2.5 w-full">
                    <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-foreground">Fulfilled</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Shipped with COC package</p>
                    </div>
                  </div>
                </StatusTooltip>
              </div>
            </div>

            {/* How commitment checks work */}
            <div className="mt-6 pt-6 border-t border-border max-w-lg mx-auto">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
                How Commitment Checks Work
              </p>
              <div className="space-y-3 text-left">
                <div className="flex items-start gap-3 bg-secondary/50 rounded-md p-3">
                  <span className="text-xs font-mono text-muted-foreground/60 mt-0.5 flex-shrink-0">01</span>
                  <div>
                    <span className="text-xs font-medium text-foreground">Customer requests material</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Product, quantity, and requested delivery date
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-secondary/50 rounded-md p-3">
                  <span className="text-xs font-mono text-muted-foreground/60 mt-0.5 flex-shrink-0">02</span>
                  <div>
                    <span className="text-xs font-medium text-foreground">System checks lot-level availability</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Verifies sufficient compliant lots with adequate remaining life
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-secondary/50 rounded-md p-3">
                  <span className="text-xs font-mono text-muted-foreground/60 mt-0.5 flex-shrink-0">03</span>
                  <div>
                    <span className="text-xs font-medium text-foreground">Returns commitment status</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Confirmed, At Risk, or Blocked — with allocated lots and same-day ship feasibility
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-5 gap-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-2xl font-semibold font-mono text-foreground">0</div>
                <div className="text-xs text-muted-foreground mt-1">Total Orders</div>
              </div>
              <StatusTooltip content={STATUS_TOOLTIPS.confirmed}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="text-2xl font-semibold font-mono text-[var(--status-compliant)]">0</div>
                  <div className="text-xs text-muted-foreground mt-1">Confirmed</div>
                </div>
              </StatusTooltip>
              <StatusTooltip content={STATUS_TOOLTIPS["at-risk"]}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="text-2xl font-semibold font-mono text-[var(--status-warning)]">0</div>
                  <div className="text-xs text-muted-foreground mt-1">At Risk</div>
                </div>
              </StatusTooltip>
              <StatusTooltip content={STATUS_TOOLTIPS.blocked}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="text-2xl font-semibold font-mono text-[var(--status-critical)]">0</div>
                  <div className="text-xs text-muted-foreground mt-1">Blocked</div>
                </div>
              </StatusTooltip>
              <StatusTooltip content={STATUS_TOOLTIPS.fulfilled}>
                <div className="bg-card border border-border rounded-lg p-4 w-full">
                  <div className="text-2xl font-semibold font-mono text-muted-foreground">0</div>
                  <div className="text-xs text-muted-foreground mt-1">Fulfilled</div>
                </div>
              </StatusTooltip>
            </div>

            {/* Orders placeholder */}
            <div className="bg-card border border-border rounded-lg p-16 text-center">
              <ShoppingCart className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground">No orders created yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-md mx-auto">
                Create a commitment check to verify real-time material availability
                before making delivery promises. The system will check lot-level compliance,
                remaining life, and same-day ship feasibility.
              </p>
              <button
                onClick={() => toast("New order creation coming soon")}
                className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity mt-4"
              >
                <ShoppingCart className="w-4 h-4" />
                New Commitment Check
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
