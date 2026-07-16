import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Queue management for durable bulk TDS analysis.
 * All endpoints are super_admin-gated.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: super_admin only.");
}

const EnqueueSchema = z.object({
  mode: z.enum(["pending", "all"]),
  specIds: z.array(z.string().uuid()).optional(),
  label: z.string().optional(),
});

export const enqueueTdsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EnqueueSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("master_specs")
      .select("id, tds_pdf_path, tds_analyzed_at")
      .not("tds_pdf_path", "is", null);
    if (data.specIds && data.specIds.length > 0) {
      q = q.in("id", data.specIds);
    }
    if (data.mode === "pending") {
      q = q.is("tds_analyzed_at", null);
    }
    const { data: specs, error } = await q;
    if (error) throw new Error(error.message);
    const specList = specs ?? [];
    if (specList.length === 0) {
      throw new Error("No matching specs with attached TDS PDFs.");
    }

    const { data: batch, error: bErr } = await supabaseAdmin
      .from("tds_analysis_batches")
      .insert({
        created_by: context.userId,
        label: data.label ?? `Bulk analysis (${data.mode})`,
        total: specList.length,
        status: "running",
      })
      .select("id")
      .single();
    if (bErr || !batch) throw new Error(bErr?.message ?? "Failed to create batch.");

    const items = specList.map((s) => ({
      batch_id: batch.id,
      spec_id: s.id,
      status: "pending" as const,
    }));
    const { error: iErr } = await supabaseAdmin.from("tds_analysis_items").insert(items);
    if (iErr) throw new Error(iErr.message);

    return { batchId: batch.id, total: specList.length };
  });

const BatchIdSchema = z.object({ batchId: z.string().uuid() });

export const getBatchProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cheap poll: read pre-aggregated counters from the batch row (maintained
    // by an AFTER trigger on tds_analysis_items). Failures capped at 20.
    const { data: batch, error: bErr } = await supabaseAdmin
      .from("tds_analysis_batches")
      .select(
        "id, status, total, label, created_at, updated_at, pending_count, processing_count, done_count, failed_count, skipped_cache_count",
      )
      .eq("id", data.batchId)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!batch) throw new Error("Batch not found.");

    const { data: failureRows, error: fErr } = await supabaseAdmin
      .from("tds_analysis_items")
      .select("spec_id, error")
      .eq("batch_id", data.batchId)
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (fErr) throw new Error(fErr.message);

    const counts = {
      pending: batch.pending_count ?? 0,
      processing: batch.processing_count ?? 0,
      done: batch.done_count ?? 0,
      failed: batch.failed_count ?? 0,
      skipped_cache: batch.skipped_cache_count ?? 0,
    };
    const finishedCount = counts.done + counts.failed + counts.skipped_cache;
    const isFinished = finishedCount >= (batch.total ?? 0);
    if (isFinished && batch.status === "running") {
      await supabaseAdmin
        .from("tds_analysis_batches")
        .update({ status: "complete" })
        .eq("id", batch.id);
    }

    return {
      batch: {
        id: batch.id,
        status: isFinished ? "complete" : batch.status,
        total: batch.total,
        label: batch.label,
        created_at: batch.created_at,
        updated_at: batch.updated_at,
      },
      counts,
      failures: (failureRows ?? []).map((f) => ({
        specId: f.spec_id,
        error: f.error ?? "unknown",
      })),
    };
  });

export const cancelBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tds_analysis_batches")
      .update({ status: "cancelled" })
      .eq("id", data.batchId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Repair legacy zero values: enqueue specs where any tracked numeric
 * column is exactly 0 (legacy 3M ingest artifact). Also nulls the affected
 * columns and clears their provenance so the safe-merge policy can refill.
 */
const NUMERIC_COLS = [
  "cure_temperature_c",
  "dry_tg_onset_c",
  "wet_tg_c",
  "peak_tg_c",
  "max_service_temperature_c",
  "out_life_days",
  "freezer_life_months",
  "tml_pct",
  "cvcm_pct",
  "tensile_lap_shear_mpa",
  "t_peel_n_per_25mm",
  "flatwise_tension_mpa",
  "climbing_drum_peel_in_lb_per_in",
] as const;

export const enqueueLegacyZeroRepair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const orFilter = NUMERIC_COLS.map((c) => `${c}.eq.0`).join(",");
    const { data: specs, error } = await supabaseAdmin
      .from("master_specs")
      .select("id")
      .not("tds_pdf_path", "is", null)
      .or(orFilter);
    if (error) throw new Error(error.message);
    const list = specs ?? [];
    if (list.length === 0) return { batchId: null as string | null, total: 0 };

    const ids = list.map((s) => s.id);

    // Null out zero-valued columns per column so safe-merge will refill them.
    for (const col of NUMERIC_COLS) {
      await supabaseAdmin
        .from("master_specs")
        .update({ [col]: null } as never)
        .in("id", ids)
        .eq(col, 0);
    }

    // Drop provenance rows for those fields so re-extraction is unblocked.
    await supabaseAdmin
      .from("tds_field_provenance")
      .delete()
      .in("spec_id", ids)
      .in("field", NUMERIC_COLS as unknown as string[]);

    const { data: batch, error: bErr } = await supabaseAdmin
      .from("tds_analysis_batches")
      .insert({
        created_by: context.userId,
        label: "Legacy zero repair",
        total: list.length,
        status: "running",
      })
      .select("id")
      .single();
    if (bErr || !batch) throw new Error(bErr?.message ?? "Failed to create batch.");

    const items = ids.map((id) => ({
      batch_id: batch.id,
      spec_id: id,
      status: "pending" as const,
    }));
    const { error: iErr } = await supabaseAdmin.from("tds_analysis_items").insert(items);
    if (iErr) throw new Error(iErr.message);

    return { batchId: batch.id, total: list.length };
  });
