import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only manual review + edit for master_specs.
 * All functions require super_admin.
 */

// Whitelist of DB columns the split-screen editor can update. Keep this narrow;
// AI-populated JSONB arrays (qualifications, test_results, etc.) are NOT
// editable here — they have their own re-analyze flow.
const EDITABLE_COLUMNS = new Set<string>([
  "product_name",
  "product_family",
  "material_category",
  "resin_chemistry",
  "reinforcement",
  "product_form",
  "process_method",
  "application_process",
  "active_ingredient_or_resin",
  "cure_temperature_c",
  "cure_time",
  "dry_tg_onset_c",
  "wet_tg_c",
  "peak_tg_c",
  "max_service_temperature_c",
  "out_life_days",
  "freezer_life_months",
  "shelf_life_months",
  "storage_temp_min_c",
  "storage_temp_max_c",
  "tml_pct",
  "cvcm_pct",
  "tensile_lap_shear_mpa",
  "t_peel_n_per_25mm",
  "flatwise_tension_mpa",
  "climbing_drum_peel_in_lb_per_in",
  "applications",
  "qualifications_standards",
  "notes",
  "minimum_order_quantity",
  "ooa_vbo_capable",
  "toughened",
  "flame_retardant",
  "low_dielectric",
  "low_moisture_absorption",
  "impact_resistant",
  "high_temperature",
]);

const REVIEW_STATUSES = ["unreviewed", "in_review", "checked", "flagged"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: super_admin only.");
}

// ---------- Dashboard summary ----------

export const getReviewSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [totalRes, withPdfRes, statusRes] = await Promise.all([
      supabaseAdmin.from("master_specs").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("master_specs")
        .select("id", { count: "exact", head: true })
        .not("tds_pdf_path", "is", null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabaseAdmin as any)
        .from("master_specs")
        .select("review_status"),
    ]);

    const total = totalRes.count ?? 0;
    const withPdf = withPdfRes.count ?? 0;
    const withoutPdf = total - withPdf;

    const buckets: Record<string, number> = {
      unreviewed: 0,
      in_review: 0,
      checked: 0,
      flagged: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (statusRes.data ?? []) as any[]) {
      const s = (row.review_status as string) ?? "unreviewed";
      if (s in buckets) buckets[s]++;
    }

    return {
      total,
      withPdf,
      withoutPdf,
      unreviewed: buckets.unreviewed,
      inReview: buckets.in_review,
      checked: buckets.checked,
      flagged: buckets.flagged,
    };
  });

// ---------- List for audit dashboard ----------

const ListSchema = z.object({
  search: z.string().max(200).optional(),
  vendor: z.string().max(100).optional(),
  reviewStatus: z.enum(["all", ...REVIEW_STATUSES]).default("all"),
  hasPdf: z.enum(["all", "yes", "no"]).default("all"),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export const listSpecsForReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabaseAdmin
      .from("master_specs")
      .select(
        "id, material_number, vendor, product_name, material_category, tds_pdf_path, tds_analyzed_at, review_status, reviewed_at, reviewed_by, review_notes, updated_at",
        { count: "exact" },
      );

    if (data.vendor && data.vendor !== "All") q = q.eq("vendor", data.vendor);
    if (data.reviewStatus !== "all") q = q.eq("review_status", data.reviewStatus);
    if (data.hasPdf === "yes") q = q.not("tds_pdf_path", "is", null);
    if (data.hasPdf === "no") q = q.is("tds_pdf_path", null);
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      q = q.or(`vendor.ilike.%${s}%,product_name.ilike.%${s}%,material_category.ilike.%${s}%`);
    }

    q = q
      .order("review_status", { ascending: true })
      .order("vendor", { ascending: true })
      .order("product_name", { ascending: true })
      .range(data.offset, data.offset + data.limit - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], count: count ?? 0 };
  });

// ---------- Full spec fetch for editor ----------

export const getSpecForEdit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ specId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabaseAdmin as any)
      .from("master_specs")
      .select("*")
      .eq("id", data.specId)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Update fields (audited) ----------

const UpdateFieldsSchema = z.object({
  specId: z.string().uuid(),
  changes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  note: z.string().max(500).optional(),
  markChecked: z.boolean().optional(),
});

export const updateSpecFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateFieldsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Filter to whitelisted columns
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.changes)) {
      if (EDITABLE_COLUMNS.has(k)) patch[k] = v;
    }
    if (Object.keys(patch).length === 0 && !data.markChecked) {
      return { updated: 0, edits: 0 };
    }

    // Fetch current row for diffing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: current, error: curErr } = await (supabaseAdmin as any)
      .from("master_specs")
      .select("*")
      .eq("id", data.specId)
      .single();
    if (curErr) throw new Error(curErr.message);

    // Compute real diff (skip no-op writes)
    const realPatch: Record<string, unknown> = {};
    const auditRows: {
      spec_id: string;
      field: string;
      old_value: unknown;
      new_value: unknown;
      edited_by: string;
      edited_by_email: string | null;
      note: string | null;
    }[] = [];
    const email = (context.claims?.email as string | undefined) ?? null;

    for (const [k, v] of Object.entries(patch)) {
      const before = current[k];
      const norm = (x: unknown) => (x === "" ? null : x);
      if (norm(before) === norm(v)) continue;
      realPatch[k] = v;
      auditRows.push({
        spec_id: data.specId,
        field: k,
        old_value: before ?? null,
        new_value: v ?? null,
        edited_by: context.userId,
        edited_by_email: email,
        note: data.note ?? null,
      });
    }

    if (data.markChecked) {
      realPatch.review_status = "checked";
      realPatch.reviewed_by = context.userId;
      realPatch.reviewed_at = new Date().toISOString();
      if (current.review_status !== "checked") {
        auditRows.push({
          spec_id: data.specId,
          field: "review_status",
          old_value: current.review_status ?? "unreviewed",
          new_value: "checked",
          edited_by: context.userId,
          edited_by_email: email,
          note: data.note ?? null,
        });
      }
    }

    if (Object.keys(realPatch).length === 0) {
      return { updated: 0, edits: 0 };
    }

    // Apply update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supabaseAdmin as any)
      .from("master_specs")
      .update(realPatch)
      .eq("id", data.specId);
    if (updErr) throw new Error(updErr.message);

    if (auditRows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: auditErr } = await (supabaseAdmin as any)
        .from("spec_manual_edits")
        .insert(auditRows);
      if (auditErr) throw new Error(auditErr.message);
    }

    return { updated: Object.keys(realPatch).length, edits: auditRows.length };
  });

// ---------- Set review status ----------

const SetStatusSchema = z.object({
  specId: z.string().uuid(),
  status: z.enum(REVIEW_STATUSES),
  note: z.string().max(500).optional(),
});

export const setReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = (context.claims?.email as string | undefined) ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: current, error: curErr } = await (supabaseAdmin as any)
      .from("master_specs")
      .select("review_status, review_notes")
      .eq("id", data.specId)
      .single();
    if (curErr) throw new Error(curErr.message);
    if (current.review_status === data.status && !data.note) {
      return { ok: true, changed: false };
    }

    const patch: Record<string, unknown> = {
      review_status: data.status,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    };
    if (data.note !== undefined) patch.review_notes = data.note;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supabaseAdmin as any)
      .from("master_specs")
      .update(patch)
      .eq("id", data.specId);
    if (updErr) throw new Error(updErr.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: auditErr } = await (supabaseAdmin as any)
      .from("spec_manual_edits")
      .insert({
        spec_id: data.specId,
        field: "review_status",
        old_value: current.review_status ?? "unreviewed",
        new_value: data.status,
        edited_by: context.userId,
        edited_by_email: email,
        note: data.note ?? null,
      });
    if (auditErr) throw new Error(auditErr.message);

    return { ok: true, changed: true };
  });

// ---------- List manual edits for one spec ----------

export const listSpecManualEdits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ specId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("spec_manual_edits")
      .select("id, field, old_value, new_value, edited_by, edited_by_email, note, created_at")
      .eq("spec_id", data.specId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows ?? []) as any[];
  });

export type ManualEditRow = {
  id: string;
  field: string;
  old_value: string | number | boolean | null;
  new_value: string | number | boolean | null;
  edited_by: string | null;
  edited_by_email: string | null;
  note: string | null;
  created_at: string;
};
