import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, landingForRoles, type AppRole } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function AcceptInvite() {
  const navigate = useNavigate();
  const { session, roles, refresh } = useAuth();
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery/invite tokens from the URL hash automatically.
    // Give it a tick to establish the session.
    const t = setTimeout(() => setChecking(false), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (session?.user && !name) {
      const meta = session.user.user_metadata as { full_name?: string } | undefined;
      if (meta?.full_name) setName(meta.full_name);
    }
  }, [session, name]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) return toast.error("Password must be at least 8 characters");
    if (pwd !== pwd2) return toast.error("Passwords don't match");
    if (!session?.user) return toast.error("Invite session missing");
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: pwd,
        data: { full_name: name },
      });
      if (error) throw error;
      await supabase.rpc("mark_invitation_accepted", { _email: session.user.email ?? "" });
      await refresh();
      toast.success("Welcome — your account is ready.");
      const meta = session.user.user_metadata as { role?: AppRole } | undefined;
      const inferredRoles: AppRole[] = roles.length ? roles : meta?.role ? [meta.role] : [];
      navigate({ to: landingForRoles(inferredRoles) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-sm text-center space-y-2">
          <h2 className="text-xl font-semibold">Invite link invalid</h2>
          <p className="text-sm text-muted-foreground">
            This invitation link is invalid or has expired. Please ask your admin to send a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-8">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-semibold mb-1">Set your password</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Welcome{session.user.email ? `, ${session.user.email}` : ""}. Choose a password to finish setting up your account.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm"
          />
          <input
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            required
            placeholder="New password"
            className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm"
          />
          <input
            type="password"
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            required
            placeholder="Confirm password"
            className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm"
          />
          <button
            disabled={submitting}
            className="w-full bg-white text-black font-medium py-2.5 rounded-md text-sm disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Set password & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
