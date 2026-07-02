/*
 * Traceum — Feature Flags
 *
 * Project-wide toggles for gated features and UI themes. Backed by the
 * Supabase `feature_flags` table. Everyone can read; only super admins
 * can toggle values (enforced by RLS).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FeatureFlag {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  updatedAt: string;
}

interface Row {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  updated_at: string;
}

interface FlagStore {
  flags: FeatureFlag[];
  loaded: boolean;
}

let _store: FlagStore = { flags: [], loaded: false };
const _listeners = new Set<() => void>();
let _hydrated = false;
let _hydrating: Promise<void> | null = null;
let _realtimeSubscribed = false;

function notify() {
  _listeners.forEach((fn) => fn());
}

function rowToFlag(r: Row): FeatureFlag {
  return {
    key: r.key,
    label: r.label,
    description: r.description,
    enabled: r.enabled,
    updatedAt: r.updated_at,
  };
}

async function hydrate(): Promise<void> {
  if (_hydrated) return;
  if (_hydrating) return _hydrating;
  _hydrating = (async () => {
    try {
      const { data, error } = await supabase
        .from("feature_flags" as never)
        .select("*")
        .order("label");
      if (!error && Array.isArray(data)) {
        _store = { flags: (data as unknown as Row[]).map(rowToFlag), loaded: true };
      } else {
        _store = { ..._store, loaded: true };
      }
      _hydrated = true;
      notify();
      subscribeRealtime();
    } finally {
      _hydrating = null;
    }
  })();
  return _hydrating;
}

function subscribeRealtime() {
  if (_realtimeSubscribed) return;
  _realtimeSubscribed = true;
  try {
    supabase
      .channel("feature_flags_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feature_flags" },
        () => {
          _hydrated = false;
          void hydrate();
        },
      )
      .subscribe();
  } catch {
    _realtimeSubscribed = false;
  }
}

export function useFeatureFlags(): FlagStore {
  const [snap, setSnap] = useState<FlagStore>(() => _store);
  useEffect(() => {
    const l = () => setSnap({ ..._store });
    _listeners.add(l);
    setSnap({ ..._store });
    void hydrate();
    return () => {
      _listeners.delete(l);
    };
  }, []);
  return snap;
}

/**
 * Read a single feature flag by key. Defaults to `defaultValue` (true) while
 * the store is loading, so gated features don't flash-hide on first paint —
 * except flags that default off (e.g. experimental themes) should pass `false`.
 */
export function useFeatureFlag(key: string, defaultValue = true): boolean {
  const { flags, loaded } = useFeatureFlags();
  if (!loaded) return defaultValue;
  const f = flags.find((x) => x.key === key);
  return f ? f.enabled : defaultValue;
}

export function preloadFeatureFlags(): Promise<void> {
  return hydrate();
}

export async function refreshFeatureFlags(): Promise<void> {
  _hydrated = false;
  await hydrate();
}

export async function setFeatureFlagEnabled(key: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from("feature_flags" as never)
    .update({ enabled } as never)
    .eq("key", key);
  if (error) throw error;
  // Optimistic local update; realtime will follow.
  _store = {
    ..._store,
    flags: _store.flags.map((f) => (f.key === key ? { ...f, enabled } : f)),
  };
  notify();
}
