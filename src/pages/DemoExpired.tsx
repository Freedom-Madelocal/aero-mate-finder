import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function DemoExpired() {
  const { user, demo, signOut, refresh } = useAuth();
  const [requesting, setRequesting] = useState(false);

  const requestExtension = async () => {
    if (!user) return;
    setRequesting(true);
    const { error } = await supabase
      .from("user_demo_settings")
      .update({ extension_requested_at: new Date().toISOString() })
      .eq("user_id", user.id);
    setRequesting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Extension request sent");
      await refresh();
    }
  };

  const requested = !!demo?.extension_requested_at;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-3">Demo period ended</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your 48-hour demo window has expired. Request an extension and a Traceium admin will reach out.
        </p>
        <div className="flex flex-col gap-3">
          <button onClick={requestExtension} disabled={requesting || requested}
            className="w-full bg-white text-black font-medium py-2.5 rounded-md text-sm disabled:opacity-50">
            {requested ? "Extension requested" : requesting ? "Requesting…" : "Request extension"}
          </button>
          <button onClick={() => signOut()} className="text-xs text-muted-foreground hover:text-foreground">Sign out</button>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">Back to home</Link>
        </div>
      </div>
    </div>
  );
}
