import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ConsoleLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string[]>([
    "traceium :: secure shell — privileged access",
    "authenticate to continue.",
    "",
  ]);

  const log = (line: string) => setOutput((o) => [...o, line]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    log(`> auth ${email}`);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const uid = data.user!.id;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const isSuper = (roles ?? []).some((r: { role: string }) => r.role === "super_admin");
      if (!isSuper) {
        await supabase.auth.signOut();
        log("ERR: access denied — non-privileged account");
        toast.error("Access denied");
        setBusy(false);
        return;
      }
      log("OK: super_admin verified");
      log("redirecting…");
      setTimeout(() => navigate({ to: "/dashboard" }), 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "auth failed";
      log(`ERR: ${msg}`);
      toast.error(msg);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-emerald-300 font-mono flex items-start justify-center p-6 sm:p-12">
      <div className="w-full max-w-2xl mt-8 sm:mt-20">
        <div className="text-emerald-500/60 text-xs mb-4">// privileged login · traceium employees only</div>
        <div className="text-sm space-y-1 mb-6">
          {output.map((l, i) => <div key={i}>{l || "\u00A0"}</div>)}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">$</span>
            <span className="text-emerald-500/70 text-sm w-20">email:</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoFocus
              className="flex-1 bg-transparent border-b border-emerald-800/60 focus:border-emerald-400 text-emerald-100 outline-none text-sm py-1" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">$</span>
            <span className="text-emerald-500/70 text-sm w-20">password:</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
              className="flex-1 bg-transparent border-b border-emerald-800/60 focus:border-emerald-400 text-emerald-100 outline-none text-sm py-1" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={busy}
              className="border border-emerald-400 px-4 py-1.5 text-emerald-200 hover:bg-emerald-400/10 text-sm disabled:opacity-50">
              {busy ? "[ authenticating… ]" : "[ enter ]"}
            </button>
            <button type="button" onClick={() => navigate({ to: "/console" })} className="text-emerald-500/50 text-xs hover:text-emerald-300">esc</button>
          </div>
        </form>
      </div>
    </div>
  );
}
