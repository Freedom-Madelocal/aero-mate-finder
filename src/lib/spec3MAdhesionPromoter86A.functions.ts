/**
 * Super-admin-only manual correction for the specific 3M Adhesion Promoter 86A
 * master_specs row. Preview + confirm flow: refuses to apply unless the caller
 * provides both the immutable row id AND the expected TDS document hash for
 * the current attached PDF, and the row it targets is the correct 3M product.
 *
 * All applied corrections are audited into public.spec_corrections.
 *
 * Values below are transcribed verbatim from the reviewed 3M 86A TDS. See the
 * Phase-2A plan for the audit rationale; unsupported scalar fields (cure_time,
 * dry_tg_onset_c, wet_tg_c, peak_tg_c, max_service_temperature_c, tml/cvcm,
 * mechanical properties) MUST remain null — do not add "reasonable defaults".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const CORRECTION_KEY = "3m_adhesion_promoter_86a_v1";

const VENDOR_MATCH = /3\s*m/i;
const PRODUCT_MATCH = /(adhesion\s*promoter.*86a|^86a$)/i;

// Fields we care about for the correction. Any field that must remain NULL
// per the audit is included with an explicit `null` so the preview shows it
// alongside the corrected values.
export const CORRECTION_86A = {
  material_category: "Adhesion Promoter",
  active_ingredient_or_resin: "Polyamide",
  resin_chemistry: "Polyamide",
  product_form: "Liquid; pre-saturated wipes",
  application_process:
    "Apply a minimum coating, dry for 10 minutes, and apply tape within 2 hours.",
  shelf_life_months: 24,
  storage_temp_min_c: 16, // 60 °F
  storage_temp_max_c: 27, // 80 °F
  // Explicit nulls: prior legacy 0s are wrong, correct value is unknown.
  cure_temperature_c: null as number | null,
  cure_time: null as string | null,
  out_life_days: null as number | null,
  freezer_life_months: null as number | null,
  dry_tg_onset_c: null as number | null,
  wet_tg_c: null as number | null,
  peak_tg_c: null as number | null,
  max_service_temperature_c: null as number | null,
  tml_pct: null as number | null,
  cvcm_pct: null as number | null,
  tensile_lap_shear_mpa: null as number | null,
  t_peel_n_per_25mm: null as number | null,
  flatwise_tension_mpa: null as number | null,
  climbing_drum_peel_in_lb_per_in: null as number | null,

  // JSON groups
  qualifications: [] as Array<Record<string, unknown>>, // none — TDS lists no product-conformance standards
  test_methods: [
    {
      method: "ASTM D1000",
      evidence_quote:
        "Adhesion is measured in accordance with ASTM D1000.",
      page: null,
    },
  ],
  contextual_standards: [
    {
      standard: "MIL-PRF-85285 Type IV",
      role: "tested_substrate_coating",
      evidence_quote:
        "Adhesion tested over MIL-PRF-85285 Type IV coating.",
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
} as const;

type CorrectionValues = typeof CORRECTION_86A;

const ArgsSchema = z.object({
  specId: z.string().uuid(),
  expectedDocumentHash: z.string().min(16),
  evidence: z.string().optional(),
});

function pickSnapshot(spec: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(CORRECTION_86A) as (keyof CorrectionValues)[];
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = spec[k] ?? null;
  return out;
}

async function assertSuperAdmin(supabase: ReturnType<typeof requireSupabaseAuth>["_"]["context"] extends never ? never : never, _userId: string) {
  return; // helper placeholder — we do the check inline against context.supabase
}
void assertSuperAdmin;

async function loadAndVerify(context: { supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>; userId: string }, args: z.infer<typeof ArgsSchema>) {
  const { data: isAdmin, error: roleErr } = await context.supabase.rpc("is_super_admin", { _user_id: context.userId });
  if (roleErr) throw new Error(roleErr.message);
  if (!isAdmin) throw new Error("Forbidden: super-admin only");

  // Import admin client only after authorization (see server-functions-modern).
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: spec, error: specErr } = await supabaseAdmin
    .from("master_specs")
    .select("*")
    .eq("id", args.specId)
    .maybeSingle();
  if (specErr) throw new Error(specErr.message);
  if (!spec) throw new Error("Spec not found");

  const vendor = String((spec as Record<string, unknown>).vendor ?? "");
  const productName = String((spec as Record<string, unknown>).product_name ?? "");
  if (!VENDOR_MATCH.test(vendor) || !PRODUCT_MATCH.test(productName)) {
    throw new Error(
      `Row does not match 3M Adhesion Promoter 86A (got vendor="${vendor}" product="${productName}")`,
    );
  }

  // Verify document hash — download PDF and hash it with the same policy as
  // the extractor so the caller cannot apply against a different document.
  const { downloadTdsPdf, computeDocumentHash } = await import("@/lib/tdsExtract.server");
  const pdfPath = (spec as Record<string, unknown>).tds_pdf_path as string | null;
  if (!pdfPath) throw new Error("Spec has no attached TDS PDF");
  const bytes = await downloadTdsPdf(pdfPath);
  const actualHash = computeDocumentHash(bytes);
  if (actualHash !== args.expectedDocumentHash) {
    throw new Error(
      `Document hash mismatch — refusing correction. Expected ${args.expectedDocumentHash}, got ${actualHash}.`,
    );
  }

  return { spec: spec as Record<string, unknown>, supabaseAdmin };
}

export const previewCorrection86A = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ArgsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { spec } = await loadAndVerify(context as never, data);
    return {
      specId: data.specId,
      before: pickSnapshot(spec),
      after: CORRECTION_86A,
    };
  });

export const applyCorrection86A = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ArgsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { spec, supabaseAdmin } = await loadAndVerify(context as never, data);
    const before = pickSnapshot(spec);

    const patch: Record<string, unknown> = { ...CORRECTION_86A };
    const { error: upErr } = await supabaseAdmin
      .from("master_specs")
      .update(patch as never)
      .eq("id", data.specId);
    if (upErr) throw new Error(upErr.message);

    const { error: auErr } = await supabaseAdmin.from("spec_corrections").insert({
      spec_id: data.specId,
      correction_key: CORRECTION_KEY,
      expected_document_hash: data.expectedDocumentHash,
      actor_user_id: (context as { userId: string }).userId,
      before_values: before as never,
      after_values: CORRECTION_86A as never,
      evidence: data.evidence ?? null,
    });
    if (auErr) throw new Error(auErr.message);

    return { ok: true, updatedFields: Object.keys(CORRECTION_86A) };
  });
