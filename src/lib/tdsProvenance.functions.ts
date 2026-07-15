import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Provenance queries + single-field re-analyze.
 * Read is allowed for any authed user (informational).
 * Re-analyze is super_admin only.
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

const SpecIdSchema = z.object({ specId: z.string().uuid() });

export const getSpecProvenance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SpecIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tds_field_provenance")
      .select(
        "field, value_text, value_num, value_bool, unit, source_page, source_quote, confidence, model, prompt_version, extracted_at",
      )
      .eq("spec_id", data.specId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const ReanalyzeSchema = z.object({
  specId: z.string().uuid(),
  field: z.string().min(1).max(100),
});

export const reanalyzeSpecField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReanalyzeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runExtractionForSpec } = await import("@/lib/tdsExtract.server");

    // Clear the target column + old provenance so the safe-merge policy will refill it.
    await supabaseAdmin
      .from("master_specs")
      .update({ [data.field]: null } as never)
      .eq("id", data.specId);
    await supabaseAdmin
      .from("tds_field_provenance")
      .delete()
      .eq("spec_id", data.specId)
      .eq("field", data.field);

    const res = await runExtractionForSpec(data.specId);
    return { updatedCount: res.updatedCount, fields: res.fields };
  });
