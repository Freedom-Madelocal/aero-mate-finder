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

    const [{ data: batch, error: bErr }, { data: items, error: iErr }] = await Promise.all([
      supabaseAdmin
        .from("tds_analysis_batches")
        .select("id, status, total, label, created_at, updated_at")
        .eq("id", data.batchId)
        .maybeSingle(),
      supabaseAdmin
        .from("tds_analysis_items")
        .select("id, spec_id, status, updated_fields, error, latency_ms")
        .eq("batch_id", data.batchId),
    ]);
    if (bErr) throw new Error(bErr.message);
    if (!batch) throw new Error("Batch not found.");
    if (iErr) throw new Error(iErr.message);

    const counts = { pending: 0, processing: 0, done: 0, failed: 0, skipped_cache: 0 };
    const failures: Array<{ specId: string; error: string }> = [];
    for (const it of items ?? []) {
      const s = it.status as keyof typeof counts;
      if (s in counts) counts[s]++;
      if (it.status === "failed" && it.error) {
        failures.push({ specId: it.spec_id, error: it.error });
      }
    }

    const finishedCount = counts.done + counts.failed + counts.skipped_cache;
    const isFinished = finishedCount >= (batch.total ?? 0);
    if (isFinished && batch.status === "running") {
      await supabaseAdmin
        .from("tds_analysis_batches")
        .update({ status: "complete" })
        .eq("id", batch.id);
    }

    return {
      batch: { ...batch, status: isFinished ? "complete" : batch.status },
      counts,
      failures,
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
