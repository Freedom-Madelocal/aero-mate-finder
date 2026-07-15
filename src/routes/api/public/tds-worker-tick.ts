import { createFileRoute } from "@tanstack/react-router";

/**
 * Worker tick — called by pg_cron every minute. Claims up to N items from
 * the queue, runs extraction, updates each item.
 *
 * Auth: private bearer `TDS_WORKER_SECRET`. During Phase B rollout we also
 * accept the Supabase anon `apikey` header as a fallback so the existing
 * cron schedule keeps working until it is rotated; remove after cron is
 * updated to the new secret.
 */

const WORKER_CONCURRENCY = 3;
const LEASE_SECONDS = 180;

async function processOne(itemId: string, specId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const {
    runExtractionForSpec,
    MODEL,
    PROMPT_VERSION,
    TdsExtractError,
    maxAttemptsFor,
    backoffSecondsFor,
  } = await import("@/lib/tdsExtract.server");

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
        error_class: null,
      })
      .eq("id", itemId);
    return { ok: true };
  } catch (err) {
    const isClassified = err instanceof TdsExtractError;
    const errClass = isClassified ? err.errorClass : "transient";
    const retryAfter = isClassified ? err.retryAfterSec : undefined;
    const msg = err instanceof Error ? err.message : String(err);

    const { data: item } = await supabaseAdmin
      .from("tds_analysis_items")
      .select("attempts, max_attempts")
      .eq("id", itemId)
      .maybeSingle();

    // Right-size max_attempts based on classified error, but never exceed
    // what the plan/DB allows for this class.
    const desiredMax = maxAttemptsFor(errClass);
    const effectiveMax = Math.min(item?.max_attempts ?? desiredMax, desiredMax);
    const attempts = item?.attempts ?? effectiveMax;

    if (attempts < effectiveMax) {
      const deferSec = backoffSecondsFor(errClass, attempts, retryAfter);
      await supabaseAdmin
        .from("tds_analysis_items")
        .update({
          status: "pending",
          next_run_at: new Date(Date.now() + deferSec * 1000).toISOString(),
          lease_until: null,
          error: msg,
          error_class: errClass,
          max_attempts: effectiveMax,
        })
        .eq("id", itemId);
    } else {
      await supabaseAdmin
        .from("tds_analysis_items")
        .update({
          status: "failed",
          error: msg,
          error_class: errClass,
          max_attempts: effectiveMax,
        })
        .eq("id", itemId);
    }
    return { ok: false, error: msg, errClass };
  }
}

function isAuthorized(request: Request): boolean {
  const workerSecret = process.env.TDS_WORKER_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (workerSecret && auth === `Bearer ${workerSecret}`) return true;

  // Backwards-compat grace: accept anon key via `apikey` header until cron
  // is rotated to the new secret. Remove after Phase B rollout.
  const apiKey = request.headers.get("apikey");
  const expectedAnon =
    process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (expectedAnon && apiKey && apiKey === expectedAnon) return true;

  return false;
}

export const Route = createFileRoute("/api/public/tds-worker-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Reconcile batch state at start of tick (marks paused/complete
        // where appropriate). Never fatal.
        try {
          await supabaseAdmin.rpc("finalize_stuck_batches");
        } catch (err) {
          console.warn("[tds-worker-tick] finalize_stuck_batches failed", err);
        }

        // Cap / pause check
        const { data: allowedRows } = await supabaseAdmin.rpc("ai_worker_allowed");
        const allowed = Array.isArray(allowedRows) ? allowedRows[0] : allowedRows;
        if (!allowed?.allowed) {
          return Response.json({
            processed: 0,
            paused: true,
            reason: allowed?.reason ?? "paused",
          });
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
        if (items.length === 0) {
          // Also reconcile at end so completed batches flip status.
          try {
            await supabaseAdmin.rpc("finalize_stuck_batches");
          } catch { /* noop */ }
          return Response.json({ processed: 0 });
        }

        const results = await Promise.all(items.map((it) => processOne(it.id, it.spec_id)));
        const ok = results.filter((r) => r.ok).length;

        // Reconcile again after processing so batch status catches up.
        try {
          await supabaseAdmin.rpc("finalize_stuck_batches");
        } catch { /* noop */ }

        return Response.json({ processed: items.length, ok, failed: items.length - ok });
      },
    },
  },
});
