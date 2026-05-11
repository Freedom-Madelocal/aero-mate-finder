import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { landingForRoles, type AppRole } from "@/hooks/useAuth";

interface Invite {
  id: string;
  email: string;
  organization_id: string;
  role: AppRole;
  expires_at: string;
  accepted_at: string | null;
}

export default function Invite() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [pwd, setPwd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("org_invitations")
        .select("*")
        .eq("token", token)
        .maybeSingle();
      if (error || !data) {
        toast.error("Invalid invitation");
      } else if (data.accepted_at) {
        toast.error("Invitation already used");
      } else if (new Date(data.expires_at) < new Date()) {
        toast.error("Invitation expired");
      } else {
        setInvite(data as Invite);
      }
      setLoading(false);
    })();
  }, [token]);

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    if (pwd.length < 6) return toast.error("Password too short");
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: invite.email,
        password: pwd,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: name,
            organization_id: invite.organization_id,
            role: invite.role,
          },
        },
      });
      if (error) throw error;
      await supabase.from("org_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
      toast.success("Account created");
      if (data.session) navigate({ to: landingForRoles([invite.role]) });
      else navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  if (!invite) return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Invitation not available.</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-8">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-semibold mb-2">Accept invitation</h2>
        <p className="text-sm text-muted-foreground mb-6">Joining as <span className="text-foreground">{invite.role}</span> · {invite.email}</p>
        <form onSubmit={accept} className="space-y-4">
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Full name"
            className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm" />
          <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required placeholder="Choose a password"
            className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm" />
          <button disabled={submitting} className="w-full bg-white text-black font-medium py-2.5 rounded-md text-sm disabled:opacity-50">
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
