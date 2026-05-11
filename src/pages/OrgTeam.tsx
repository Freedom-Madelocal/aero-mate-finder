import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { toast } from "sonner";

const INVITABLE: AppRole[] = ["org_admin", "engineer", "procurement", "integrator"];

interface Member {
  id: string;
  email: string;
  full_name: string | null;
  roles: AppRole[];
  demo_mode: boolean;
  first_login_at: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: AppRole;
  token: string;
  accepted_at: string | null;
  expires_at: string;
}

export default function OrgTeam() {
  const navigate = useNavigate();
  const { profile, hasRole, isSuperAdmin, loading, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("engineer");

  const orgId = profile?.organization_id;
  const allowed = isSuperAdmin || hasRole("org_admin");

  useEffect(() => { if (!loading && !allowed) navigate({ to: "/" }); }, [loading, allowed, navigate]);

  const load = useCallback(async () => {
    if (!orgId) return;
    const [{ data: profs }, { data: rolesData }, { data: demos }, { data: invs }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name").eq("organization_id", orgId),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_demo_settings").select("*"),
      supabase.from("org_invitations").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
    ]);
    const rolesByUser = new Map<string, AppRole[]>();
    (rolesData ?? []).forEach((r: { user_id: string; role: AppRole }) => {
      rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role]);
    });
    const demoByUser = new Map((demos ?? []).map((d) => [d.user_id, d]));
    setMembers((profs ?? []).map((p) => ({
      id: p.id, email: p.email, full_name: p.full_name,
      roles: rolesByUser.get(p.id) ?? [],
      demo_mode: demoByUser.get(p.id)?.demo_mode ?? false,
      first_login_at: demoByUser.get(p.id)?.first_login_at ?? null,
    })));
    setInvites((invs as Invitation[]) ?? []);
  }, [orgId]);

  useEffect(() => { if (allowed && orgId) load(); }, [allowed, orgId, load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return toast.error("You must belong to an organization to invite users.");
    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: {
        email: email.trim().toLowerCase(),
        role,
        organization_id: orgId,
        redirectTo: `${window.location.origin}/accept-invite`,
      },
    });
    if (error || (data && (data as { error?: string }).error)) {
      const msg = (data as { error?: string } | null)?.error || error?.message || "Failed to send invite";
      return toast.error(msg);
    }
    toast.success("Invite email sent.");
    setEmail("");
    load();
  };

  const revoke = async (id: string) => {
    await supabase.from("org_invitations").delete().eq("id", id);
    load();
  };

  const upsertDemo = async (uid: string, patch: { demo_mode?: boolean; first_login_at?: string | null }) => {
    const { data: ex } = await supabase.from("user_demo_settings").select("user_id").eq("user_id", uid).maybeSingle();
    if (ex) await supabase.from("user_demo_settings").update(patch).eq("user_id", uid);
    else await supabase.from("user_demo_settings").insert({ user_id: uid, demo_mode: patch.demo_mode ?? false, ...patch });
    load();
  };

  if (loading || !allowed) return <div className="min-h-screen bg-background" />;
  if (!orgId) return (
    <div className="min-h-screen bg-background p-10 text-center text-muted-foreground">
      You're not assigned to an organization yet.
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-6 sm:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-sm text-muted-foreground">Invite and manage members of your organization.</p>
        </div>

        <form onSubmit={invite} className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-muted-foreground">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)}
              className="bg-secondary border border-border rounded-md px-3 py-2 text-sm">
              {INVITABLE.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium">Send invite</button>
        </form>

        <div>
          <h2 className="text-sm font-semibold mb-2">Members</h2>
          <div className="border border-border rounded-md divide-y divide-border">
            {members.map((m) => (
              <div key={m.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm">{m.full_name || m.email}</div>
                  <div className="text-xs text-muted-foreground">{m.email} · {m.roles.join(", ") || "no roles"}</div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={m.demo_mode}
                      onChange={(e) => upsertDemo(m.id, { demo_mode: e.target.checked })} />
                    demo mode
                  </label>
                  {m.demo_mode && m.first_login_at && (
                    <button onClick={() => upsertDemo(m.id, { first_login_at: null })}
                      className="text-xs text-muted-foreground hover:text-foreground underline">reset 48h</button>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No members yet.</div>}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-2">Pending invitations</h2>
          <div className="border border-border rounded-md divide-y divide-border">
            {invites.filter((i) => !i.accepted_at).map((i) => (
              <div key={i.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm">{i.email}</div>
                  <div className="text-xs text-muted-foreground">{i.role} · expires {new Date(i.expires_at).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/invite/${i.token}`); toast.success("Link copied"); }}
                    className="text-xs text-muted-foreground hover:text-foreground">Copy link</button>
                  <button onClick={() => revoke(i.id)} className="text-xs text-red-400 hover:text-red-300">Revoke</button>
                </div>
              </div>
            ))}
            {invites.filter((i) => !i.accepted_at).length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No pending invitations.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
