/**
 * Server-only helpers for verifying widget API keys and tracking usage.
 * Only import from server route handlers or server-only modules.
 */

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function extractApiKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const header = request.headers.get("x-api-key");
  if (header) return header.trim();
  const url = new URL(request.url);
  const q = url.searchParams.get("api_key");
  return q?.trim() || null;
}

export async function verifyWidgetKey(request: Request) {
  const key = extractApiKey(request);
  if (!key) return { error: new Response("Missing API key", { status: 401 }) } as const;

  const hash = await sha256Hex(key);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: client, error } = await supabaseAdmin
    .from("widget_clients")
    .select("*")
    .eq("api_key_hash", hash)
    .maybeSingle();
  if (error) return { error: new Response("Server error", { status: 500 }) } as const;
  if (!client) return { error: new Response("Invalid API key", { status: 401 }) } as const;
  if (!client.active)
    return { error: new Response("Client inactive", { status: 403 }) } as const;
  if (client.subscription_status === "cancelled")
    return { error: new Response("Subscription cancelled", { status: 403 }) } as const;

  // Fire-and-forget usage tracking
  const month = new Date();
  month.setUTCDate(1);
  const monthStr = month.toISOString().slice(0, 10);
  void supabaseAdmin
    .from("widget_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", client.id);
  void supabaseAdmin
    .from("widget_usage_monthly")
    .upsert(
      { client_id: client.id, month: monthStr, request_count: 1 },
      { onConflict: "client_id,month", ignoreDuplicates: false },
    )
    .then(() => {}, () => {});


  return { client } as const;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, X-Api-Key, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
