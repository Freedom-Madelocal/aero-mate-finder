import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UserPlus, X, Trash2, Sparkles } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Contact {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  source: string;
  lead_signup_id: string | null;
  promoted_user_id: string | null;
  promoted_at: string | null;
  created_at: string;
}

interface Org { id: string; name: string }

const INVITABLE: AppRole[] = ["super_admin", "org_admin", "engineer", "procurement", "dev", "integrator"];

export default function AdminCrm() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Contact[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ full_name: "", email: "", phone: "", company: "", notes: "" });
  const [promote, setPromote] = useState<Contact | null>(null);

  useEffect(() => {
    if (!loading && !isSuperAdmin) navigate({ to: "/" });
  }, [loading, isSuperAdmin, navigate]);

  const load = useCallback(async () => {
    setBusy(true);
    const [{ data: contacts, error }, { data: orgsData }] = await Promise.all([
      supabase.from("crm_contacts").select("*").order("created_at", { ascending: false }),
      supabase.from("organizations").select("id,name").order("name"),
    ]);
    if (error) toast.error(error.message);
    setRows((contacts as Contact[]) ?? []);
    setOrgs(orgsData ?? []);
    setBusy(false);
  }, []);

  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.email.trim()) return toast.error("Email required");
    const { error } = await supabase.from("crm_contacts").insert({
      full_name: draft.full_name.trim() || null,
      email: draft.email.trim().toLowerCase(),
      phone: draft.phone.trim() || null,
      company: draft.company.trim() || null,
      notes: draft.notes.trim() || null,
      source: "manual",
    });
    if (error) return toast.error(error.message);
    toast.success("Contact added");
    setDraft({ full_name: "", email: "", phone: "", company: "", notes: "" });
    setShowAdd(false);
    load();
  };

  const updateNotes = async (id: string, notes: string) => {
    await supabase.from("crm_contacts").update({ notes }).eq("id", id);
  };

  const updatePhone = async (id: string, phone: string) => {
    await supabase.from("crm_contacts").update({ phone: phone || null }).eq("id", id);
  };

  const removeContact = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    const { error } = await supabase.from("crm_contacts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  if (loading || !isSuperAdmin) return <div className="min-h-screen bg-background" />;

  return (
    <AdminShell>
      <div className="p-6 sm:p-10 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">CRM</h1>
            <p className="text-sm text-muted-foreground">Super admin · leads from the free guide and manually-added contacts.</p>
          </div>
          <button onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded-md text-sm font-medium">
            <UserPlus className="w-4 h-4" /> Add contact
          </button>
        </div>

        {showAdd && (
          <form onSubmit={addContact} className="grid sm:grid-cols-2 gap-3 border border-border rounded-md p-4 bg-secondary/30">
            <Field label="Name"><input value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} className={inputCls} /></Field>
            <Field label="Email *"><input type="email" required value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputCls} /></Field>
            <Field label="Phone"><input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className={inputCls} /></Field>
            <Field label="Company"><input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} className={inputCls} /></Field>
            <div className="sm:col-span-2">
              <Field label="Notes"><textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={inputCls} /></Field>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-2 text-sm border border-border rounded-md">Cancel</button>
              <button className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium">Save contact</button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Contact</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Notes</th>
                <th className="p-3">Source</th>
                <th className="p-3">Added</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="p-3 min-w-48">
                    <div className="font-medium">{r.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                    {r.company && <div className="text-xs text-muted-foreground">{r.company}</div>}
                  </td>
                  <td className="p-3">
                    <input
                      defaultValue={r.phone ?? ""}
                      onBlur={(e) => updatePhone(r.id, e.target.value.trim())}
                      placeholder="—"
                      className="w-32 bg-secondary border border-border rounded px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="p-3 min-w-64">
                    <textarea
                      defaultValue={r.notes ?? ""}
                      onBlur={(e) => updateNotes(r.id, e.target.value)}
                      placeholder="Add notes…"
                      rows={2}
                      className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="p-3 text-xs">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border ${
                      r.source === "lead_magnet"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-secondary text-muted-foreground border-border"
                    }`}>{r.source.replace("_", " ")}</span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      {r.promoted_at ? (
                        <span className="text-xs text-emerald-400">promoted</span>
                      ) : (
                        <button
                          onClick={() => setPromote(r)}
                          className="inline-flex items-center gap-1.5 bg-white text-black rounded-md px-2.5 py-1 text-xs font-medium hover:opacity-90"
                        >
                          <Sparkles className="w-3 h-3" /> Promote to user
                        </button>
                      )}
                      <button
                        onClick={() => removeContact(r.id)}
                        className="inline-flex items-center border border-border rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !busy && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">No contacts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {promote && (
        <PromoteModal
          contact={promote}
          orgs={orgs}
          onClose={() => setPromote(null)}
          onDone={() => { setPromote(null); load(); }}
          onOrgsRefresh={load}
        />
      )}
    </AdminShell>
  );
}

const inputCls = "w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function PromoteModal({
  contact, orgs, onClose, onDone, onOrgsRefresh,
}: {
  contact: Contact;
  orgs: Org[];
  onClose: () => void;
  onDone: () => void;
  onOrgsRefresh: () => void;
}) {
  const [orgMode, setOrgMode] = useState<"existing" | "new">(orgs.length ? "existing" : "new");
  const [orgId, setOrgId] = useState<string>(orgs[0]?.id ?? "");
  const [newOrgName, setNewOrgName] = useState("");
  const [role, setRole] = useState<AppRole>("engineer");
  const [demo, setDemo] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let targetOrgId = orgId;
      if (orgMode === "new") {
        const name = newOrgName.trim();
        if (!name) { toast.error("Organization name required"); setSubmitting(false); return; }
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `org-${Date.now()}`;
        const { data: org, error } = await supabase.from("organizations").insert({ name, slug }).select("id").single();
        if (error || !org) { toast.error(error?.message || "Failed to create org"); setSubmitting(false); return; }
        targetOrgId = org.id;
        onOrgsRefresh();
      }
      if (!targetOrgId) { toast.error("Pick an organization"); setSubmitting(false); return; }

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: contact.email.trim().toLowerCase(),
          full_name: contact.full_name ?? "",
          role,
          organization_id: targetOrgId,
          demo_mode: demo,
          redirectTo: `${window.location.origin}/accept-invite`,
        },
      });
      if (error || (data && (data as { error?: string }).error)) {
        const msg = (data as { error?: string } | null)?.error || error?.message || "Failed to invite";
        toast.error(msg);
        setSubmitting(false);
        return;
      }

      await supabase
        .from("crm_contacts")
        .update({ promoted_at: new Date().toISOString() })
        .eq("id", contact.id);

      toast.success("Invitation sent");
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-xl flex flex-col">
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold">Promote to user</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{contact.full_name || contact.email}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <div className="flex gap-2 mb-2 text-xs">
              <button type="button" onClick={() => setOrgMode("existing")} disabled={!orgs.length}
                className={`px-2 py-1 rounded border ${orgMode === "existing" ? "bg-white text-black border-white" : "border-border text-muted-foreground"}`}>
                Existing org
              </button>
              <button type="button" onClick={() => setOrgMode("new")}
                className={`px-2 py-1 rounded border ${orgMode === "new" ? "bg-white text-black border-white" : "border-border text-muted-foreground"}`}>
                + New org
              </button>
            </div>
            {orgMode === "existing" ? (
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={inputCls}>
                <option value="">— select —</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : (
              <input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="Acme Aerospace" className={inputCls} />
            )}
          </div>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={inputCls}>
              {INVITABLE.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
            Start in demo mode (48-hour trial)
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm border border-border rounded-md">Cancel</button>
          <button disabled={submitting} className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60">
            {submitting ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
