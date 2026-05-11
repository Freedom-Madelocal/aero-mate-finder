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
  });

export type ExtractedSpec = z.infer<typeof ExtractedSpecSchema>;

const InputSchema = z.object({
  fileBase64: z.string().min(100).max(25_000_000), // ~18 MB raw
  fileName: z.string().min(1).max(255),
});

const SYSTEM_PROMPT = `You extract aerospace material product specifications from vendor PDFs into structured JSON.

Rules:
- Emit ONE row per distinct product/grade/part-number found in the document.
- Treat section headings, category headings, or table titles (e.g. "MRO", "Interiors", "Structural", "Repair", "Tooling", "Aerospace") as PROFILES. Tag each product with the profiles whose section it appears under. A product that appears in multiple sections must list all those profiles.
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
            },
            required: ["vendor", "productName", "profiles"],
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
      if (v.success) rows.push(v.data);
    }

    const profilesDetected = Array.from(
      new Set(rows.flatMap((r) => r.profiles ?? []).filter((p) => p && p.trim().length > 0)),
    ).sort();

    return { rows: rows as Record<string, unknown>[], profilesDetected };
  });
      new Set(rows.flatMap((r) => r.profiles ?? []).filter((p) => p && p.trim().length > 0)),
    ).sort();

    return { rows, profilesDetected };
  });
