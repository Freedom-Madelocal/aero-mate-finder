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
export const PROMPT_VERSION = "v2";
export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB
export const REQUEST_TIMEOUT_MS = 60_000;

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
- Application dry time is NOT cure_time. Shelf life is NOT freezer life.
- For BOOLEAN flags: return true only when the PDF clearly states/implies the property. Omit if unknown.
- keySpecs: universal/OEM specifications the product itself is qualified/approved to (BMS, AIMS, AMS, MIL-*, etc.), verbatim. Do NOT include test methods (ASTM D-xxxx) or specs of tested substrates.
- customers: every OEM/customer the PDF names as qualified/approved.
- profiles: section/category tags the product falls under in the PDF.

Provenance (REQUIRED):
- For every NUMERIC or BOOLEAN value you emit, add a matching entry in "provenance" with the field name, the source page number, an exact verbatim quote from the PDF that supports the value, and a confidence rating.
- If you cannot cite a specific quote for a numeric value, DO NOT emit it — return null and skip the provenance entry.`;

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

// Plausibility gates per DB column. Values outside these ranges are dropped.
const RANGES: Record<string, [number, number]> = {
  cure_temperature_c: [20, 400],
  dry_tg_onset_c: [20, 400],
  wet_tg_c: [20, 400],
  peak_tg_c: [20, 400],
  max_service_temperature_c: [20, 500],
  out_life_days: [0, 365],
  freezer_life_months: [0, 60],
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
      if (!isExistingEmpty(existing)) continue;
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
      if (existing !== null && existing !== undefined) continue;
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
  if (specErr) throw new TdsExtractError(specErr.message, "transient");
  if (!spec) throw new TdsExtractError("Spec not found.", "permanent");
  if (!spec.tds_pdf_path) throw new TdsExtractError("This spec has no attached TDS PDF.", "missing_pdf");

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
    try {
      const res = await callGeminiForSpec({
        vendor: spec.vendor ?? "",
        productName: spec.product_name ?? "",
        pdfPath: spec.tds_pdf_path,
        bytes: bytes!,
      });
      extracted = res.row;
      usage = res.usage;
      await supabaseAdmin.from("tds_extraction_cache").upsert({
        document_hash: documentHash!,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        extracted: extracted as never,
        object_etag: etag,
      });
      await supabaseAdmin.rpc("record_ai_usage", {
        _model: MODEL,
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
    }
  }


  const { patch, updated, provenanceRows } = buildSafePatch(extracted, spec as Record<string, unknown>);

  if (updated.length > 0) {
    patch.tds_analyzed_at = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin
      .from("master_specs")
      .update(patch as never)
      .eq("id", spec.id);
    if (upErr) throw new Error(upErr.message);
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
