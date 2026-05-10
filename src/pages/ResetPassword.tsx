import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 6) return toast.error("Password must be at least 6 characters");
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated");
      navigate({ to: "/login" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-semibold mb-6">Set a new password</h2>
        <form onSubmit={handle} className="space-y-4">
          <input type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="New password"
            className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm" />
          <button disabled={submitting} className="w-full bg-white text-black font-medium py-2.5 rounded-md text-sm disabled:opacity-50">
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
