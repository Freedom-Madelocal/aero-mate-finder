import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Single-material Analyze TDS action.
 *
 * Phase 3A: unified with bulk. Enqueues a one-item batch (status=pending)
 * via the same shared insert path used by `enqueueTdsBatch`. The background
 * worker (tds-worker-tick) picks it up, so authorization, AI admission,
 * cache, dedup, retries, cancellation, provenance, and telemetry are shared.
 *
 * Idempotency: uses `client_request_id = sha256(specId|prompt_version|model)`
 * with a partial unique index on (client_request_id) WHERE status IN
 * ('pending','processing'). Re-clicking Analyze while a job is queued/running
 * returns the existing batch instead of stacking new ones.
 */

const InputSchema = z.object({
  specId: z.string().uuid(),
});

// Shared with the extractor / worker; bumping this bypasses the queue-level
// idempotency window and invalidates the extraction cache.
export const PROMPT_VERSION = "v3-structured";
export const DEFAULT_MODEL = "google/gemini-2.5-pro";

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const analyzeSpecTds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden: super_admin only.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify the spec exists and has a TDS PDF attached before enqueueing.
    const { data: spec, error: sErr } = await supabaseAdmin
      .from("master_specs")
      .select("id, tds_pdf_path")
      .eq("id", data.specId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!spec) throw new Error("Material not found.");
    if (!spec.tds_pdf_path) throw new Error("No TDS PDF attached to this material.");

    const clientRequestId = await sha256Hex(
      `${data.specId}|${PROMPT_VERSION}|${DEFAULT_MODEL}`,
    );

    // Idempotency: if an active item already exists for this key, reuse it.
    const { data: existing, error: eErr } = await supabaseAdmin
      .from("tds_analysis_items")
      .select("id, batch_id, status")
      .eq("client_request_id", clientRequestId)
      .in("status", ["pending", "processing"])
      .maybeSingle();
    if (eErr) throw new Error(eErr.message);
    if (existing) {
      return {
        batchId: existing.batch_id,
        itemId: existing.id,
        status: existing.status,
        deduplicated: true as const,
      };
    }

    const { data: batch, error: bErr } = await supabaseAdmin
      .from("tds_analysis_batches")
      .insert({
        created_by: context.userId,
        label: "Single-item analyze",
        total: 1,
        status: "running",
      })
      .select("id")
      .single();
    if (bErr || !batch) throw new Error(bErr?.message ?? "Failed to create batch.");

    const { data: item, error: iErr } = await supabaseAdmin
      .from("tds_analysis_items")
      .insert({
        batch_id: batch.id,
        spec_id: data.specId,
        status: "pending",
        prompt_version: PROMPT_VERSION,
        model: DEFAULT_MODEL,
        client_request_id: clientRequestId,
      })
      .select("id")
      .single();
    if (iErr || !item) {
      // Retryable race: a parallel enqueue won the unique index.
      const { data: raced } = await supabaseAdmin
        .from("tds_analysis_items")
        .select("id, batch_id, status")
        .eq("client_request_id", clientRequestId)
        .in("status", ["pending", "processing"])
        .maybeSingle();
      if (raced) {
        return {
          batchId: raced.batch_id,
          itemId: raced.id,
          status: raced.status,
          deduplicated: true as const,
        };
      }
      throw new Error(iErr?.message ?? "Failed to enqueue analyze job.");
    }

    return {
      batchId: batch.id,
      itemId: item.id,
      status: "pending" as const,
      deduplicated: false as const,
    };
  });

/**
 * Rich batch health for the single-item and bulk UIs. Wraps the DB
 * `get_batch_health` RPC (aggregate, one query, no per-item scan).
 */
const BatchIdSchema = z.object({ batchId: z.string().uuid() });

export interface BatchHealth {
  batch: {
    id: string;
    status: string;
    paused_reason: string | null;
    paused_at: string | null;
    resumed_at: string | null;
    label: string | null;
    total: number;
    terminal_count: number;
    created_at: string;
    updated_at: string;
  } | null;
  counts: Record<string, number>;
  errors: Record<string, number>;
  attempts: Record<string, number>;
  oldest_pending_seconds: number | null;
  next_retry_at: string | null;
  worker_last_run_at: string | null;
  worker_heartbeat_at: string | null;
  cooldowns: Record<string, string>;
  latency_ms: { p50: number; p95: number };
  cache_hits: number;
  model_calls: number;
  estimated_cost_usd: number;
  throughput_per_sec: number | null;
  eta_seconds: number | null;
  as_of: string;
  error?: string;
}

export const getBatchHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<BatchHealth> => {
    const { data: isAdmin, error: rErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (rErr) throw new Error(rErr.message);
    if (!isAdmin) throw new Error("Forbidden: super_admin only.");

    const { data: health, error } = await context.supabase.rpc("get_batch_health", {
      _batch_id: data.batchId,
    });
    if (error) throw new Error(error.message);
    return health as unknown as BatchHealth;
  });
