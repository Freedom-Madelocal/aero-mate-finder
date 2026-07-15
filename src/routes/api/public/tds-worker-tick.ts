import { createFileRoute } from "@tanstack/react-router";

/**
 * Worker tick — called by pg_cron every minute. Claims up to N items from
 * the queue, runs extraction, updates each item. Auth: Supabase anon
 * `apikey` header (matches the pattern used elsewhere for cron).
 */

const WORKER_CONCURRENCY = 3;
const LEASE_SECONDS = 180;
const MAX_ATTEMPTS = 3;

async function processOne(itemId: string, specId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runExtractionForSpec, MODEL, PROMPT_VERSION } = await import("@/lib/tdsExtract.server");

  try {
    const res = await runExtractionForSpec(specId);
    await supabaseAdmin
      .from("tds_analysis_items")
      .update({
        status: res.cacheHit ? "skipped_cache" : "done",
        document_hash: res.documentHash,
        latency_ms: res.latencyMs,
        updated_fields: res.updatedCount,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        input_tokens: res.usage.inputTokens,
        output_tokens: res.usage.outputTokens,
        cost_usd: res.usage.costUsd,
        error: null,
      })
      .eq("id", itemId);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { data: item } = await supabaseAdmin
      .from("tds_analysis_items")
      .select("attempts")
      .eq("id", itemId)
      .maybeSingle();
    const attempts = item?.attempts ?? MAX_ATTEMPTS;
    if (attempts < MAX_ATTEMPTS) {
      const jitterSec = 15 + Math.floor(Math.random() * 45);
      await supabaseAdmin
        .from("tds_analysis_items")
        .update({
          status: "pending",
          lease_until: new Date(Date.now() + jitterSec * 1000).toISOString(),
          error: msg,
        })
        .eq("id", itemId);
    } else {
      await supabaseAdmin
        .from("tds_analysis_items")
        .update({ status: "failed", error: msg })
        .eq("id", itemId);
    }
    return { ok: false, error: msg };
  }
}

export const Route = createFileRoute("/api/public/tds-worker-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Cap / pause check
        const { data: allowedRows } = await supabaseAdmin.rpc("ai_worker_allowed");
        const allowed = Array.isArray(allowedRows) ? allowedRows[0] : allowedRows;
        if (!allowed?.allowed) {
          return Response.json({ processed: 0, paused: true, reason: allowed?.reason ?? "paused" });
        }

        const { data: claimed, error } = await supabaseAdmin.rpc("claim_tds_items", {
          _limit: WORKER_CONCURRENCY,
          _lease_seconds: LEASE_SECONDS,
        });
        if (error) {
          console.error("[tds-worker-tick] claim error", error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const items = (claimed ?? []) as Array<{ id: string; spec_id: string }>;
        if (items.length === 0) return Response.json({ processed: 0 });

        const results = await Promise.all(items.map((it) => processOne(it.id, it.spec_id)));
        const ok = results.filter((r) => r.ok).length;
        return Response.json({ processed: items.length, ok, failed: items.length - ok });
      },
    },
  },
});
