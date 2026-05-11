import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface OnlineMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  online_at: string;
}

/**
 * Tracks which users in the current user's organization are online,
 * via a Supabase Realtime presence channel keyed on the org.
 * Returns the list of OTHER online members (excludes self).
 */
export function useOrgPresence(): OnlineMember[] {
  const { user, profile } = useAuth();
  const [members, setMembers] = useState<OnlineMember[]>([]);
  const orgId = profile?.organization_id ?? null;

  useEffect(() => {
    if (!user || !orgId) {
      setMembers([]);
      return;
    }

    const channel = supabase.channel(`org-presence-${orgId}`, {
      config: { presence: { key: user.id } },
    });

    const sync = () => {
      const state = channel.presenceState<OnlineMember>();
      const flat: OnlineMember[] = [];
      const seen = new Set<string>();
      for (const key of Object.keys(state)) {
        const entries = state[key];
        if (!entries || entries.length === 0) continue;
        const m = entries[0];
        if (m.user_id === user.id) continue;
        if (seen.has(m.user_id)) continue;
        seen.add(m.user_id);
        flat.push(m);
      }
      setMembers(flat);
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            full_name: profile?.full_name ?? null,
            email: profile?.email ?? user.email ?? null,
            avatar_url: profile?.avatar_url ?? null,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, orgId, profile?.full_name, profile?.email, profile?.avatar_url]);

  return members;
}
