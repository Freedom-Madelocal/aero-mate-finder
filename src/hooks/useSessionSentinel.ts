import { useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Detects stale sessions on tab focus / user interaction and forces a
 * clean sign-out via the supplied callback when the session can no longer
 * be refreshed. Grace window: refresh proactively when <30s from expiry.
 */
export function useSessionSentinel(session: Session | null, onStale: () => void) {
  const staleRef = useRef(false);
  const onStaleRef = useRef(onStale);
  useEffect(() => {
    onStaleRef.current = onStale;
  }, [onStale]);

  useEffect(() => {
    if (!session) {
      staleRef.current = false;
      return;
    }

    let cancelled = false;

    async function check() {
      if (cancelled || staleRef.current) return;
      const expiresAt = (session?.expires_at ?? 0) * 1000;
      if (!expiresAt) return;
      const now = Date.now();
      const msUntilExpiry = expiresAt - now;

      if (msUntilExpiry <= 0) {
        // Already expired — try one refresh, otherwise force logout.
        const { data, error } = await supabase.auth.refreshSession();
        if (cancelled) return;
        if (error || !data.session) {
          staleRef.current = true;
          onStaleRef.current();
        }
        return;
      }

      if (msUntilExpiry < 30_000) {
        const { error } = await supabase.auth.refreshSession();
        if (cancelled) return;
        if (error) {
          staleRef.current = true;
          onStaleRef.current();
        }
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onInteract = () => void check();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onInteract);
    document.addEventListener("click", onInteract, { capture: true });
    document.addEventListener("keydown", onInteract, { capture: true });

    // Initial check on mount (session might already be past expiry).
    void check();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onInteract);
      document.removeEventListener("click", onInteract, { capture: true });
      document.removeEventListener("keydown", onInteract, { capture: true });
    };
  }, [session]);
}
