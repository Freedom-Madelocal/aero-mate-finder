import { useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, landingForRoles, type AppRole } from "@/hooks/useAuth";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Min 6 characters").max(128),
});

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, roles, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate({ to: landingForRoles(roles) });
    }
  }, [authLoading, isAuthenticated, roles, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
      if (error) throw error;
      const uid = data.user!.id;

      // load roles + demo
      const [{ data: rolesData }, { data: demoData }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("user_demo_settings").select("*").eq("user_id", uid).maybeSingle(),
      ]);
      const userRoles = (rolesData ?? []).map((r: { role: AppRole }) => r.role);
      const isSuper = userRoles.includes("super_admin");

      // Demo enforcement
      if (demoData?.demo_mode && !isSuper) {
        if (!demoData.first_login_at) {
          await supabase.rpc("stamp_first_login", { _user_id: uid });
        } else if (Date.now() - new Date(demoData.first_login_at).getTime() > 48 * 60 * 60 * 1000) {
          await supabase.auth.signOut();
          navigate({ to: "/demo-expired" });
          return;
        }
      }

      toast.success("Signed in");
      navigate({ to: landingForRoles(userRoles) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-3/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-background" />
        <div className="absolute inset-0 login-hero-gradient" />
        <div className="relative z-10 flex flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-white flex items-center justify-center">
              <span className="text-black font-bold text-lg tracking-tight">T</span>
            </div>
            <span className="text-white font-semibold text-xl tracking-tight">Traceium</span>
          </Link>
          <div className="max-w-lg">
            <h1 className="text-4xl font-semibold text-white leading-tight tracking-tight">Composites-native inventory intelligence</h1>
            <p className="text-lg text-white/60 mt-4 leading-relaxed">Material lifecycle tracking, automated TSM compliance, and real-time commitment verification for aerospace composite distributors.</p>
          </div>
          <p className="text-xs text-white/30">&copy; {new Date().getFullYear()} Traceium Inc.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center login-right-gradient p-4 sm:p-8">
        <div className="w-full max-w-sm login-panel p-8 sm:p-10">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded bg-black/40 border border-white/10 flex items-center justify-center">
              <span className="text-white font-bold text-base tracking-tight">T</span>
            </div>
            <span className="text-foreground font-semibold text-lg tracking-tight">Traceium</span>
          </Link>

          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-semibold text-foreground tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">Access your material operations dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operator@company.com" autoComplete="email"
                className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm text-foreground">Password</label>
                <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Forgot password?</Link>
              </div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password"
                className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <button type="submit" disabled={submitting}
              className="w-full bg-gradient-to-r from-black/80 to-black/40 border border-white/10 text-white font-medium py-2.5 rounded-md text-sm hover:from-black/70 hover:to-black/30 transition-all mt-2 disabled:opacity-50">
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">Protected system. Authorized personnel only.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
