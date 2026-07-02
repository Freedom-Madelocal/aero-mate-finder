import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Analyze the TDS PDF attached to a master spec with Lovable AI and update
 * the existing spec fields the platform already displays. Never adds new
 * fields, never touches identity/inventory/notes/star fields.
 */

const BUCKET = "tds-pdfs";

const InputSchema = z.object({
  specId: z.string().uuid(),
});

const RowSchema = z
  .object({
    productFamily: z.string().nullable().optional(),
    materialCategory: z.string().nullable().optional(),
    resinChemistry: z.string().nullable().optional(),
    reinforcement: z.string().nullable().optional(),
    productForm: z.string().nullable().optional(),
    cureTemperatureC: z.number().nullable().optional(),
    cureTime: z.string().nullable().optional(),
    dryTgOnsetC: z.number().nullable().optional(),
    wetTgC: z.number().nullable().optional(),
    peakTgC: z.number().nullable().optional(),
    maxServiceTemperatureC: z.number().nullable().optional(),
    outLifeDays: z.number().nullable().optional(),
    freezerLifeMonths: z.number().nullable().optional(),
    tmlPct: z.number().nullable().optional(),
    cvcmPct: z.number().nullable().optional(),
    tensileLapShearMpa: z.number().nullable().optional(),
    tPeelN25mm: z.number().nullable().optional(),
    flatwiseTensionMpa: z.number().nullable().optional(),
    climbingDrumPeelInLbIn: z.number().nullable().optional(),
    processMethod: z.string().nullable().optional(),
    ooaVboCapable: z.boolean().optional(),
    toughened: z.boolean().optional(),
    flameRetardant: z.boolean().optional(),
    lowDielectric: z.boolean().optional(),
    lowMoistureAbsorption: z.boolean().optional(),
    impactResistant: z.boolean().optional(),
    highTemperature: z.boolean().optional(),
    applications: z.string().nullable().optional(),
    qualificationsStandards: z.string().nullable().optional(),
    minimumOrderQuantity: z.string().nullable().optional(),
    profiles: z.array(z.string()).optional(),
    keySpecs: z.array(z.string()).optional(),
    customers: z.array(z.string()).optional(),
  });

const TOOL = {
  type: "function" as const,
  function: {
    name: "emit_spec",
    description: "Return the technical specs for the single product described.",
    parameters: {
      type: "object",
      properties: {
        productFamily: { type: "string" },
        materialCategory: { type: "string" },
        resinChemistry: { type: "string" },
        reinforcement: { type: "string" },
        productForm: { type: "string" },
        cureTemperatureC: { type: ["number", "null"] },
        cureTime: { type: "string" },
        dryTgOnsetC: { type: ["number", "null"] },
        wetTgC: { type: ["number", "null"] },
        peakTgC: { type: ["number", "null"] },
        maxServiceTemperatureC: { type: ["number", "null"] },
        outLifeDays: { type: ["number", "null"] },
        freezerLifeMonths: { type: ["number", "null"] },
        tmlPct: { type: ["number", "null"] },
        cvcmPct: { type: ["number", "null"] },
        tensileLapShearMpa: { type: ["number", "null"] },
        tPeelN25mm: { type: ["number", "null"] },
        flatwiseTensionMpa: { type: ["number", "null"] },
        climbingDrumPeelInLbIn: { type: ["number", "null"] },
        processMethod: { type: "string" },
        ooaVboCapable: { type: "boolean" },
        toughened: { type: "boolean" },
        flameRetardant: { type: "boolean" },
        lowDielectric: { type: "boolean" },
        lowMoistureAbsorption: { type: "boolean" },
        impactResistant: { type: "boolean" },
        highTemperature: { type: "boolean" },
        applications: { type: "string" },
        qualificationsStandards: { type: "string" },
        minimumOrderQuantity: { type: "string" },
        profiles: { type: "array", items: { type: "string" } },
        keySpecs: { type: "array", items: { type: "string" } },
        customers: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
  },
};

const SYSTEM = `You extract the aerospace material specs for ONE named product from its Technical Data Sheet PDF.

Rules:
- Extract data ONLY for the specified vendor + product. Ignore other products the PDF may list.
- For TEXT fields: if the value is not clearly stated, OMIT the field (do not guess, do not use "none given").
- For NUMERIC fields: convert units to metric (°F→°C, psi→MPa, lb/in→N/25mm as appropriate). Omit if not stated.
- For BOOLEAN flags: return true only when the PDF clearly states/implies the property. Omit if unknown — never return false to overwrite an existing true.
- keySpecs: list every universal/OEM spec number the product is qualified to (BMS, AIMS, AMS, MIL-*, ASTM, etc.), verbatim.
- customers: list every OEM/customer the PDF names as qualified/approved (Boeing, Airbus, Bell, Lockheed, Northrop, Sikorsky, NASA, etc.).
- profiles: section/category tags the product falls under in the PDF (e.g. Structural, Interiors, MRO, Repair, Tooling).`;

function isMissing(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "" || t === "none given" || t === "n/a";
  }
  return false;
}

function dedupe(arr: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const v of arr) {
    if (!v) continue;
    const t = String(v).trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (!seen.has(k)) seen.set(k, t);
  }
  return Array.from(seen.values());
}

const FIELD_MAP: Array<[keyof z.infer<typeof RowSchema>, string, "text" | "num" | "bool"]> = [
  ["productFamily", "product_family", "text"],
  ["materialCategory", "material_category", "text"],
  ["resinChemistry", "resin_chemistry", "text"],
  ["reinforcement", "reinforcement", "text"],
  ["productForm", "product_form", "text"],
  ["cureTemperatureC", "cure_temperature_c", "num"],
  ["cureTime", "cure_time", "text"],
  ["dryTgOnsetC", "dry_tg_onset_c", "num"],
  ["wetTgC", "wet_tg_c", "num"],
  ["peakTgC", "peak_tg_c", "num"],
  ["maxServiceTemperatureC", "max_service_temperature_c", "num"],
  ["outLifeDays", "out_life_days", "num"],
  ["freezerLifeMonths", "freezer_life_months", "num"],
  ["tmlPct", "tml_pct", "num"],
  ["cvcmPct", "cvcm_pct", "num"],
  ["tensileLapShearMpa", "tensile_lap_shear_mpa", "num"],
  ["tPeelN25mm", "t_peel_n_per_25mm", "num"],
  ["flatwiseTensionMpa", "flatwise_tension_mpa", "num"],
  ["climbingDrumPeelInLbIn", "climbing_drum_peel_in_lb_per_in", "num"],
  ["processMethod", "process_method", "text"],
  ["ooaVboCapable", "ooa_vbo_capable", "bool"],
  ["toughened", "toughened", "bool"],
  ["flameRetardant", "flame_retardant", "bool"],
  ["lowDielectric", "low_dielectric", "bool"],
  ["lowMoistureAbsorption", "low_moisture_absorption", "bool"],
  ["impactResistant", "impact_resistant", "bool"],
  ["highTemperature", "high_temperature", "bool"],
  ["applications", "applications", "text"],
  ["qualificationsStandards", "qualifications_standards", "text"],
  ["minimumOrderQuantity", "minimum_order_quantity", "text"],
];

export const analyzeSpecTds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: spec, error: specErr } = await supabaseAdmin
      .from("master_specs")
      .select("*")
      .eq("id", data.specId)
      .maybeSingle();
    if (specErr) throw new Error(specErr.message);
    if (!spec) throw new Error("Spec not found.");
    if (!spec.tds_pdf_path) throw new Error("This spec has no attached TDS PDF.");

    const dl = await supabaseAdmin.storage.from(BUCKET).download(spec.tds_pdf_path);
    if (dl.error || !dl.data) throw new Error(`Failed to download TDS: ${dl.error?.message ?? "unknown"}`);

    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const fileBase64 = btoa(binary);
    const fileName = spec.tds_pdf_path.split("/").pop() || "tds.pdf";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract the technical specs for vendor "${spec.vendor}" product "${spec.product_name}" from this TDS PDF.`,
              },
              {
                type: "file",
                file: {
                  filename: fileName,
                  file_data: `data:application/pdf;base64,${fileBase64}`,
                },
              },
            ],
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "emit_spec" } },
      }),
    });

    if (resp.status === 429) throw new Error("AI rate limit reached. Please wait and try again.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Settings > Workspace > Usage.");
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      console.error("[analyzeSpecTds] gateway error", resp.status, t);
      throw new Error(`AI gateway error (${resp.status}).`);
    }

    const json = (await resp.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI returned no structured output.");

    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(args);
    } catch {
      throw new Error("AI returned malformed JSON.");
    }
    const parsed = RowSchema.safeParse(parsedRaw);
    if (!parsed.success) throw new Error("AI output did not match expected schema.");
    const row = parsed.data;

    const patch: Record<string, unknown> = {};
    const updatedLabels: string[] = [];

    for (const [aiKey, dbCol, kind] of FIELD_MAP) {
      const v = row[aiKey];
      if (kind === "text") {
        if (!isMissing(v) && String(v) !== String(spec[dbCol as keyof typeof spec] ?? "")) {
          patch[dbCol] = String(v);
          updatedLabels.push(dbCol);
        }
      } else if (kind === "num") {
        if (typeof v === "number" && Number.isFinite(v) && v !== spec[dbCol as keyof typeof spec]) {
          patch[dbCol] = v;
          updatedLabels.push(dbCol);
        }
      } else {
        if (v === true && spec[dbCol as keyof typeof spec] !== true) {
          patch[dbCol] = true;
          updatedLabels.push(dbCol);
        }
      }
    }

    // Array unions
    const existingProfiles = Array.isArray(spec.profiles) ? (spec.profiles as string[]) : [];
    const mergedProfiles = dedupe([...existingProfiles, ...(row.profiles ?? [])]);
    if (mergedProfiles.length > existingProfiles.length) {
      patch.profiles = mergedProfiles;
      updatedLabels.push("profiles");
    }
    const existingKeySpecs = Array.isArray(spec.key_specs) ? (spec.key_specs as string[]) : [];
    const mergedKeySpecs = dedupe([...existingKeySpecs, ...(row.keySpecs ?? [])]);
    if (mergedKeySpecs.length > existingKeySpecs.length) {
      patch.key_specs = mergedKeySpecs;
      updatedLabels.push("key_specs");
    }
    const existingCustomers = Array.isArray(spec.customers) ? (spec.customers as string[]) : [];
    const mergedCustomers = dedupe([...existingCustomers, ...(row.customers ?? [])]);
    if (mergedCustomers.length > existingCustomers.length) {
      patch.customers = mergedCustomers;
      updatedLabels.push("customers");
    }

    if (Object.keys(patch).length === 0) {
      return { updatedCount: 0, fields: [] as string[] };
    }

    const { error: upErr } = await supabaseAdmin
      .from("master_specs")
      .update(patch)
      .eq("id", spec.id);
    if (upErr) throw new Error(upErr.message);

    return { updatedCount: updatedLabels.length, fields: updatedLabels };
  });
