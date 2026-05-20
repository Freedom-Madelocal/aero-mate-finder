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

// ─── Singleton presence channel ─────────────────────────────────────
// We keep ONE Realtime presence channel open per (user, org) for the
// lifetime of the session, regardless of how many components mount
// `useOrgPresence`. Previously each <DashboardLayout> instance opened
// its own channel; since every page wraps itself in DashboardLayout,
// the channel was torn down + reopened on every navigation.

type ChannelHandle = ReturnType<typeof supabase.channel>;

interface PresenceState {
  userId: string | null;
  orgId: string | null;
  channel: ChannelHandle | null;
  members: OnlineMember[];
  refCount: number;
}

const state: PresenceState = {
  userId: null,
  orgId: null,
  channel: null,
  members: [],
  refCount: 0,
};
const listeners = new Set<(m: OnlineMember[]) => void>();

function setMembers(next: OnlineMember[]) {
  state.members = next;
  listeners.forEach((fn) => fn(next));
}

function teardown() {
  if (state.channel) {
    supabase.removeChannel(state.channel);
    state.channel = null;
  }
  state.userId = null;
  state.orgId = null;
  setMembers([]);
}

function ensureChannel(
  userId: string,
  orgId: string,
  meta: { full_name: string | null; email: string | null; avatar_url: string | null },
) {
  if (state.channel && state.userId === userId && state.orgId === orgId) return;
  if (state.channel) teardown();

  state.userId = userId;
  state.orgId = orgId;

  const channel = supabase.channel(`org-presence-${orgId}`, {
    config: { presence: { key: userId } },
  });
  state.channel = channel;

  const sync = () => {
    const presence = channel.presenceState<OnlineMember>();
    const flat: OnlineMember[] = [];
    const seen = new Set<string>();
    for (const key of Object.keys(presence)) {
      const entries = presence[key];
      if (!entries || entries.length === 0) continue;
      const m = entries[0];
      if (m.user_id === userId) continue;
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
          user_id: userId,
          full_name: meta.full_name,
          email: meta.email,
          avatar_url: meta.avatar_url,
          online_at: new Date().toISOString(),
        });
      }
    });
}

export function useOrgPresence(): OnlineMember[] {
  const { user, profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const [snap, setSnap] = useState<OnlineMember[]>(state.members);

  useEffect(() => {
    const l = (m: OnlineMember[]) => setSnap(m);
    listeners.add(l);
    state.refCount += 1;

    if (user && orgId) {
      ensureChannel(user.id, orgId, {
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? user.email ?? null,
        avatar_url: profile?.avatar_url ?? null,
      });
      setSnap(state.members);
    } else if (!user && state.channel) {
      teardown();
    }

    return () => {
      listeners.delete(l);
      state.refCount -= 1;
      // We intentionally do NOT tear down on unmount — the channel is
      // kept alive across navigations. It only tears down on sign-out
      // (handled in the !user branch above).
    };
  }, [user, orgId, profile?.full_name, profile?.email, profile?.avatar_url]);

  return snap;
}
