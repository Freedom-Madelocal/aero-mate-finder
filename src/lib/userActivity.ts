import { supabase } from "@/integrations/supabase/client";

export async function logLogin(userId: string) {
  try {
    await supabase.from("user_activity").insert({
      user_id: userId,
      event_type: "login",
      path: typeof window !== "undefined" ? window.location.pathname : null,
    });
  } catch {
    // best-effort; do not block sign-in
  }
}

// Dedupe rapid duplicate page-view writes. The same path within this
// window is treated as one view. Prevents extra inserts caused by
// auth-context re-renders or React StrictMode double-effects.
const PAGE_VIEW_DEDUPE_MS = 30_000;
let _lastUser: string | null = null;
let _lastPath: string | null = null;
let _lastAt = 0;

export function logPageView(userId: string, path: string) {
  const now = Date.now();
  if (_lastUser === userId && _lastPath === path && now - _lastAt < PAGE_VIEW_DEDUPE_MS) {
    return;
  }
  _lastUser = userId;
  _lastPath = path;
  _lastAt = now;
  // Fire and forget — never block navigation on an analytics write.
  void supabase
    .from("user_activity")
    .insert({ user_id: userId, event_type: "page_view", path })
    .then(() => undefined, () => undefined);
}
