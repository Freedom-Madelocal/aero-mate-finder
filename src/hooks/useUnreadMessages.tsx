import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UnreadSender {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  count: number;
}

// ─── Singleton unread DM tracker ────────────────────────────────────
// One Realtime channel + one query pipeline per user, shared across
// every component that calls useUnreadMessages(). Previously each
// <DashboardLayout> re-subscribed on every page navigation.

type ChannelHandle = ReturnType<typeof supabase.channel>;

interface State {
  userId: string | null;
  channel: ChannelHandle | null;
  senders: UnreadSender[];
  inflight: Promise<void> | null;
}

const state: State = { userId: null, channel: null, senders: [], inflight: null };
const listeners = new Set<(s: UnreadSender[]) => void>();

function notify() {
  listeners.forEach((fn) => fn(state.senders));
}

async function reload(userId: string) {
  if (state.inflight) return state.inflight;
  state.inflight = (async () => {
    try {
      const { data: msgs } = await supabase
        .from("direct_messages")
        .select("sender_id")
        .eq("recipient_id", userId)
        .is("read_at", null);

      const counts = new Map<string, number>();
      for (const row of (msgs as { sender_id: string }[] | null) ?? []) {
        counts.set(row.sender_id, (counts.get(row.sender_id) ?? 0) + 1);
      }
      if (counts.size === 0) {
        state.senders = [];
        notify();
        return;
      }
      const ids = Array.from(counts.keys());
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", ids);
      const profMap = new Map(
        ((profs as { id: string; full_name: string | null; email: string; avatar_url: string | null }[]) ?? []).map(
          (p) => [p.id, p],
        ),
      );
      state.senders = ids.map((id) => {
        const p = profMap.get(id);
        return {
          user_id: id,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
          avatar_url: p?.avatar_url ?? null,
          count: counts.get(id) ?? 0,
        };
      });
      notify();
    } finally {
      state.inflight = null;
    }
  })();
  return state.inflight;
}

function teardown() {
  if (state.channel) {
    supabase.removeChannel(state.channel);
    state.channel = null;
  }
  state.userId = null;
  state.senders = [];
  notify();
}

function ensure(userId: string) {
  if (state.channel && state.userId === userId) return;
  if (state.channel) teardown();
  state.userId = userId;
  void reload(userId);
  state.channel = supabase
    .channel(`unread-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${userId}` },
      () => void reload(userId),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${userId}` },
      () => void reload(userId),
    )
    .subscribe();
}

export function useUnreadMessages(): UnreadSender[] {
  const { user } = useAuth();
  const [snap, setSnap] = useState<UnreadSender[]>(state.senders);

  useEffect(() => {
    const l = (s: UnreadSender[]) => setSnap(s);
    listeners.add(l);
    if (user) {
      ensure(user.id);
      setSnap(state.senders);
    } else if (state.channel) {
      teardown();
    }
    return () => {
      listeners.delete(l);
      // Keep the channel alive across navigations; only sign-out tears down.
    };
  }, [user]);

  return snap;
}
