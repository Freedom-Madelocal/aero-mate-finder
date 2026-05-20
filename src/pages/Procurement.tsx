import VendorContactsDialog from "@/components/VendorContactsDialog";
import {
  useProcurementStore,
  deleteProcurementRequest,
  updateProcurementRequest,
  logProcurementSend,
  addProcurementRequest,
  type ProcurementRequest,
} from "@/data/procurement";
import { useMasterSpecStore, type MasterSpec, setFrequentReorder } from "@/data/masterSpecs";
import {
  ShoppingBasket, Settings, Send, Trash2, Star, AlertTriangle, ToggleLeft, ToggleRight, Plus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type SortKey = "engineer" | "vendor" | "product";

export default function Procurement() {
  const { requests, contacts } = useProcurementStore();
  const { specs } = useMasterSpecStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("vendor");

  const specMap = useMemo(() => {
    const m = new Map<string, MasterSpec>();
    specs.forEach((s) => m.set(s.id, s));
    return m;
  }, [specs]);

  const pending = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests],
  );

  const starred = useMemo(
    () => specs.filter((s) => s.frequentReorder),
    [specs],
  );

  const vendorSuggestions = useMemo(
    () => Array.from(new Set([
      ...specs.map((s) => s.vendor),
      ...requests.map((r) => r.chosenVendor),
    ].filter(Boolean))).sort(),
    [specs, requests],
  );

  const sortedPending = useMemo(() => {
    const rows = pending.map((r) => ({ r, spec: specMap.get(r.masterSpecId) }));
    return rows.sort((a, b) => {
      if (sortBy === "engineer") return a.r.engineerName.localeCompare(b.r.engineerName);
      if (sortBy === "vendor") return a.r.chosenVendor.localeCompare(b.r.chosenVendor);
      return (a.spec?.productName ?? "").localeCompare(b.spec?.productName ?? "");
    });
  }, [pending, specMap, sortBy]);

  // Group pending by vendor for the Procure action
  const groupedByVendor = useMemo(() => {
    const groups = new Map<string, { spec?: MasterSpec; r: ProcurementRequest }[]>();
    pending.forEach((r) => {
      const arr = groups.get(r.chosenVendor) ?? [];
      arr.push({ r, spec: specMap.get(r.masterSpecId) });
      groups.set(r.chosenVendor, arr);
    });
    return groups;
  }, [pending, specMap]);

  const handleProcure = async () => {
    if (pending.length === 0) {
      toast("Nothing to procure — pick list is empty.");
      return;
    }
    const contactByVendor = new Map(contacts.map((c) => [c.vendor.toLowerCase(), c]));
    const missing: string[] = [];
    const sends: { vendor: string; email: string; subject: string; body: string; ids: string[] }[] = [];

    groupedByVendor.forEach((items, vendor) => {
      const c = contactByVendor.get(vendor.toLowerCase());
      if (!c) {
        missing.push(vendor);
        return;
      }
      const lines = items.map(({ r, spec }) => {
        const name = spec?.productName ?? "(unknown product)";
        const qty = r.quantity ? ` — qty: ${r.quantity}` : "";
        const note = r.note ? ` (${r.note})` : "";
        const eng = r.engineerName ? ` [requested by ${r.engineerName}]` : "";
        return `• ${name}${qty}${note}${eng}`;
      });
      const subject = `Procurement inquiry — availability of ${items.length} part${items.length === 1 ? "" : "s"}`;
      const body =
`Hello ${c.contactName ?? vendor} team,

Could you confirm availability and current lead time for the following parts?

${lines.join("\n")}

Thanks,
Procurement — Traceum`;
      sends.push({ vendor, email: c.email, subject, body, ids: items.map((i) => i.r.id) });
    });

    if (missing.length > 0) {
      toast.error(`Missing contact email for: ${missing.join(", ")}. Add them via the gear icon.`);
    }

    if (sends.length === 0) return;

    // Open one mailto per vendor (slight delay so the browser doesn't drop them).
    for (const s of sends) {
      const mailto = `mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent(s.subject)}&body=${encodeURIComponent(s.body)}`;
      window.open(mailto, "_blank");
      // Log + mark as sent
      await logProcurementSend({
        vendor: s.vendor, email: s.email, requestIds: s.ids, body: s.body,
      });
      await Promise.all(s.ids.map((id) => updateProcurementRequest(id, { status: "sent" })));
      await new Promise((r) => setTimeout(r, 200));
    }
    toast.success(`Drafted ${sends.length} vendor email${sends.length === 1 ? "" : "s"}.`);
  };

  const handleAddStarred = async (spec: MasterSpec) => {
    const engineerName =
      localStorage.getItem("traceum.engineerName") || spec.engineerDefaultName || "";
    if (!engineerName) {
      toast.error("Set your engineer name on the Engineer page first.");
      return;
    }
    try {
      await addProcurementRequest({
        masterSpecId: spec.id,
        engineerName,
        chosenVendor: spec.vendor,
      });
      toast.success(`Added ${spec.productName} to pick list.`);
    } catch {
      toast.error("Failed to add to pick list.");
    }
  };

  return (
    <>
      <div className="space-y-6 relative pb-20">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
              <ShoppingBasket className="w-5 h-5" /> Procurement
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pick list of parts engineers need now, plus the standing reorder list.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStarred((v) => !v)}
              className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded border border-border hover:bg-secondary"
              aria-label="Toggle starred reorder list"
            >
              {showStarred ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
              <span>Frequent reorder list</span>
            </button>
            <button
              onClick={handleProcure}
              disabled={pending.length === 0}
              className="inline-flex items-center gap-2 bg-foreground text-background rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Procure ({pending.length})
            </button>
          </div>
        </div>

        {/* Active pick list */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Active Pick List</h2>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Sort:</span>
              {(["engineer", "vendor", "product"] as SortKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setSortBy(k)}
                  className={`px-2 py-0.5 rounded ${sortBy === k ? "bg-foreground text-background" : "hover:bg-secondary"}`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Engineer</th>
                    <th className="text-left px-3 py-2 font-medium">Vendor</th>
                    <th className="text-left px-3 py-2 font-medium">Product</th>
                    <th className="text-left px-3 py-2 font-medium">Form / Chemistry</th>
                    <th className="text-left px-3 py-2 font-medium">Qty</th>
                    <th className="text-left px-3 py-2 font-medium">Note</th>
                    <th className="text-center px-3 py-2 font-medium">Contact?</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPending.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                        Pick list is empty. Engineers add items from the Engineer page.
                      </td>
                    </tr>
                  ) : (
                    sortedPending.map(({ r, spec }) => {
                      const hasContact = contacts.some(
                        (c) => c.vendor.toLowerCase() === r.chosenVendor.toLowerCase(),
                      );
                      return (
                        <tr key={r.id} className="border-t border-border hover:bg-accent/20">
                          <td className="px-3 py-2 text-foreground">{r.engineerName || "—"}</td>
                          <td className="px-3 py-2">
                            <input
                              defaultValue={r.chosenVendor}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== r.chosenVendor) updateProcurementRequest(r.id, { chosenVendor: v });
                              }}
                              className="bg-transparent border border-transparent hover:border-border rounded px-1 py-0.5 text-sm w-28"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium text-foreground">
                            {spec?.productName ?? <span className="text-muted-foreground italic">deleted spec</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {spec ? `${spec.productForm ?? "—"} / ${spec.resinChemistry ?? "—"}` : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              defaultValue={r.quantity ?? ""}
                              placeholder="—"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v !== (r.quantity ?? "")) updateProcurementRequest(r.id, { quantity: v });
                              }}
                              className="bg-transparent border border-transparent hover:border-border rounded px-1 py-0.5 text-sm w-20"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              defaultValue={r.note ?? ""}
                              placeholder="—"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v !== (r.note ?? "")) updateProcurementRequest(r.id, { note: v });
                              }}
                              className="bg-transparent border border-transparent hover:border-border rounded px-1 py-0.5 text-sm w-full"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            {hasContact ? (
                              <span className="text-[10px] font-mono uppercase text-[var(--status-compliant)]">Ready</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-[var(--status-warning)]">
                                <AlertTriangle className="w-3 h-3" /> Missing
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => deleteProcurementRequest(r.id)}
                              className="text-muted-foreground hover:text-destructive p-1"
                              aria-label="Remove from pick list"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Frequent reorder section */}
        {showStarred && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Star className="w-4 h-4 text-[var(--status-warning)]" /> Frequent Reorder ({starred.length})
            </h2>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {starred.length === 0 ? (
                <p className="text-center py-10 text-sm text-muted-foreground">
                  Engineers haven't starred any items yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Vendor</th>
                      <th className="text-left px-3 py-2 font-medium">Product</th>
                      <th className="text-left px-3 py-2 font-medium">Category</th>
                      <th className="text-left px-3 py-2 font-medium">Starred by</th>
                      <th className="px-3 py-2 w-32 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {starred.map((s) => (
                      <tr key={s.id} className="border-t border-border hover:bg-accent/20">
                        <td className="px-3 py-2 text-muted-foreground">{s.vendor}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{s.productName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.materialCategory ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.engineerDefaultName ?? "—"}</td>
                        <td className="px-3 py-2 text-right space-x-2">
                          <button
                            onClick={() => handleAddStarred(s)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-secondary"
                          >
                            <Plus className="w-3 h-3" /> Add to list
                          </button>
                          <button
                            onClick={() => setFrequentReorder(s.id, false)}
                            className="text-xs text-muted-foreground hover:text-destructive"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* Floating settings gear */}
        <button
          onClick={() => setShowSettings(true)}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center hover:opacity-90"
          aria-label="Vendor contact settings"
          title="Vendor contacts"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <VendorContactsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        contacts={contacts}
        vendorSuggestions={vendorSuggestions}
      />
    </>
  );
}
