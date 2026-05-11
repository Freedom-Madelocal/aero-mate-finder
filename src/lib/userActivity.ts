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

export async function logPageView(userId: string, path: string) {
  try {
    await supabase.from("user_activity").insert({
      user_id: userId,
      event_type: "page_view",
      path,
    });
  } catch {
    // best-effort
  }
}
