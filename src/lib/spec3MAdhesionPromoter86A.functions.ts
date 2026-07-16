/**
 * Super-admin-only manual correction for the specific 3M Adhesion Promoter 86A
 * master_specs row. Preview + confirm flow: refuses to apply unless the caller
 * provides both the immutable row id AND the expected TDS document hash for
 * the current attached PDF, and the row it targets is the correct 3M product.
 *
 * All applied corrections are audited into public.spec_corrections.
 *
 * Values below are transcribed from the reviewed 3M 86A TDS. Unsupported
 * scalar fields (cure_time, dry/wet/peak Tg, max service temp, TML/CVCM,
 * mechanical properties) MUST remain null — do not add defaults.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { downloadTdsPdf, computeDocumentHash } from "@/lib/tdsExtract.server";

export const CORRECTION_KEY = "3m_adhesion_promoter_86a_v1";

const VENDOR_MATCH = /3\s*m/i;
const PRODUCT_MATCH = /(adhesion\s*promoter.*86a|^86a$)/i;

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/**
 * The exact patch we apply. Explicit `null` fields overwrite legacy zero/wrong
 * values; scalar fields not listed here are left untouched.
 */
export const CORRECTION_86A: Record<string, Json> = {
  material_category: "Adhesion Promoter",
  active_ingredient_or_resin: "Polyamide",
  resin_chemistry: "Polyamide",
  product_form: "Liquid; pre-saturated wipes",
  application_process:
    "Apply a minimum coating, dry for 10 minutes, and apply tape within 2 hours.",
  shelf_life_months: 24,
  storage_temp_min_c: 16, // 60 °F
  storage_temp_max_c: 27, // 80 °F

  // Explicit nulls — clears legacy zero/incorrect values.
  cure_temperature_c: null,
  cure_time: null,
  out_life_days: null,
  freezer_life_months: null,
  dry_tg_onset_c: null,
  wet_tg_c: null,
  peak_tg_c: null,
  max_service_temperature_c: null,
  tml_pct: null,
  cvcm_pct: null,
  tensile_lap_shear_mpa: null,
  t_peel_n_per_25mm: null,
  flatwise_tension_mpa: null,
  climbing_drum_peel_in_lb_per_in: null,

  qualifications: [],
  test_methods: [
    {
      method: "ASTM D1000",
      evidence_quote: "Adhesion is measured in accordance with ASTM D1000.",
      page: null,
    },
  ],
  contextual_standards: [
    {
      standard: "MIL-PRF-85285 Type IV",
      role: "tested_substrate_coating",
      evidence_quote: "Adhesion tested over MIL-PRF-85285 Type IV coating.",
      page: null,
    },
  ],
  product_identifiers: [
    {
      kind: "nsn",
      value: "8040-01-448-4791",
      applicability: "One-quart can",
      evidence_quote: "NSN 8040-01-448-4791 (one-quart can).",
      page: null,
    },
    {
      kind: "nsn",
      value: "8040-01-450-9187",
      applicability: "One-gallon can",
      evidence_quote: "NSN 8040-01-450-9187 (one-gallon can).",
      page: null,
    },
  ],
};

const ArgsSchema = z.object({
  specId: z.string().uuid(),
  expectedDocumentHash: z.string().min(16),
  evidence: z.string().optional(),
});

function pickSnapshot(spec: Record<string, unknown>): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const k of Object.keys(CORRECTION_86A)) {
    const v = spec[k];
    out[k] = (v === undefined ? null : (v as Json));
  }
  return out;
}

async function assertSuperAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r) => r.role === "super_admin")) {
    throw new Response("Forbidden", { status: 403 });
  }
}

async function loadAndVerify(userId: string, args: z.infer<typeof ArgsSchema>) {
  await assertSuperAdmin(userId);

  const { data: spec, error: specErr } = await supabaseAdmin
    .from("master_specs")
    .select("*")
    .eq("id", args.specId)
    .maybeSingle();
  if (specErr) throw new Error(specErr.message);
  if (!spec) throw new Error("Spec not found");

  const row = spec as Record<string, unknown>;
  const vendor = String(row.vendor ?? "");
  const productName = String(row.product_name ?? "");
  if (!VENDOR_MATCH.test(vendor) || !PRODUCT_MATCH.test(productName)) {
    throw new Error(
      `Row does not match 3M Adhesion Promoter 86A (vendor="${vendor}" product="${productName}").`,
    );
  }

  const pdfPath = row.tds_pdf_path as string | null;
  if (!pdfPath) throw new Error("Spec has no attached TDS PDF");
  const bytes = await downloadTdsPdf(pdfPath);
  const actualHash = computeDocumentHash(bytes);
  if (actualHash !== args.expectedDocumentHash) {
    throw new Error(
      `Document hash mismatch — refusing correction. Expected ${args.expectedDocumentHash}, got ${actualHash}.`,
    );
  }
  return row;
}

export const previewCorrection86A = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ArgsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const spec = await loadAndVerify(context.userId, data);
    const before = pickSnapshot(spec);
    const after = CORRECTION_86A;
    return {
      specId: data.specId,
      before: before as Record<string, Json>,
      after: after as Record<string, Json>,
    };
  });

export const applyCorrection86A = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ArgsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const spec = await loadAndVerify(context.userId, data);
    const before = pickSnapshot(spec);

    const { error: upErr } = await supabaseAdmin
      .from("master_specs")
      .update(CORRECTION_86A as never)
      .eq("id", data.specId);
    if (upErr) throw new Error(upErr.message);

    const { error: auErr } = await supabaseAdmin.from("spec_corrections").insert({
      spec_id: data.specId,
      correction_key: CORRECTION_KEY,
      expected_document_hash: data.expectedDocumentHash,
      actor_user_id: context.userId,
      before_values: before as never,
      after_values: CORRECTION_86A as never,
      evidence: data.evidence ?? null,
    });
    if (auErr) throw new Error(auErr.message);

    return { ok: true, updatedFields: Object.keys(CORRECTION_86A) };
  });
