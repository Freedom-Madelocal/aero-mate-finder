import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Single-row TDS analysis. Unified with the bulk queue: creates a 1-item
 * batch row so every extraction (single or bulk) is observable and follows
 * the same telemetry / retry accounting. Runs inline for low latency on the
 * request path; the worker path handles retries for the bulk case.
 */

const InputSchema = z.object({
  specId: z.string().uuid(),
});

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
    const { runExtractionForSpec } = await import("@/lib/tdsExtract.server");

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
      .insert({ batch_id: batch.id, spec_id: data.specId, status: "processing" })
      .select("id")
      .single();
    if (iErr || !item) throw new Error(iErr?.message ?? "Failed to create batch item.");

    const startedAt = Date.now();
    try {
      const res = await runExtractionForSpec(data.specId);
      await supabaseAdmin
        .from("tds_analysis_items")
        .update({
          status: res.cacheHit ? "skipped_cache" : "done",
          updated_fields: res.updatedCount,
          latency_ms: Date.now() - startedAt,
        })
        .eq("id", item.id);
      return {
        batchId: batch.id,
        updatedCount: res.updatedCount,
        fields: res.fields,
        analyzedAt: new Date().toISOString(),
        cacheHit: res.cacheHit,
      };
    } catch (err) {
      const cls =
        (err as { errorClass?: string }).errorClass &&
        typeof (err as { errorClass?: string }).errorClass === "string"
          ? (err as { errorClass: string }).errorClass
          : "transient";
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("tds_analysis_items")
        .update({
          status: "failed",
          error: msg,
          error_class: cls,
          latency_ms: Date.now() - startedAt,
        })
        .eq("id", item.id);
      throw new Error(msg);
    }
  });
