import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UnreadSender {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  count: number;
}

interface DMRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  read_at: string | null;
}

/**
 * Tracks unread direct messages for the current user, grouped by sender.
 * Updates live via realtime — when a new DM arrives or one is marked read.
 */
export function useUnreadMessages(): UnreadSender[] {
  const { user } = useAuth();
  const [senders, setSenders] = useState<UnreadSender[]>([]);

  const reload = useCallback(async () => {
    if (!user) {
      setSenders([]);
      return;
    }
    const { data: msgs } = await supabase
      .from("direct_messages")
      .select("sender_id")
      .eq("recipient_id", user.id)
      .is("read_at", null);

    const counts = new Map<string, number>();
    for (const row of (msgs as { sender_id: string }[] | null) ?? []) {
      counts.set(row.sender_id, (counts.get(row.sender_id) ?? 0) + 1);
    }
    if (counts.size === 0) {
      setSenders([]);
      return;
    }
    const ids = Array.from(counts.keys());
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", ids);
    const profMap = new Map(
      ((profs as { id: string; full_name: string | null; email: string; avatar_url: string | null }[]) ?? []).map((p) => [p.id, p]),
    );
    setSenders(
      ids.map((id) => {
        const p = profMap.get(id);
        return {
          user_id: id,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
          avatar_url: p?.avatar_url ?? null,
          count: counts.get(id) ?? 0,
        };
      }),
    );
  }, [user]);

  useEffect(() => {
    reload();
    if (!user) return;
    const channel = supabase
      .channel(`unread-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, reload]);

  return senders;
}
