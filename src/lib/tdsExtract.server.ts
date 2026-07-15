/**
 * Server-only TDS extraction + safe merge. Used by both the single-row
 * analyzeSpecTds server function and the background worker.
 *
 * Filename ends with .server.ts so the bundler blocks it from any client
 * chunk — safe to import supabaseAdmin at module scope.
 */
import { z } from "zod";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const BUCKET = "tds-pdfs";
export const MODEL = "google/gemini-2.5-pro";
export const PROMPT_VERSION = "v1";
export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB
export const REQUEST_TIMEOUT_MS = 60_000;

const RowSchema = z.object({
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

export type ExtractedRow = z.infer<typeof RowSchema>;

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
- For NUMERIC fields: convert units to metric (°F→°C, psi→MPa, lb/in→N/25mm as appropriate). Omit if not stated. Do not emit 0 for unknown properties.
- Application dry time is NOT cure_time. Shelf life is NOT freezer life.
- For BOOLEAN flags: return true only when the PDF clearly states/implies the property. Omit if unknown — never return false to overwrite an existing true.
- keySpecs: list only universal/OEM specifications the product itself is qualified/approved to (BMS, AIMS, AMS, MIL-*, etc.), verbatim. Do NOT include test methods (ASTM D-xxxx, etc.) or specs of tested substrates.
- customers: list every OEM/customer the PDF names as qualified/approved (Boeing, Airbus, Bell, Lockheed, Northrop, Sikorsky, NASA, etc.).
- profiles: section/category tags the product falls under in the PDF (e.g. Structural, Interiors, MRO, Repair, Tooling).`;

const FIELD_MAP: Array<[keyof ExtractedRow, string, "text" | "num" | "bool"]> = [
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

function isMissing(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "" || t === "none given" || t === "n/a";
  }
  return false;
}

function isExistingEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
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

export function computeDocumentHash(bytes: Uint8Array): string {
  const h = createHash("sha256");
  h.update(bytes);
  h.update(`|model=${MODEL}|prompt=${PROMPT_VERSION}`);
  return h.digest("hex");
}

export async function downloadTdsPdf(pdfPath: string): Promise<Uint8Array> {
  const dl = await supabaseAdmin.storage.from(BUCKET).download(pdfPath);
  if (dl.error || !dl.data) throw new Error(`Failed to download TDS: ${dl.error?.message ?? "unknown"}`);
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error(`TDS PDF is too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB, max 20MB).`);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function callGeminiForSpec(params: {
  vendor: string;
  productName: string;
  pdfPath: string;
  bytes: Uint8Array;
}): Promise<ExtractedRow> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");

  const fileBase64 = bytesToBase64(params.bytes);
  const fileName = params.pdfPath.split("/").pop() || "tds.pdf";

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Lovable-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract the technical specs for vendor "${params.vendor}" product "${params.productName}" from this TDS PDF.`,
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
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`AI request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(to);
  }

  if (resp.status === 429) throw new Error("AI rate limit reached. Please wait and try again.");
  if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Settings > Workspace > Usage.");
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error("[tdsExtract] gateway error", resp.status, t);
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
  return parsed.data;
}

/**
 * Safe merge: never overwrites a curated non-empty value. Booleans only
 * flip false→true. Arrays union (except key_specs which we no longer
 * auto-union to avoid contaminating with test methods — Phase 3).
 */
export function buildSafePatch(row: ExtractedRow, spec: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  const updated: string[] = [];

  for (const [aiKey, dbCol, kind] of FIELD_MAP) {
    const v = row[aiKey];
    const existing = spec[dbCol];
    if (kind === "text") {
      if (isMissing(v)) continue;
      if (!isExistingEmpty(existing)) continue;
      patch[dbCol] = String(v);
      updated.push(dbCol);
    } else if (kind === "num") {
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (existing !== null && existing !== undefined) continue;
      patch[dbCol] = v;
      updated.push(dbCol);
    } else {
      if (v !== true) continue;
      if (existing === true) continue;
      patch[dbCol] = true;
      updated.push(dbCol);
    }
  }

  const existingProfiles = Array.isArray(spec.profiles) ? (spec.profiles as string[]) : [];
  const mergedProfiles = dedupe([...existingProfiles, ...(row.profiles ?? [])]);
  if (mergedProfiles.length > existingProfiles.length) {
    patch.profiles = mergedProfiles;
    updated.push("profiles");
  }

  const existingCustomers = Array.isArray(spec.customers) ? (spec.customers as string[]) : [];
  const mergedCustomers = dedupe([...existingCustomers, ...(row.customers ?? [])]);
  if (mergedCustomers.length > existingCustomers.length) {
    patch.customers = mergedCustomers;
    updated.push("customers");
  }

  // key_specs: intentionally NOT auto-unioned (Phase 1g) — needs typed
  // qualification evidence before contaminating with test methods.

  return { patch, updated };
}

/**
 * Full pipeline: download PDF, check cache, call model if needed, apply
 * safe patch, stamp tds_analyzed_at when anything changed.
 */
export async function runExtractionForSpec(specId: string): Promise<{
  updatedCount: number;
  fields: string[];
  cacheHit: boolean;
  documentHash: string;
  latencyMs: number;
}> {
  const t0 = Date.now();

  const { data: spec, error: specErr } = await supabaseAdmin
    .from("master_specs")
    .select("*")
    .eq("id", specId)
    .maybeSingle();
  if (specErr) throw new Error(specErr.message);
  if (!spec) throw new Error("Spec not found.");
  if (!spec.tds_pdf_path) throw new Error("This spec has no attached TDS PDF.");

  const bytes = await downloadTdsPdf(spec.tds_pdf_path);
  const documentHash = computeDocumentHash(bytes);

  let extracted: ExtractedRow | null = null;
  let cacheHit = false;

  const { data: cached } = await supabaseAdmin
    .from("tds_extraction_cache")
    .select("extracted")
    .eq("document_hash", documentHash)
    .maybeSingle();
  if (cached?.extracted) {
    const p = RowSchema.safeParse(cached.extracted);
    if (p.success) {
      extracted = p.data;
      cacheHit = true;
    }
  }

  if (!extracted) {
    extracted = await callGeminiForSpec({
      vendor: spec.vendor ?? "",
      productName: spec.product_name ?? "",
      pdfPath: spec.tds_pdf_path,
      bytes,
    });
    await supabaseAdmin.from("tds_extraction_cache").upsert({
      document_hash: documentHash,
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      extracted: extracted as never,
    });
  }

  const { patch, updated } = buildSafePatch(extracted, spec as Record<string, unknown>);

  if (updated.length > 0) {
    patch.tds_analyzed_at = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin
      .from("master_specs")
      .update(patch as never)
      .eq("id", spec.id);
    if (upErr) throw new Error(upErr.message);
  } else {
    // Still stamp analyzed_at so the UI reflects the attempt.
    await supabaseAdmin
      .from("master_specs")
      .update({ tds_analyzed_at: new Date().toISOString() } as never)
      .eq("id", spec.id);
  }

  return {
    updatedCount: updated.length,
    fields: updated,
    cacheHit,
    documentHash,
    latencyMs: Date.now() - t0,
  };
}
