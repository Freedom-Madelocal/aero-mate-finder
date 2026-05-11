import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Extract product spec rows from a PDF using Lovable AI Gateway (Gemini 2.5 Pro).
 * Uses tool calling for strict structured output. Headings (e.g. MRO, Interiors)
 * become "profiles" tags on each product. A product can carry multiple profiles.
 */

const ExtractedSpecSchema = z
  .object({
    vendor: z.string().nullable().optional(),
    productName: z.string().nullable().optional(),
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
    crossoverProduct: z.string().nullable().optional(),
    crossoverVendor: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    minimumOrderQuantity: z.string().nullable().optional(),
    profiles: z.array(z.string()).optional(),
    keySpecs: z.array(z.string()).optional(),
  });

export interface ExtractedSpec {
  vendor: string | null;
  productName: string | null;
  productFamily: string | null;
  materialCategory: string | null;
  resinChemistry: string | null;
  reinforcement: string | null;
  productForm: string | null;
  cureTemperatureC: number | null;
  cureTime: string | null;
  dryTgOnsetC: number | null;
  wetTgC: number | null;
  peakTgC: number | null;
  maxServiceTemperatureC: number | null;
  outLifeDays: number | null;
  freezerLifeMonths: number | null;
  tmlPct: number | null;
  cvcmPct: number | null;
  tensileLapShearMpa: number | null;
  tPeelN25mm: number | null;
  flatwiseTensionMpa: number | null;
  climbingDrumPeelInLbIn: number | null;
  processMethod: string | null;
  ooaVboCapable: boolean;
  toughened: boolean;
  flameRetardant: boolean;
  lowDielectric: boolean;
  lowMoistureAbsorption: boolean;
  impactResistant: boolean;
  highTemperature: boolean;
  applications: string | null;
  qualificationsStandards: string | null;
  crossoverProduct: string | null;
  crossoverVendor: string | null;
  notes: string | null;
  minimumOrderQuantity: string | null;
  profiles: string[];
  keySpecs: string[];
}

const MISSING = "none given";
const txt = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v : MISSING;
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const boolOr = (v: unknown): boolean => v === true;

function normalize(r: z.infer<typeof ExtractedSpecSchema>): ExtractedSpec {
  return {
    vendor: txt(r.vendor),
    productName: txt(r.productName),
    productFamily: txt(r.productFamily),
    materialCategory: txt(r.materialCategory),
    resinChemistry: txt(r.resinChemistry),
    reinforcement: txt(r.reinforcement),
    productForm: txt(r.productForm),
    cureTemperatureC: numOrNull(r.cureTemperatureC),
    cureTime: txt(r.cureTime),
    dryTgOnsetC: numOrNull(r.dryTgOnsetC),
    wetTgC: numOrNull(r.wetTgC),
    peakTgC: numOrNull(r.peakTgC),
    maxServiceTemperatureC: numOrNull(r.maxServiceTemperatureC),
    outLifeDays: numOrNull(r.outLifeDays),
    freezerLifeMonths: numOrNull(r.freezerLifeMonths),
    tmlPct: numOrNull(r.tmlPct),
    cvcmPct: numOrNull(r.cvcmPct),
    tensileLapShearMpa: numOrNull(r.tensileLapShearMpa),
    tPeelN25mm: numOrNull(r.tPeelN25mm),
    flatwiseTensionMpa: numOrNull(r.flatwiseTensionMpa),
    climbingDrumPeelInLbIn: numOrNull(r.climbingDrumPeelInLbIn),
    processMethod: txt(r.processMethod),
    ooaVboCapable: boolOr(r.ooaVboCapable),
    toughened: boolOr(r.toughened),
    flameRetardant: boolOr(r.flameRetardant),
    lowDielectric: boolOr(r.lowDielectric),
    lowMoistureAbsorption: boolOr(r.lowMoistureAbsorption),
    impactResistant: boolOr(r.impactResistant),
    highTemperature: boolOr(r.highTemperature),
    applications: txt(r.applications),
    qualificationsStandards: txt(r.qualificationsStandards),
    crossoverProduct: txt(r.crossoverProduct),
    crossoverVendor: txt(r.crossoverVendor),
    notes: txt(r.notes),
    minimumOrderQuantity: txt(r.minimumOrderQuantity),
    profiles: Array.isArray(r.profiles) ? r.profiles.filter((p): p is string => typeof p === "string" && p.trim().length > 0) : [],
    keySpecs: Array.isArray(r.keySpecs) ? r.keySpecs.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim()) : [],
  };
}

const InputSchema = z.object({
  fileBase64: z.string().min(100).max(25_000_000), // ~18 MB raw
  fileName: z.string().min(1).max(255),
});

const SYSTEM_PROMPT = `You extract aerospace material product specifications from vendor PDFs into structured JSON.

Rules:
- Emit ONE row per distinct product/grade/part-number found in the document.
- Treat section headings, category headings, or table titles (e.g. "MRO", "Interiors", "Structural", "Repair", "Tooling", "Aerospace") as PROFILES. Tag each product with the profiles whose section it appears under. A product that appears in multiple sections must list all those profiles.
- KEY SPECS: extract every universal/OEM specification number associated with each product into the keySpecs[] array. These identify the part across manufacturers. Examples of patterns to capture (non-exhaustive): Boeing "BMS5-101", "BMS 5-101", "BAC5000"; Airbus "AIMS04-04-001", "ABS5334"; Bell "BPS4427"; Lockheed "STM39-01"; Northrop "NAI-1234"; Sikorsky "SS9710"; military "MIL-A-25463", "MIL-PRF-83282"; SAE "AMS3819", "AMS-C-9084"; ASTM "ASTM D5868"; NASM/MS "MS20995"; EN/DIN/ISO standards. Capture each spec number verbatim (preserve hyphens, slashes, and numbering). Do not invent specs that are not in the source document.
- For TEXT fields, if the value is missing/unknown, return the literal string "none given" (do NOT guess).
- For NUMERIC fields, if missing/unknown, return null.
- For BOOLEAN flags, return false when unknown.
- Map units: convert °F to °C, psi to MPa, etc., when source is in non-metric.
- Be exhaustive — do not skip products. Do not invent products.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "emit_specs",
    description: "Return all product specs extracted from the PDF.",
    parameters: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              vendor: { type: "string" },
              productName: { type: "string" },
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
              crossoverProduct: { type: "string" },
              crossoverVendor: { type: "string" },
              notes: { type: "string" },
              minimumOrderQuantity: { type: "string" },
              profiles: { type: "array", items: { type: "string" } },
              keySpecs: { type: "array", items: { type: "string" }, description: "Universal/OEM spec numbers (BMS5-101, MIL-PRF-83282, AMS3819, etc.). Verbatim." },
            },
            required: ["vendor", "productName", "profiles", "keySpecs"],
            additionalProperties: false,
          },
        },
      },
      required: ["rows"],
      additionalProperties: false,
    },
  },
};

export const extractSpecsFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY is not configured.");
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract every product spec from this vendor PDF (${data.fileName}). Tag profiles from section headings.`,
              },
              {
                type: "file",
                file: {
                  filename: data.fileName,
                  file_data: `data:application/pdf;base64,${data.fileBase64}`,
                },
              },
            ],
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "emit_specs" } },
      }),
    });

    if (resp.status === 429) {
      throw new Error("AI rate limit reached. Please wait a minute and try again.");
    }
    if (resp.status === 402) {
      throw new Error("AI credits exhausted. Add credits in Settings > Workspace > Usage.");
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      console.error("[extractSpecsFromPdf] gateway error", resp.status, t);
      throw new Error(`AI gateway error (${resp.status}).`);
    }

    const json = (await resp.json()) as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{ function?: { arguments?: string } }>;
        };
      }>;
    };

    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      throw new Error("AI returned no structured output. Try a different PDF.");
    }

    let parsed: { rows: unknown[] };
    try {
      parsed = JSON.parse(args);
    } catch {
      throw new Error("AI returned malformed JSON.");
    }

    const rows: ExtractedSpec[] = [];
    for (const r of parsed.rows ?? []) {
      const v = ExtractedSpecSchema.safeParse(r);
      if (v.success) rows.push(normalize(v.data));
    }

    const profilesDetected = Array.from(
      new Set(rows.flatMap((r) => r.profiles).filter((p) => p && p.trim().length > 0)),
    ).sort();

    return { rows, profilesDetected };
  });
