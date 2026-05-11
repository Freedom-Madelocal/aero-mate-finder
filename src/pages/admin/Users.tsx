import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, UserPlus, Activity, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { toast } from "sonner";

const INVITABLE: AppRole[] = ["super_admin", "org_admin", "engineer", "procurement", "dev", "integrator"];

const ALL_ROLES: AppRole[] = ["super_admin", "org_admin", "engineer", "procurement", "dev", "integrator"];

interface Row {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string | null;
  org_name?: string | null;
  roles: AppRole[];
  demo_mode: boolean;
  first_login_at: string | null;
  extension_requested_at: string | null;
  last_login_at: string | null;
}

interface ActivityRow {
  id: string;
  event_type: "login" | "page_view";
  path: string | null;
  created_at: string;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("engineer");
  const [newOrg, setNewOrg] = useState<string>("");
  const [auditUser, setAuditUser] = useState<Row | null>(null);
  const [auditRows, setAuditRows] = useState<ActivityRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (!loading && !isSuperAdmin) navigate({ to: "/" });
  }, [loading, isSuperAdmin, navigate]);

  const load = useCallback(async () => {
    setBusy(true);
    const [{ data: profiles }, { data: rolesData }, { data: demos }, { data: orgsData }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,organization_id"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_demo_settings").select("*"),
      supabase.from("organizations").select("id,name"),
    ]);
    const orgMap = new Map((orgsData ?? []).map((o) => [o.id, o.name]));
    setOrgs(orgsData ?? []);
    const rolesByUser = new Map<string, AppRole[]>();
    (rolesData ?? []).forEach((r: { user_id: string; role: AppRole }) => {
      rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role]);
    });
    const demoByUser = new Map((demos ?? []).map((d) => [d.user_id, d]));
    const out: Row[] = (profiles ?? []).map((p) => {
      const d = demoByUser.get(p.id);
      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        organization_id: p.organization_id,
        org_name: p.organization_id ? orgMap.get(p.organization_id) ?? null : null,
        roles: rolesByUser.get(p.id) ?? [],
        demo_mode: d?.demo_mode ?? false,
        first_login_at: d?.first_login_at ?? null,
        extension_requested_at: d?.extension_requested_at ?? null,
      };
    });
    setRows(out);
    setBusy(false);
  }, []);

  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);

  const toggleRole = async (uid: string, role: AppRole, has: boolean) => {
    if (has) {
      await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", role);
    } else {
      await supabase.from("user_roles").insert({ user_id: uid, role });
    }
    load();
  };

  const setOrg = async (uid: string, orgId: string) => {
    const { error } = await supabase.from("profiles").update({ organization_id: orgId || null }).eq("id", uid);
    if (error) toast.error(error.message);
    load();
  };

  const upsertDemo = async (uid: string, patch: Partial<{ demo_mode: boolean; first_login_at: string | null; extension_requested_at: string | null }>) => {
    const { data: existing } = await supabase.from("user_demo_settings").select("user_id").eq("user_id", uid).maybeSingle();
    if (existing) {
      await supabase.from("user_demo_settings").update(patch).eq("user_id", uid);
    } else {
      await supabase.from("user_demo_settings").insert({ user_id: uid, demo_mode: patch.demo_mode ?? false, ...patch });
    }
    load();
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrg) return toast.error("Select an organization for the invite.");
    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: {
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        organization_id: newOrg,
        redirectTo: `${window.location.origin}/accept-invite`,
      },
    });
    if (error || (data && (data as { error?: string }).error)) {
      const msg = (data as { error?: string } | null)?.error || error?.message || "Failed to send invite";
      return toast.error(msg);
    }
    toast.success("Invite email sent.");
    setNewEmail("");
    setShowAdd(false);
    load();
  };

  const resendInvite = async (r: Row) => {
    if (!r.organization_id) return toast.error("Assign an organization first.");
    const role = (r.roles[0] as AppRole) || "engineer";
    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: {
        email: r.email.trim().toLowerCase(),
        role,
        organization_id: r.organization_id,
        redirectTo: `${window.location.origin}/accept-invite`,
      },
    });
    if (error || (data && (data as { error?: string }).error)) {
      const msg = (data as { error?: string } | null)?.error || error?.message || "Failed to resend";
      return toast.error(msg);
    }
    const mode = (data as { mode?: string } | null)?.mode;
    toast.success(mode === "recovery" ? "Password setup email resent." : "Invite email resent.");
  };

  if (loading || !isSuperAdmin) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background p-6 sm:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">User management</h1>
            <p className="text-sm text-muted-foreground">Super admin · manage all users, roles, organizations, and demo access.</p>
          </div>
          <button onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded-md text-sm font-medium">
            <UserPlus className="w-4 h-4" /> Add user
          </button>
        </div>

        {showAdd && (
          <form onSubmit={addUser} className="flex flex-wrap gap-2 items-end border border-border rounded-md p-4 bg-secondary/30">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-muted-foreground">Email</label>
              <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Organization</label>
              <select value={newOrg} onChange={(e) => setNewOrg(e.target.value)}
                className="bg-secondary border border-border rounded-md px-3 py-2 text-sm">
                <option value="">— select —</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Role</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as AppRole)}
                className="bg-secondary border border-border rounded-md px-3 py-2 text-sm">
                {INVITABLE.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium">Create invite</button>
          </form>
        )}

        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Organization</th>
                <th className="p-3">Roles</th>
                <th className="p-3">Demo</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const expired = r.demo_mode && r.first_login_at && Date.now() - new Date(r.first_login_at).getTime() > 48 * 3600 * 1000;
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="p-3">
                      <div className="font-medium">{r.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </td>
                    <td className="p-3">
                      <select value={r.organization_id ?? ""} onChange={(e) => setOrg(r.id, e.target.value)}
                        className="bg-secondary border border-border rounded px-2 py-1 text-xs">
                        <option value="">— none —</option>
                        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {ALL_ROLES.map((role) => {
                          const has = r.roles.includes(role);
                          return (
                            <button key={role} onClick={() => toggleRole(r.id, role, has)}
                              className={`px-2 py-0.5 text-xs rounded border ${has ? "bg-white text-black border-white" : "border-border text-muted-foreground hover:text-foreground"}`}>
                              {role}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="p-3">
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={r.demo_mode}
                          onChange={(e) => upsertDemo(r.id, { demo_mode: e.target.checked })} />
                        demo mode
                      </label>
                      {r.demo_mode && (
                        <button onClick={() => upsertDemo(r.id, { first_login_at: null, extension_requested_at: null })}
                          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline">
                          reset 48h timer
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {r.demo_mode ? (
                        r.first_login_at
                          ? expired
                            ? <span className="text-red-400">expired</span>
                            : <span className="text-emerald-400">active · started {new Date(r.first_login_at).toLocaleString()}</span>
                          : <span className="text-muted-foreground">not started</span>
                      ) : <span className="text-muted-foreground">full access</span>}
                      {r.extension_requested_at && (
                        <div className="mt-1 text-amber-400">⚠ extension requested {new Date(r.extension_requested_at).toLocaleDateString()}</div>
                      )}
                      <button
                        onClick={() => resendInvite(r)}
                        className="mt-2 block text-xs text-muted-foreground hover:text-foreground underline"
                        title="Resend invite / password setup email"
                      >
                        Resend invite
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !busy && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
