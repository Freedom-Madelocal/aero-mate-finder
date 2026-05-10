import { useEffect, useState } from "react";
import { X, Plus, Trash2, Mail } from "lucide-react";
import {
  upsertVendorContact,
  deleteVendorContact,
  type VendorContact,
} from "@/data/procurement";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  contacts: VendorContact[];
  /** Vendors mentioned anywhere in master_specs / requests, used as suggestions */
  vendorSuggestions: string[];
}

export default function VendorContactsDialog({
  open, onClose, contacts, vendorSuggestions,
}: Props) {
  const [vendor, setVendor] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setVendor(""); setContactName(""); setEmail(""); setNotes("");
    }
  }, [open]);

  if (!open) return null;

  const knownVendors = new Set(contacts.map((c) => c.vendor.toLowerCase()));
  const missing = vendorSuggestions.filter((v) => !knownVendors.has(v.toLowerCase()));

  const handleSave = async () => {
    if (!vendor.trim() || !email.trim()) {
      toast.error("Vendor and email are required.");
      return;
    }
    setBusy(true);
    try {
      await upsertVendorContact({
        vendor: vendor.trim(),
        contactName: contactName.trim() || undefined,
        email: email.trim(),
        notes: notes.trim() || undefined,
      });
      toast.success("Contact saved.");
      setVendor(""); setContactName(""); setEmail(""); setNotes("");
    } catch (e) {
      toast.error("Failed to save contact.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteVendorContact(id);
      toast("Contact removed.");
    } catch {
      toast.error("Failed to remove.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-xl bg-card border-l border-border h-full overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Vendor Contacts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Email addresses used by the Procure action to reach each vendor.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Add / edit form */}
          <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Add or update vendor
            </p>
            <input
              list="vendor-suggestions"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Vendor (e.g. Henkel)"
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
            />
            <datalist id="vendor-suggestions">
              {vendorSuggestions.map((v) => <option key={v} value={v} />)}
            </datalist>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact name (optional)"
                className="bg-background border border-border rounded px-3 py-2 text-sm"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@vendor.com"
                className="bg-background border border-border rounded px-3 py-2 text-sm"
              />
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
            />
            <button
              onClick={handleSave}
              disabled={busy}
              className="inline-flex items-center gap-2 bg-foreground text-background rounded px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              <Plus className="w-4 h-4" /> Save Contact
            </button>
          </div>

          {missing.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <p className="mb-1.5">Vendors without a contact yet:</p>
              <div className="flex flex-wrap gap-1">
                {missing.map((v) => (
                  <button
                    key={v}
                    onClick={() => setVendor(v)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-border hover:border-foreground/40"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Saved contacts ({contacts.length})
            </p>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded">
                No vendor contacts yet.
              </p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 p-3 bg-card">
                    <Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{c.vendor}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.contactName ? `${c.contactName} · ` : ""}{c.email}
                      </p>
                      {c.notes && <p className="text-xs text-muted-foreground/80 mt-1">{c.notes}</p>}
                    </div>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      aria-label="Delete contact"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
