import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-semibold mb-2">Reset password</h2>
        <p className="text-sm text-muted-foreground mb-6">We'll email you a reset link.</p>
        {sent ? (
          <p className="text-sm text-foreground">Check your inbox for a reset link.</p>
        ) : (
          <form onSubmit={handle} className="space-y-4">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm" />
            <button disabled={submitting} className="w-full bg-white text-black font-medium py-2.5 rounded-md text-sm disabled:opacity-50">
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground mt-6 inline-block">← Back to sign in</Link>
      </div>
    </div>
  );
}
