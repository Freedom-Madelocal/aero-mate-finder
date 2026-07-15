import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: super_admin only.");
}

export const getAiUsageDashboard = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(
  async ({ context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const [usageRes, settingsRes, batchesRes, itemsRes, recentFailRes] = await Promise.all([
      supabaseAdmin.from("ai_usage_daily").select("*").gte("day", since).order("day", { ascending: true }),
      supabaseAdmin.from("ai_settings").select("*").eq("id", 1).maybeSingle(),
      supabaseAdmin
        .from("tds_analysis_batches")
        .select("id, label, status, total, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("tds_analysis_items")
        .select("status, latency_ms")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("tds_analysis_items")
        .select("id, spec_id, error, updated_at")
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    const items = itemsRes.data ?? [];
    const done = items.filter((i) => i.status === "done" || i.status === "skipped_cache").length;
    const failed = items.filter((i) => i.status === "failed").length;
    const latencies = items.map((i) => i.latency_ms).filter((n): n is number => typeof n === "number");
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const cacheHits = items.filter((i) => i.status === "skipped_cache").length;
    const failureRate = items.length ? failed / items.length : 0;

    return {
      usage: usageRes.data ?? [],
      settings: settingsRes.data,
      recentBatches: batchesRes.data ?? [],
      recentFailures: recentFailRes.data ?? [],
      liveStats: {
        done,
        failed,
        avgLatencyMs: avgLatency,
        cacheHitRate: items.length ? cacheHits / items.length : 0,
        failureRate,
        sampleSize: items.length,
      },
    };
  },
);

const SettingsSchema = z.object({
  daily_call_cap: z.number().int().min(0).max(100000).optional(),
  daily_cost_cap_usd: z.number().min(0).max(10000).optional(),
  enabled: z.boolean().optional(),
});

export const updateAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ai_settings").update(data).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
