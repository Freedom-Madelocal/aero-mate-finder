import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * AI-driven column mapping for spreadsheet uploads to the Master Spec list.
 *
 * The client parses an Excel/CSV workbook into raw sheet samples (no assumed
 * header row) and asks AI to: (1) identify the header row for each sheet,
 * and (2) map each column index to a canonical MasterSpec field key.
 *
 * The client then applies the mapping deterministically to every data row
 * across every sheet — no human mapping step required.
 */

// Canonical field keys the AI is allowed to choose from. Keep in sync with
// the FIELD_MAP in SpecSheetUpload.tsx.
const FIELD_KEYS = [
  "vendor",
  "productName",
  "productFamily",
  "materialCategory",
  "resinChemistry",
  "reinforcement",
  "productForm",
  "cureTemperatureC",
  "cureTime",
  "dryTgOnsetC",
  "wetTgC",
  "peakTgC",
  "maxServiceTemperatureC",
  "outLifeDays",
  "freezerLifeMonths",
  "tmlPct",
  "cvcmPct",
  "tensileLapShearMpa",
  "tPeelN25mm",
  "flatwiseTensionMpa",
  "climbingDrumPeelInLbIn",
  "processMethod",
  "ooaVboCapable",
  "toughened",
  "flameRetardant",
  "lowDielectric",
  "lowMoistureAbsorption",
  "impactResistant",
  "highTemperature",
  "applications",
  "qualificationsStandards",
  "crossoverProduct",
  "crossoverVendor",
  "notes",
  "minimumOrderQuantity",
  "keySpecs",
  "customers",
  "profiles",
] as const;

const FieldKey = z.enum([...FIELD_KEYS, "ignore"]);

const SheetMappingSchema = z.object({
  name: z.string(),
  headerRowIndex: z.number().int().min(0),
  skip: z.boolean().optional(),
  vendorOverride: z.string().nullable().optional(),
  columns: z.array(
    z.object({
      index: z.number().int().min(0),
      field: FieldKey,
    }),
  ),
});

const ResponseSchema = z.object({
  sheets: z.array(SheetMappingSchema),
});

export type SheetMapping = z.infer<typeof SheetMappingSchema>;

const InputSchema = z.object({
  sheets: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        // First ~12 rows of the sheet, raw (no header assumption).
        // Each row is a list of cells (string or null). Cells are pre-trimmed/truncated by client.
        sampleRows: z.array(z.array(z.union([z.string(), z.number(), z.null()]).nullable())).max(20),
      }),
    )
    .min(1)
    .max(20),
});

const SYSTEM_PROMPT = `You map columns of vendor aerospace-material spreadsheets to a canonical schema.

For EACH sheet in the input, decide:
1. headerRowIndex — the 0-based index of the row that contains column headers.
   Many vendor sheets have a title row, a subtitle row, then headers (often row 2). Skip
   merged-title rows and pick the row that lists short, descriptive column labels.
2. columns — for every column in that header row, choose ONE canonical field key from
   the allowed list, or "ignore" if no good match exists. Map intelligently:
   - "Supplier"/"Mfg"/"Brand" → vendor
   - "Part Number", "Product", "Grade", "Material" → productName
   - "Brand / Family" → productFamily
   - "Category" → materialCategory
   - "Product Type" / "Cure Process" / "Molding Process" → processMethod
   - "Base Chemistry / Matrix" / "Resin" / "Resin System" → resinChemistry
   - "Fiber Type" / "Fiber Category" / "Reinforcement" → reinforcement
   - "Product Form" / "Standard Prepreg Forms" → productForm
   - Cure Temp (any units) → cureTemperatureC
   - "Out-Life (Days)" / "Out-Life at RT" → outLifeDays
   - "Freezer Life (Mo)" / "Storage / Freezer" → freezerLifeMonths
   - Dry Tg / DMA Tg → dryTgOnsetC; Wet Tg → wetTgC; Peak Tg → peakTgC
   - "Max Service Temperature" → maxServiceTemperatureC
   - "Application Areas" / "Typical Applications" → applications
   - "Aerospace / Market Segments" / "Aerospace Segments" → profiles
     (this is the section/segment tag; not customers)
   - "Key Notes & Features" / "Key Attributes" / "Notes" → notes
   - "Qualifications" / "Standards" / "QPL" → qualificationsStandards
   - OEM/spec-number columns (BMS / AMS / MIL / AIMS / ABS / BPS / STM) → keySpecs
   - "Customer" / "OEM" / "End User" / "Approved By" → customers
3. skip — true if the sheet is a cover/summary/index page with no product rows.
4. vendorOverride — if the sheet is dedicated to one vendor (e.g. "3M Aerospace",
   "Henkel Loctite", "Hexcel Full Line", "Toray Composites", "Syensqo") and the sheet
   does NOT have its own Supplier column, set this to the canonical short vendor name
   ("3M", "Henkel", "Hexcel", "Toray", "Syensqo", etc.). Otherwise null.

Be exhaustive — return mapping entries for EVERY column in the chosen header row,
even if many are "ignore". Never invent columns that aren't there.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "emit_sheet_mappings",
    description: "Return per-sheet header row and column→field mappings.",
    parameters: {
      type: "object",
      properties: {
        sheets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              headerRowIndex: { type: "integer", minimum: 0 },
              skip: { type: "boolean" },
              vendorOverride: { type: ["string", "null"] },
              columns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "integer", minimum: 0 },
                    field: { type: "string", enum: [...FIELD_KEYS, "ignore"] },
                  },
                  required: ["index", "field"],
                  additionalProperties: false,
                },
              },
            },
            required: ["name", "headerRowIndex", "columns"],
            additionalProperties: false,
          },
        },
      },
      required: ["sheets"],
      additionalProperties: false,
    },
  },
};

export const autoMapSpreadsheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");

    const userPayload = {
      sheets: data.sheets.map((s) => ({
        name: s.name,
        sampleRows: s.sampleRows,
      })),
    };

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
            content: `Map the columns for each sheet below. Sheets are given as the first rows of each tab (no header assumption).\n\n${JSON.stringify(userPayload)}`,
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "emit_sheet_mappings" } },
      }),
    });

    if (resp.status === 429) throw new Error("AI rate limit reached. Please wait and try again.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Settings > Workspace > Usage.");
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      console.error("[autoMapSpreadsheet] gateway error", resp.status, t);
      throw new Error(`AI gateway error (${resp.status}).`);
    }

    const json = (await resp.json()) as {
      choices?: Array<{
        message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
      }>;
    };

    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI returned no structured output.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
    } catch {
      throw new Error("AI returned malformed JSON.");
    }

    const safe = ResponseSchema.safeParse(parsed);
    if (!safe.success) throw new Error("AI returned an unexpected mapping shape.");
    return safe.data;
  });
