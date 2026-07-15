import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Single-row TDS analysis. Delegates to the shared server extractor so it
 * uses the same safe-merge policy + cache as the background worker.
 */

const InputSchema = z.object({
  specId: z.string().uuid(),
});

export const analyzeSpecTds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden: super_admin only.");

    const { runExtractionForSpec } = await import("@/lib/tdsExtract.server");
    const res = await runExtractionForSpec(data.specId);
    // silence unused warning; supabaseAdmin isn't used here directly
    void supabaseAdmin;
    return {
      updatedCount: res.updatedCount,
      fields: res.fields,
      analyzedAt: new Date().toISOString(),
      cacheHit: res.cacheHit,
    };
  });
