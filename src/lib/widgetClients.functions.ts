import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r: { role: string }) => r.role === "super_admin")) {
    throw new Response("Forbidden", { status: 403 });
  }
}

function randomApiKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `tcx_${b64}`;
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const listWidgetClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("widget_clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createWidgetClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(1).max(200),
        brand_name: z.string().min(1).max(200),
        logo_url: z.string().url().max(2000).nullable().optional(),
        accent_color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#3B82F6"),
        subscription_status: z
          .enum(["trial", "active", "past_due", "cancelled"])
          .default("trial"),
        monthly_price_usd: z.number().nonnegative().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const apiKey = randomApiKey();
    const hash = await sha256Hex(apiKey);
    const prefix = apiKey.slice(0, 12);

    const { data: row, error } = await supabaseAdmin
      .from("widget_clients")
      .insert({
        name: data.name,
        brand_name: data.brand_name,
        logo_url: data.logo_url ?? null,
        accent_color: data.accent_color,
        api_key_prefix: prefix,
        api_key_hash: hash,
        subscription_status: data.subscription_status,
        monthly_price_usd: data.monthly_price_usd ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    // Return the plaintext key ONCE for the admin to copy.
    return { client: row, api_key: apiKey };
  });

export const updateWidgetClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        brand_name: z.string().min(1).max(200).optional(),
        logo_url: z.string().url().max(2000).nullable().optional(),
        accent_color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        active: z.boolean().optional(),
        subscription_status: z
          .enum(["trial", "active", "past_due", "cancelled"])
          .optional(),
        monthly_price_usd: z.number().nonnegative().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("widget_clients")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWidgetClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("widget_clients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateWidgetApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const apiKey = randomApiKey();
    const hash = await sha256Hex(apiKey);
    const prefix = apiKey.slice(0, 12);
    const { error } = await supabaseAdmin
      .from("widget_clients")
      .update({ api_key_hash: hash, api_key_prefix: prefix })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { api_key: apiKey };
  });
