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
export const MODEL = "google/gemini-2.5-pro"; // vision fallback / default cache key
export const PROMPT_VERSION = "v2";
export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB

/**
 * Stage-specific timeouts (Phase 2B). Fetch and parse are bounded separately
 * from the model call so a slow download can't chew through the model budget.
 */
export const STAGE_TIMEOUTS = {
  fetchMs: 15_000,
  parseMs: 20_000,
  modelCallMs: 60_000,
};
export const REQUEST_TIMEOUT_MS = STAGE_TIMEOUTS.modelCallMs;

/** Classified error thrown by the extractor. Worker maps these to retry policy. */
export type TdsErrorClass =
  | "transient"
  | "permanent"
  | "plausibility"
  | "missing_pdf"
  | "rate_limited"
  | "paused"; // admission denied — worker pauses batch, does not fail item

/** Stable, machine-readable error codes surfaced in item.error_code and logs. */
export const ERROR_CODES = {
  // Permanent (single attempt)
  MISSING_SPEC: "missing_spec",
  MISSING_TDS: "missing_tds",
  INVALID_PDF: "invalid_pdf",
  ENCRYPTED_PDF: "encrypted_pdf",
  OVERSIZED_PDF: "oversized_pdf",
  UNSUPPORTED_DOCUMENT: "unsupported_document",
  MALFORMED_STRUCTURED_OUTPUT: "malformed_structured_output",
  PLAUSIBILITY_REJECTED: "plausibility_rejected",
  // Retryable
  RATE_LIMITED: "rate_limited",
  PROVIDER_5XX: "provider_5xx",
  NETWORK_ERROR: "network_error",
  MODEL_TIMEOUT: "model_timeout",
  TEMPORARY_STORAGE: "temporary_storage",
  TEMPORARY_DATABASE: "temporary_database",
  // Batch-pause (never a per-item failure)
  CREDITS_EXHAUSTED: "credits_exhausted",
  AI_CONFIG_ERROR: "ai_config_error",
  DAILY_CALL_CAP: "daily_call_cap",
  DAILY_COST_CAP: "daily_cost_cap",
} as const;
export type TdsErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const PAUSE_CODES: ReadonlySet<string> = new Set<string>([
  ERROR_CODES.CREDITS_EXHAUSTED,
  ERROR_CODES.AI_CONFIG_ERROR,
  ERROR_CODES.DAILY_CALL_CAP,
  ERROR_CODES.DAILY_COST_CAP,
]);
export function isPauseCode(code: string | null | undefined): boolean {
  return !!code && PAUSE_CODES.has(code);
}

export class TdsExtractError extends Error {
  errorClass: TdsErrorClass;
  errorCode: TdsErrorCode;
  retryAfterSec?: number;
  constructor(
    message: string,
    errorClass: TdsErrorClass,
    errorCode: TdsErrorCode,
    retryAfterSec?: number,
  ) {
    super(message);
    this.name = "TdsExtractError";
    this.errorClass = errorClass;
    this.errorCode = errorCode;
    this.retryAfterSec = retryAfterSec;
  }
}

export function maxAttemptsFor(cls: TdsErrorClass): number {
  switch (cls) {
    case "permanent":
    case "plausibility":
    case "missing_pdf":
      return 1;
    case "rate_limited":
      return 6;
    case "paused":
      return 99; // re-queued unchanged, does not consume attempts
    case "transient":
    default:
      return 5;
  }
}

export function backoffSecondsFor(cls: TdsErrorClass, attempt: number, retryAfterSec?: number): number {
  if (cls === "rate_limited" && retryAfterSec && retryAfterSec > 0) {
    return Math.min(retryAfterSec, 600);
  }
  const base = Math.min(30 * Math.pow(2, Math.max(0, attempt - 1)), 480);
  const jitter = Math.floor(Math.random() * 15);
  return base + jitter;
}

/**
 * Map a raw gateway HTTP status to a classified TdsExtractError. Keeps the
 * decision testable and away from the worker tick handler.
 */
export function classifyGatewayStatus(
  status: number,
  bodyText: string,
  retryAfterHeader: string | null,
): TdsExtractError {
  const ra = Number(retryAfterHeader ?? "");
  const retryAfter = Number.isFinite(ra) && ra > 0 ? ra : undefined;
  if (status === 429) {
    return new TdsExtractError("AI rate limit reached.", "rate_limited", ERROR_CODES.RATE_LIMITED, retryAfter);
  }
  if (status === 402) {
    return new TdsExtractError("AI credits exhausted.", "paused", ERROR_CODES.CREDITS_EXHAUSTED);
  }
  if (status === 401 || status === 403) {
    return new TdsExtractError("AI gateway auth/config error.", "paused", ERROR_CODES.AI_CONFIG_ERROR);
  }
  if (status >= 500) {
    return new TdsExtractError(`AI gateway 5xx (${status}).`, "transient", ERROR_CODES.PROVIDER_5XX, retryAfter);
  }
  return new TdsExtractError(
    `AI gateway rejected request (${status}): ${bodyText.slice(0, 200)}`,
    "permanent",
    ERROR_CODES.UNSUPPORTED_DOCUMENT,
  );
}

/** Cooldown lengths per code when we open a provider-wide cooldown. */
export function providerCooldownSeconds(code: TdsErrorCode): number {
  switch (code) {
    case ERROR_CODES.RATE_LIMITED:
      return 60;
    case ERROR_CODES.PROVIDER_5XX:
      return 45;
    case ERROR_CODES.MODEL_TIMEOUT:
      return 30;
    default:
      return 0;
  }
}

// Rough Gemini 2.5 Pro pricing (per 1M tokens, USD). Used for rollup only.
const PRICE_IN_PER_MTOK = 1.25;
const PRICE_OUT_PER_MTOK = 5.0;

const ProvenanceItem = z.object({
  field: z.string(),
  page: z.number().nullable().optional(),
  quote: z.string().nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

// Grouped standards + identifiers. Every entry can carry evidence for audit.
const QualificationItemSchema = z.object({
  standard: z.string(),
  revision: z.string().nullable().optional(),
  class: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  evidence_quote: z.string().nullable().optional(),
  page: z.number().nullable().optional(),
});
const TestMethodItemSchema = z.object({
  method: z.string(),
  evidence_quote: z.string().nullable().optional(),
  page: z.number().nullable().optional(),
});
const ContextualStandardItemSchema = z.object({
  standard: z.string(),
  role: z.string(),
  evidence_quote: z.string().nullable().optional(),
  page: z.number().nullable().optional(),
});
const ProductIdentifierItemSchema = z.object({
  kind: z.string(), // 'nsn' | 'cage' | 'part_number' | 'other'
  value: z.string(),
  applicability: z.string().nullable().optional(),
  evidence_quote: z.string().nullable().optional(),
  page: z.number().nullable().optional(),
});
const TestResultRowSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]).nullable().optional(),
  units: z.string().nullable().optional(),
});
const TestResultTableSchema = z.object({
  name: z.string(),
  conditions: z.string().nullable().optional(),
  rows: z.array(TestResultRowSchema),
  evidence_quote: z.string().nullable().optional(),
  page: z.number().nullable().optional(),
});

export const RowSchema = z.object({
  productFamily: z.string().nullable().optional(),
  materialCategory: z.string().nullable().optional(),
  resinChemistry: z.string().nullable().optional(),
  reinforcement: z.string().nullable().optional(),
  productForm: z.string().nullable().optional(),
  applicationProcess: z.string().nullable().optional(),
  activeIngredientOrResin: z.string().nullable().optional(),
  shelfLifeMonths: z.number().nullable().optional(),
  storageTempMinC: z.number().nullable().optional(),
  storageTempMaxC: z.number().nullable().optional(),
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
  qualifications: z.array(QualificationItemSchema).optional(),
  testMethods: z.array(TestMethodItemSchema).optional(),
  contextualStandards: z.array(ContextualStandardItemSchema).optional(),
  productIdentifiers: z.array(ProductIdentifierItemSchema).optional(),
  testResults: z.array(TestResultTableSchema).optional(),
  provenance: z.array(ProvenanceItem).optional(),
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
        applicationProcess: { type: "string", description: "How the product is applied/processed. Verbatim summary (e.g. 'apply a minimum coating, dry for 10 minutes, and apply tape within 2 hours'). Do NOT confuse drying/flash-off time with cure time." },
        activeIngredientOrResin: { type: "string", description: "The primary resin/chemistry family (e.g. 'polyamide', 'epoxy'). Only if explicitly stated." },
        shelfLifeMonths: { type: ["number", "null"], description: "Shelf life in months. NOT the same as freezer life or out-life." },
        storageTempMinC: { type: ["number", "null"], description: "Minimum recommended storage temperature in °C." },
        storageTempMaxC: { type: ["number", "null"], description: "Maximum recommended storage temperature in °C." },
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
        qualificationsStandards: { type: "string", description: "Legacy comma-joined list of qualifications (for back-compat). Prefer populating the structured 'qualifications' array." },
        minimumOrderQuantity: { type: "string" },
        profiles: { type: "array", items: { type: "string" } },
        keySpecs: { type: "array", items: { type: "string" } },
        customers: { type: "array", items: { type: "string" } },
        qualifications: {
          type: "array",
          description: "ONLY standards the product ITSELF is stated to conform to / be qualified under / approved to (e.g. 'conforms to MIL-PRF-XYZ', 'qualified to AIMS 05-04-000'). Do NOT include test methods or standards that only describe the test setup.",
          items: {
            type: "object",
            properties: {
              standard: { type: "string" },
              revision: { type: ["string", "null"] },
              class: { type: ["string", "null"] },
              type: { type: ["string", "null"] },
              evidence_quote: { type: ["string", "null"] },
              page: { type: ["number", "null"] },
            },
            required: ["standard"],
          },
        },
        testMethods: {
          type: "array",
          description: "Standards used ONLY as test methods (e.g. 'ASTM D1000', 'ASTM D3359'). If the PDF says 'tested per ASTM Dxxx' or 'in accordance with ASTM Dxxx', it belongs here — NOT in qualifications.",
          items: {
            type: "object",
            properties: {
              method: { type: "string" },
              evidence_quote: { type: ["string", "null"] },
              page: { type: ["number", "null"] },
            },
            required: ["method"],
          },
        },
        contextualStandards: {
          type: "array",
          description: "Standards mentioned as CONTEXT for a test — e.g. the tested substrate coating, the tested tape, the tested primer. Example: 'adhesion tested over MIL-PRF-85285 Type IV coating' → contextual, role='tested_substrate_coating'. NOT a qualification of the product.",
          items: {
            type: "object",
            properties: {
              standard: { type: "string" },
              role: { type: "string", description: "e.g. 'tested_substrate_coating', 'tested_primer', 'tested_tape', 'reference'." },
              evidence_quote: { type: ["string", "null"] },
              page: { type: ["number", "null"] },
            },
            required: ["standard", "role"],
          },
        },
        productIdentifiers: {
          type: "array",
          description: "Product-level identifiers such as NSN, CAGE, part numbers. Include applicability when several identifiers map to different pack/size variants.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["nsn", "cage", "part_number", "upc", "other"] },
              value: { type: "string" },
              applicability: { type: ["string", "null"] },
              evidence_quote: { type: ["string", "null"] },
              page: { type: ["number", "null"] },
            },
            required: ["kind", "value"],
          },
        },
        testResults: {
          type: "array",
          description: "Multi-dimensional test tables preserved verbatim (do not force into scalar fields). One entry per table; rows[] captures each label/value/units triple.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              conditions: { type: ["string", "null"] },
              rows: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    value: { type: ["string", "number", "null"] },
                    units: { type: ["string", "null"] },
                  },
                  required: ["label"],
                },
              },
              evidence_quote: { type: ["string", "null"] },
              page: { type: ["number", "null"] },
            },
            required: ["name", "rows"],
          },
        },
        provenance: {
          type: "array",
          description:
            "For EVERY numeric or boolean field you return, include one entry here: the field name, the page number in the PDF, an exact verbatim quote from the PDF supporting the value, and a confidence rating.",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              page: { type: ["number", "null"] },
              quote: { type: ["string", "null"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["field"],
          },
        },
      },
      additionalProperties: false,
    },
  },
};

const SYSTEM = `You extract the aerospace material specs for ONE named product from its Technical Data Sheet PDF.

Units (STRICT — the schema stores these units):
- All temperatures in Celsius (°C). If the PDF gives °F, convert: C = (F - 32) * 5/9.
- Pressures: MPa. Lap shear stress: MPa. T-peel: N per 25mm. Climbing drum peel: in-lb/in.
- Out-life in days. Freezer life in months. TML/CVCM as percent (e.g. 0.8 not 0.008).
- NEVER return a numeric value when the unit on the PDF is unclear — return null.
- NEVER return 0 as a placeholder for "unknown". Use null.

Rules:
- Extract data ONLY for the specified vendor + product. Ignore other products the PDF may list.
- For TEXT fields: if the value is not clearly stated, OMIT the field (do not guess).
- Application dry time / flash-off time is NOT cure_time. A "dry for 10 minutes" step is application_process, NOT cure_time.
- Shelf life is NOT freezer life is NOT out life. Keep them distinct; use shelfLifeMonths for the overall shelf life.
- For BOOLEAN flags: return true only when the PDF clearly states/implies the property. Omit if unknown.
- keySpecs: universal/OEM specifications the product itself is qualified/approved to (BMS, AIMS, AMS, MIL-*, etc.), verbatim. Do NOT include test methods (ASTM D-xxxx) or specs of tested substrates.
- customers: every OEM/customer the PDF names as qualified/approved.
- profiles: section/category tags the product falls under in the PDF.

Standards classification (STRICT):
- qualifications[]: ONLY when the PDF says the product itself conforms to / is qualified to / is approved under the standard.
- testMethods[]: standards that only describe HOW a test was run (e.g. "tested per ASTM D1000"). ASTM Dxxx numbers almost always belong here, not in qualifications.
- contextualStandards[]: standards that describe the TEST CONTEXT — e.g. the substrate coating, primer, or tape the product was tested against. Example: "adhesion tested over MIL-PRF-85285 Type IV" → contextual with role "tested_substrate_coating".
- When in doubt, prefer testMethods or contextualStandards over qualifications.

Complex tables:
- If a property has multiple values across conditions (temperatures, substrates, cure schedules), emit the full table under testResults[] rather than picking one number for the scalar field. Only emit the scalar field when the PDF gives a single unambiguous value or a clearly labelled "typical" value.

Provenance (REQUIRED):
- For every NUMERIC or BOOLEAN value you emit, add a matching entry in "provenance" with the field name, the source page number, an exact verbatim quote from the PDF that supports the value, and a confidence rating.
- If you cannot cite a specific quote for a numeric value, DO NOT emit it — return null and skip the provenance entry.`;

const FIELD_MAP: Array<[keyof ExtractedRow, string, "text" | "num" | "bool"]> = [
  ["productFamily", "product_family", "text"],
  ["materialCategory", "material_category", "text"],
  ["resinChemistry", "resin_chemistry", "text"],
  ["reinforcement", "reinforcement", "text"],
  ["productForm", "product_form", "text"],
  ["applicationProcess", "application_process", "text"],
  ["activeIngredientOrResin", "active_ingredient_or_resin", "text"],
  ["shelfLifeMonths", "shelf_life_months", "num"],
  ["storageTempMinC", "storage_temp_min_c", "num"],
  ["storageTempMaxC", "storage_temp_max_c", "num"],
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

/**
 * Columns where a stored `0` almost always means "we lost the value" (legacy
 * import default), not an actual measurement. `isExistingEmpty` treats these
 * zeros as empty so extraction can overwrite them. Do NOT list scalar
 * mechanical / mass-loss properties here — a real 0 is a plausible reading.
 */
const ZERO_IS_MISSING: ReadonlySet<string> = new Set([
  "cure_temperature_c",
  "out_life_days",
  "freezer_life_months",
  "shelf_life_months",
  "storage_temp_min_c",
  "storage_temp_max_c",
  "dry_tg_onset_c",
  "wet_tg_c",
  "peak_tg_c",
  "max_service_temperature_c",
]);

// Plausibility gates per DB column. Values outside these ranges are dropped.
const RANGES: Record<string, [number, number]> = {
  cure_temperature_c: [20, 400],
  dry_tg_onset_c: [20, 400],
  wet_tg_c: [20, 400],
  peak_tg_c: [20, 400],
  max_service_temperature_c: [20, 500],
  out_life_days: [0, 365],
  freezer_life_months: [0, 60],
  shelf_life_months: [0, 120],
  storage_temp_min_c: [-80, 60],
  storage_temp_max_c: [-40, 80],
  tml_pct: [0, 10],
  cvcm_pct: [0, 5],
  tensile_lap_shear_mpa: [0, 200],
  t_peel_n_per_25mm: [0, 1000],
  flatwise_tension_mpa: [0, 100],
  climbing_drum_peel_in_lb_per_in: [0, 200],
};

// Canonical display unit per numeric field (used for provenance row).
const UNIT_FOR: Record<string, string> = {
  cure_temperature_c: "°C",
  dry_tg_onset_c: "°C",
  wet_tg_c: "°C",
  peak_tg_c: "°C",
  max_service_temperature_c: "°C",
  out_life_days: "days",
  freezer_life_months: "months",
  shelf_life_months: "months",
  storage_temp_min_c: "°C",
  storage_temp_max_c: "°C",
  tml_pct: "%",
  cvcm_pct: "%",
  tensile_lap_shear_mpa: "MPa",
  t_peel_n_per_25mm: "N/25mm",
  flatwise_tension_mpa: "MPa",
  climbing_drum_peel_in_lb_per_in: "in-lb/in",
};

function isMissing(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "" || t === "none given" || t === "n/a";
  }
  return false;
}

/**
 * Whether a stored value should be treated as "empty" and therefore safe to
 * fill via extraction. `dbCol` opt-in: legacy `0` is treated as missing only
 * for columns listed in ZERO_IS_MISSING (temperature/time sentinels). For
 * mechanical properties, mass loss %, etc., a real 0 is preserved.
 */
function isExistingEmpty(v: unknown, dbCol?: string): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (typeof v === "number" && v === 0 && dbCol && ZERO_IS_MISSING.has(dbCol)) return true;
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
  if (dl.error || !dl.data) {
    const msg = dl.error?.message ?? "unknown";
    const transient =
      /timeout|temporar|rate|5\d\d|network/i.test(msg);
    throw new TdsExtractError(
      `Failed to download TDS: ${msg}`,
      transient ? "transient" : "missing_pdf",
      transient ? ERROR_CODES.TEMPORARY_STORAGE : ERROR_CODES.MISSING_TDS,
    );
  }
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) {
    throw new TdsExtractError(
      `TDS PDF is too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB, max 20MB).`,
      "permanent",
      ERROR_CODES.OVERSIZED_PDF,
    );
  }
  // Cheap PDF sanity check: %PDF- header and no encryption dictionary hint.
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  if (!head.startsWith("%PDF-")) {
    throw new TdsExtractError("File is not a valid PDF.", "permanent", ERROR_CODES.INVALID_PDF);
  }
  // Weak but useful heuristic — /Encrypt keyword in first 4KB.
  const sniff = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  if (/\/Encrypt\s/.test(sniff)) {
    throw new TdsExtractError(
      "PDF is encrypted — cannot extract.",
      "permanent",
      ERROR_CODES.ENCRYPTED_PDF,
    );
  }
  return bytes;
}

/**
 * Best-effort object ETag lookup via the storage list API. Returns null if
 * unavailable so callers fall back to a full download + hash.
 */
export async function fetchObjectEtag(pdfPath: string): Promise<string | null> {
  try {
    const idx = pdfPath.lastIndexOf("/");
    const dir = idx >= 0 ? pdfPath.slice(0, idx) : "";
    const name = idx >= 0 ? pdfPath.slice(idx + 1) : pdfPath;
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(dir, { limit: 1, search: name });
    if (error || !data || data.length === 0) return null;
    const meta = data[0].metadata as Record<string, unknown> | null | undefined;
    const raw = (meta?.eTag ?? meta?.etag) as string | undefined;
    if (!raw) return null;
    return raw.replace(/^"+|"+$/g, "");
  } catch (err) {
    console.warn("[tdsExtract] etag lookup failed", err);
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export type UsageStats = {
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
};

/**
 * Single HTTP round-trip to the gateway. Returns the raw string tool
 * arguments so the caller can decide whether to accept, or repair once
 * with a hint on malformed output.
 */
async function requestModelOnce(params: {
  apiKey: string;
  vendor: string;
  productName: string;
  fileName: string;
  fileBase64: string;
  extraUserHint?: string;
}): Promise<{ args: string | undefined; usage: UsageStats }> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Lovable-API-Key": params.apiKey,
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
                text:
                  `Extract the technical specs for vendor "${params.vendor}" product "${params.productName}" from this TDS PDF. Every numeric or boolean value MUST have a matching provenance entry with an exact verbatim quote from the PDF.` +
                  (params.extraUserHint ? `\n\n${params.extraUserHint}` : ""),
              },
              {
                type: "file",
                file: {
                  filename: params.fileName,
                  file_data: `data:application/pdf;base64,${params.fileBase64}`,
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
      throw new TdsExtractError(
        `AI request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`,
        "transient",
        ERROR_CODES.MODEL_TIMEOUT,
      );
    }
    throw new TdsExtractError(
      err instanceof Error ? err.message : String(err),
      "transient",
      ERROR_CODES.NETWORK_ERROR,
    );
  } finally {
    clearTimeout(to);
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    // Never log request body / signed URLs / api key — status + short body only.
    console.error("[tdsExtract] gateway not ok", { status: resp.status, bodyPreview: t.slice(0, 200) });
    throw classifyGatewayStatus(resp.status, t, resp.headers.get("retry-after"));
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const inTok = json.usage?.prompt_tokens ?? null;
  const outTok = json.usage?.completion_tokens ?? null;
  const cost =
    inTok != null && outTok != null
      ? (inTok / 1_000_000) * PRICE_IN_PER_MTOK + (outTok / 1_000_000) * PRICE_OUT_PER_MTOK
      : null;
  return { args, usage: { inputTokens: inTok, outputTokens: outTok, costUsd: cost } };
}

export async function callGeminiForSpec(params: {
  vendor: string;
  productName: string;
  pdfPath: string;
  bytes: Uint8Array;
}): Promise<{ row: ExtractedRow; usage: UsageStats }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new TdsExtractError(
      "LOVABLE_API_KEY is not configured.",
      "paused",
      ERROR_CODES.AI_CONFIG_ERROR,
    );
  }

  const fileBase64 = bytesToBase64(params.bytes);
  const fileName = params.pdfPath.split("/").pop() || "tds.pdf";

  // First attempt
  let { args, usage } = await requestModelOnce({
    apiKey,
    vendor: params.vendor,
    productName: params.productName,
    fileName,
    fileBase64,
  });

  // Parse; if malformed, allow ONE controlled repair pass with a hint.
  const tryParse = (raw: string | undefined) => {
    if (!raw) return { ok: false as const, reason: "no_output" as const };
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(raw);
    } catch {
      return { ok: false as const, reason: "invalid_json" as const };
    }
    const parsed = RowSchema.safeParse(parsedRaw);
    if (!parsed.success) return { ok: false as const, reason: "schema_mismatch" as const };
    return { ok: true as const, row: parsed.data };
  };

  let parsed = tryParse(args);
  if (!parsed.ok) {
    console.warn("[tdsExtract] malformed structured output, attempting one repair", {
      reason: parsed.reason,
    });
    const repair = await requestModelOnce({
      apiKey,
      vendor: params.vendor,
      productName: params.productName,
      fileName,
      fileBase64,
      extraUserHint:
        "Your previous response could not be parsed. Emit ONLY the emit_spec tool call with valid arguments strictly matching the schema. Do not include prose. Every numeric/boolean value MUST have a provenance entry.",
    });
    // Accumulate token usage across attempts.
    usage = {
      inputTokens: (usage.inputTokens ?? 0) + (repair.usage.inputTokens ?? 0),
      outputTokens: (usage.outputTokens ?? 0) + (repair.usage.outputTokens ?? 0),
      costUsd: (usage.costUsd ?? 0) + (repair.usage.costUsd ?? 0),
    };
    parsed = tryParse(repair.args);
    if (!parsed.ok) {
      throw new TdsExtractError(
        `AI structured output could not be parsed after repair (${parsed.reason}).`,
        "permanent",
        ERROR_CODES.MALFORMED_STRUCTURED_OUTPUT,
      );
    }
  }

  return { row: parsed.row, usage };
}

function provenanceFor(row: ExtractedRow, aiKey: string) {
  const list = row.provenance ?? [];
  return list.find((p) => p.field === aiKey);
}

/**
 * Safe merge with Phase 3 gates:
 * - Numeric values must have provenance with a non-empty quote.
 * - Numeric values must fall inside per-field plausibility range.
 * - Numeric values with confidence "low" are dropped unless the target column is empty (they already require empty column, but the low-confidence check is a hard reject when no quote).
 * - Never overwrites a curated non-empty value.
 */
export function buildSafePatch(
  row: ExtractedRow,
  spec: Record<string, unknown>,
): { patch: Record<string, unknown>; updated: string[]; provenanceRows: ProvenanceRow[] } {
  const patch: Record<string, unknown> = {};
  const updated: string[] = [];
  const provenanceRows: ProvenanceRow[] = [];

  for (const [aiKey, dbCol, kind] of FIELD_MAP) {
    const v = row[aiKey];
    const existing = spec[dbCol];
    const prov = provenanceFor(row, aiKey);

    if (kind === "text") {
      if (isMissing(v)) continue;
      if (!isExistingEmpty(existing, dbCol)) continue;
      patch[dbCol] = String(v);
      updated.push(dbCol);
      if (prov?.quote) {
        provenanceRows.push({
          field: dbCol,
          valueText: String(v),
          sourcePage: prov.page ?? null,
          sourceQuote: prov.quote,
          confidence: prov.confidence ?? "medium",
        });
      }
    } else if (kind === "num") {
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (!isExistingEmpty(existing, dbCol)) continue;
      // Provenance quote required for numeric values.
      if (!prov?.quote || !prov.quote.trim()) {
        console.warn(`[tdsExtract] dropping ${dbCol}=${v} — no provenance quote`);
        continue;
      }
      const range = RANGES[dbCol];
      if (range && (v < range[0] || v > range[1])) {
        console.warn(`[tdsExtract] dropping ${dbCol}=${v} — out of range ${range.join("..")}`);
        continue;
      }
      patch[dbCol] = v;
      updated.push(dbCol);
      provenanceRows.push({
        field: dbCol,
        valueNum: v,
        unit: UNIT_FOR[dbCol],
        sourcePage: prov.page ?? null,
        sourceQuote: prov.quote,
        confidence: prov.confidence ?? "medium",
      });
    } else {
      if (v !== true) continue;
      if (existing === true) continue;
      patch[dbCol] = true;
      updated.push(dbCol);
      if (prov?.quote) {
        provenanceRows.push({
          field: dbCol,
          valueBool: true,
          sourcePage: prov.page ?? null,
          sourceQuote: prov.quote,
          confidence: prov.confidence ?? "medium",
        });
      }
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

  // Grouped standards / identifiers / test-results: only write when the
  // target column is empty — never overwrite curated structured data.
  const groupWrites: Array<[string, unknown]> = [
    ["qualifications", row.qualifications],
    ["test_methods", row.testMethods],
    ["contextual_standards", row.contextualStandards],
    ["product_identifiers", row.productIdentifiers],
    ["test_results", row.testResults],
  ];
  for (const [col, val] of groupWrites) {
    if (!Array.isArray(val) || val.length === 0) continue;
    const existing = spec[col];
    const existingArr = Array.isArray(existing) ? existing : null;
    if (existingArr && existingArr.length > 0) continue; // curated / already present
    patch[col] = val as never;
    updated.push(col);
  }

  // Back-compat: if qualifications[] came through but qualifications_standards
  // (legacy text) is empty, populate the joined string so old UI still renders.
  if (
    Array.isArray(row.qualifications) &&
    row.qualifications.length > 0 &&
    isExistingEmpty(spec.qualifications_standards)
  ) {
    const joined = dedupe(row.qualifications.map((q) => q.standard)).join(", ");
    if (joined) {
      patch.qualifications_standards = joined;
      if (!updated.includes("qualifications_standards")) updated.push("qualifications_standards");
    }
  }

  return { patch, updated, provenanceRows };
}

type ProvenanceRow = {
  field: string;
  valueText?: string;
  valueNum?: number;
  valueBool?: boolean;
  unit?: string;
  sourcePage: number | null;
  sourceQuote: string | null;
  confidence: "high" | "medium" | "low";
};

async function writeProvenance(specId: string, rows: ProvenanceRow[]) {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const payload = rows.map((r) => ({
    spec_id: specId,
    field: r.field,
    value_text: r.valueText ?? null,
    value_num: r.valueNum ?? null,
    value_bool: r.valueBool ?? null,
    unit: r.unit ?? null,
    source_page: r.sourcePage,
    source_quote: r.sourceQuote,
    confidence: r.confidence,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
    extracted_at: now,
  }));
  const { error } = await supabaseAdmin
    .from("tds_field_provenance")
    .upsert(payload, { onConflict: "spec_id,field" });
  if (error) console.error("[tdsExtract] provenance write failed", error);
}

/**
 * Log one extraction attempt. Best-effort — never throws; the caller has
 * already succeeded or failed on its own.
 */
type ExtractionRunLog = {
  specId: string | null;
  documentHash: string | null;
  route: "text_layer_fast" | "vision_pro" | "cache_hit_hash" | "cache_hit_etag" | "reservation_wait";
  model: string;
  promptVersion: string;
  pages: number | null;
  inputBytes: number | null;
  usage: UsageStats;
  latencyMs: number;
  cacheStatus: "miss" | "hit_hash" | "hit_etag" | "reservation_wait";
  outcome: "success" | "failure";
  errorCode?: string | null;
  errorClass?: string | null;
  cancelled?: boolean;
};
async function writeExtractionRun(log: ExtractionRunLog): Promise<void> {
  try {
    await supabaseAdmin.from("tds_extraction_runs").insert({
      spec_id: log.specId,
      document_hash: log.documentHash,
      route: log.route,
      model: log.model,
      prompt_version: log.promptVersion,
      pages: log.pages,
      input_bytes: log.inputBytes,
      input_tokens: log.usage.inputTokens,
      output_tokens: log.usage.outputTokens,
      cost_usd: log.usage.costUsd,
      latency_ms: log.latencyMs,
      cache_status: log.cacheStatus,
      cancelled: log.cancelled ?? false,
      outcome: log.outcome,
      error_code: log.errorCode ?? null,
      error_class: log.errorClass ?? null,
    } as never);
  } catch (err) {
    console.warn("[tdsExtract] writeExtractionRun failed", err);
  }
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
  usage: UsageStats;
}> {
  const t0 = Date.now();

  const { data: spec, error: specErr } = await supabaseAdmin
    .from("master_specs")
    .select("*")
    .eq("id", specId)
    .maybeSingle();
  if (specErr) throw new TdsExtractError(specErr.message, "transient", ERROR_CODES.TEMPORARY_DATABASE);
  if (!spec) throw new TdsExtractError("Spec not found.", "permanent", ERROR_CODES.MISSING_SPEC);
  if (!spec.tds_pdf_path) throw new TdsExtractError("This spec has no attached TDS PDF.", "missing_pdf", ERROR_CODES.MISSING_TDS);

  let extracted: ExtractedRow | null = null;
  let cacheHit = false;
  let usage: UsageStats = { inputTokens: null, outputTokens: null, costUsd: null };
  let documentHash: string | null = null;
  let bytes: Uint8Array | null = null;

  // B3: try ETag short-circuit before downloading bytes.
  const etag = await fetchObjectEtag(spec.tds_pdf_path);
  if (etag) {
    const { data: cachedByEtag } = await supabaseAdmin
      .from("tds_extraction_cache")
      .select("document_hash, extracted")
      .eq("object_etag", etag)
      .maybeSingle();
    if (cachedByEtag?.extracted && cachedByEtag.document_hash) {
      const p = RowSchema.safeParse(cachedByEtag.extracted);
      if (p.success) {
        extracted = p.data;
        documentHash = cachedByEtag.document_hash;
        cacheHit = true;
      }
    }
  }

  if (!extracted) {
    bytes = await downloadTdsPdf(spec.tds_pdf_path);
    documentHash = computeDocumentHash(bytes);

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
        // Backfill etag mapping so next run skips download.
        if (etag) {
          await supabaseAdmin
            .from("tds_extraction_cache")
            .update({ object_etag: etag })
            .eq("document_hash", documentHash);
        }
      }
    }
  }

  if (!extracted) {
    // Single-flight reservation: only one worker actually calls the model
    // for (documentHash, MODEL, PROMPT_VERSION); others poll the cache.
    const holder = `${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
    const RES_TTL_SEC = Math.max(REQUEST_TIMEOUT_MS / 1000 + 60, 180);
    let ownReservation = false;
    try {
      const { data: won } = await supabaseAdmin.rpc("try_reserve_extraction", {
        _document_hash: documentHash!,
        _model: MODEL,
        _prompt_version: PROMPT_VERSION,
        _holder: holder,
        _ttl_seconds: RES_TTL_SEC,
      });
      ownReservation = won === true;
    } catch (e) {
      console.warn("[tdsExtract] reservation rpc failed, proceeding without single-flight", e);
      ownReservation = true;
    }

    if (!ownReservation) {
      // Another worker is extracting the same document — wait briefly on
      // the cache. This is the "10 concurrent duplicates → 1 model call" path.
      const deadline = Date.now() + RES_TTL_SEC * 1000;
      while (Date.now() < deadline && !extracted) {
        await new Promise((r) => setTimeout(r, 1500));
        const { data: c } = await supabaseAdmin
          .from("tds_extraction_cache")
          .select("extracted")
          .eq("document_hash", documentHash!)
          .maybeSingle();
        if (c?.extracted) {
          const p = RowSchema.safeParse(c.extracted);
          if (p.success) {
            extracted = p.data;
            cacheHit = true;
            break;
          }
        }
      }
      if (!extracted) {
        // The other holder crashed or timed out — take over next tick.
        throw new TdsExtractError(
          "Duplicate extraction in flight; will retry.",
          "transient",
          ERROR_CODES.TEMPORARY_DATABASE,
        );
      }
    } else {
      // Preflight decides the route. Text-layer native PDFs → cheap fast
      // model; scanned / oversize / low-text → vision Pro. Fast route can
      // return null (unviable) to fall back without penalty.
      const { preflightPdf } = await import("@/lib/tdsPreflight.server");
      const preflight = preflightPdf(bytes!);
      const chosenRoute: "text_layer_fast" | "vision_pro" =
        preflight.suggestedRoute === "text_layer_fast" ? "text_layer_fast" : "vision_pro";

      let routeUsed: "text_layer_fast" | "vision_pro" = chosenRoute;
      const routeStart = Date.now();
      try {
        if (chosenRoute === "text_layer_fast") {
          const { callFastTextRoute, FAST_MODEL } = await import("@/lib/tdsFastRoute.server");
          try {
            const fast = await callFastTextRoute({
              vendor: spec.vendor ?? "",
              productName: spec.product_name ?? "",
              bytes: bytes!,
            });
            if (fast) {
              extracted = fast.row;
              usage = fast.usage;
              await writeExtractionRun({
                specId: spec.id,
                documentHash,
                route: "text_layer_fast",
                model: FAST_MODEL,
                promptVersion: PROMPT_VERSION,
                pages: preflight.pages,
                inputBytes: bytes!.length,
                usage: fast.usage,
                latencyMs: Date.now() - routeStart,
                cacheStatus: "miss",
                outcome: "success",
              });
            } else {
              // Unviable — fall through to vision.
              routeUsed = "vision_pro";
              await writeExtractionRun({
                specId: spec.id,
                documentHash,
                route: "text_layer_fast",
                model: FAST_MODEL,
                promptVersion: PROMPT_VERSION,
                pages: preflight.pages,
                inputBytes: bytes!.length,
                usage: { inputTokens: null, outputTokens: null, costUsd: null },
                latencyMs: Date.now() - routeStart,
                cacheStatus: "miss",
                outcome: "failure",
                errorCode: "fast_route_unviable",
                errorClass: "transient",
              });
            }
          } catch (fastErr) {
            // Only fall back to vision for structural failures; pause / rate
            // limits must still surface (bubble).
            const isRecoverable =
              fastErr instanceof TdsExtractError &&
              (fastErr.errorClass === "transient" || fastErr.errorClass === "permanent");
            await writeExtractionRun({
              specId: spec.id,
              documentHash,
              route: "text_layer_fast",
              model: FAST_MODEL,
              promptVersion: PROMPT_VERSION,
              pages: preflight.pages,
              inputBytes: bytes!.length,
              usage: { inputTokens: null, outputTokens: null, costUsd: null },
              latencyMs: Date.now() - routeStart,
              cacheStatus: "miss",
              outcome: "failure",
              errorCode: fastErr instanceof TdsExtractError ? fastErr.errorCode : "unknown",
              errorClass: fastErr instanceof TdsExtractError ? fastErr.errorClass : "transient",
            });
            if (!isRecoverable) throw fastErr;
            routeUsed = "vision_pro";
          }
        }

        if (!extracted) {
          const visionStart = Date.now();
          try {
            const res = await callGeminiForSpec({
              vendor: spec.vendor ?? "",
              productName: spec.product_name ?? "",
              pdfPath: spec.tds_pdf_path,
              bytes: bytes!,
            });
            extracted = res.row;
            usage = res.usage;
            await writeExtractionRun({
              specId: spec.id,
              documentHash,
              route: "vision_pro",
              model: MODEL,
              promptVersion: PROMPT_VERSION,
              pages: preflight.pages,
              inputBytes: bytes!.length,
              usage: res.usage,
              latencyMs: Date.now() - visionStart,
              cacheStatus: "miss",
              outcome: "success",
            });
          } catch (visionErr) {
            await writeExtractionRun({
              specId: spec.id,
              documentHash,
              route: "vision_pro",
              model: MODEL,
              promptVersion: PROMPT_VERSION,
              pages: preflight.pages,
              inputBytes: bytes!.length,
              usage: { inputTokens: null, outputTokens: null, costUsd: null },
              latencyMs: Date.now() - visionStart,
              cacheStatus: "miss",
              outcome: "failure",
              errorCode: visionErr instanceof TdsExtractError ? visionErr.errorCode : "unknown",
              errorClass: visionErr instanceof TdsExtractError ? visionErr.errorClass : "transient",
            });
            throw visionErr;
          }
        }

        // Persist the validated extraction BEFORE merging — retry-safe.
        await supabaseAdmin.from("tds_extraction_cache").upsert({
          document_hash: documentHash!,
          model: MODEL,
          prompt_version: PROMPT_VERSION,
          extracted: extracted as never,
          object_etag: etag,
        });
        await supabaseAdmin.rpc("record_ai_usage", {
          _model: routeUsed === "text_layer_fast" ? "google/gemini-3.5-flash" : MODEL,
          _input_tokens: usage.inputTokens ?? 0,
          _output_tokens: usage.outputTokens ?? 0,
          _cost_usd: usage.costUsd ?? 0,
          _failed: false,
        });
      } catch (err) {
        await supabaseAdmin.rpc("record_ai_usage", {
          _model: MODEL,
          _input_tokens: 0,
          _output_tokens: 0,
          _cost_usd: 0,
          _failed: true,
        });
        throw err;
      } finally {
        try {
          await supabaseAdmin.rpc("release_extraction_reservation", {
            _document_hash: documentHash!,
            _model: MODEL,
            _prompt_version: PROMPT_VERSION,
            _holder: holder,
          });
        } catch { /* noop */ }
      }
    }
  }



  const { patch, updated, provenanceRows } = buildSafePatch(extracted, spec as Record<string, unknown>);

  if (updated.length > 0) {
    patch.tds_analyzed_at = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin
      .from("master_specs")
      .update(patch as never)
      .eq("id", spec.id);
    if (upErr) throw new TdsExtractError(upErr.message, "transient", ERROR_CODES.TEMPORARY_DATABASE);
  } else {
    await supabaseAdmin
      .from("master_specs")
      .update({ tds_analyzed_at: new Date().toISOString() } as never)
      .eq("id", spec.id);
  }

  await writeProvenance(spec.id, provenanceRows);

  return {
    updatedCount: updated.length,
    fields: updated,
    cacheHit,
    documentHash: documentHash!,
    latencyMs: Date.now() - t0,
    usage,
  };
}
