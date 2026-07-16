/**
 * Fast text-layer extraction route.
 *
 * For PDFs whose bytes contain an actual text layer (native TDS PDFs, not
 * scanned images), we can skip the vision path: extract per-page text with
 * unpdf, ship it as plain text to a smaller/cheaper Gemini flash model, and
 * still get structured tool-call output that satisfies the same RowSchema.
 *
 * On any structural failure (parse fail, empty text, model refusal), the
 * caller falls back to the vision route — never silently loses data.
 */
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import {
  ERROR_CODES,
  RowSchema as _RowSchema, // re-imported below via export from tdsExtract.server
  TdsExtractError,
  classifyGatewayStatus,
  type ExtractedRow,
  type UsageStats,
} from "@/lib/tdsExtract.server";

// Cheap, fast, text-optimised.
export const FAST_MODEL = "google/gemini-3.5-flash";
export const FAST_TEXT_CHAR_BUDGET = 90_000; // ~30 pages of dense TDS text
export const FAST_STAGE_TIMEOUTS = {
  extractTextMs: 20_000,
  modelCallMs: 45_000,
};

// Rough OpenRouter Gemini 3.5 Flash pricing (per 1M tokens, USD).
const PRICE_IN_PER_MTOK = 0.075;
const PRICE_OUT_PER_MTOK = 0.3;

export type PageChunk = { page: number; text: string };

async function withTimeout<T>(p: Promise<T>, ms: number, code: string): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => {
      reject(
        new TdsExtractError(
          `${code} exceeded ${ms}ms`,
          "transient",
          ERROR_CODES.MODEL_TIMEOUT,
        ),
      );
    }, ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}

/**
 * Per-page text extraction. Returns page-labelled chunks so the model can
 * cite exact page numbers in provenance. Non-text pages come back as "".
 */
export async function extractPdfPages(bytes: Uint8Array): Promise<PageChunk[]> {
  const pdf = await withTimeout(
    getDocumentProxy(new Uint8Array(bytes)),
    FAST_STAGE_TIMEOUTS.extractTextMs,
    "pdf.parse",
  );
  const result = await withTimeout(
    extractText(pdf, { mergePages: false }),
    FAST_STAGE_TIMEOUTS.extractTextMs,
    "pdf.extractText",
  );
  const pages = Array.isArray(result.text) ? result.text : [String(result.text ?? "")];
  return pages.map((t, i) => ({ page: i + 1, text: (t ?? "").trim() }));
}

/**
 * Concatenate page chunks with `--- Page N ---` markers up to the character
 * budget. Never truncates mid-page silently — logs a warning when it drops
 * whole pages so the caller can decide whether to fall back to vision.
 */
export function joinPagesForPrompt(
  chunks: PageChunk[],
  budget = FAST_TEXT_CHAR_BUDGET,
): { text: string; includedPages: number; totalPages: number; truncated: boolean } {
  let out = "";
  let included = 0;
  for (const c of chunks) {
    const header = `\n--- Page ${c.page} ---\n`;
    const block = header + c.text;
    if (out.length + block.length > budget && included > 0) {
      return {
        text: out,
        includedPages: included,
        totalPages: chunks.length,
        truncated: true,
      };
    }
    out += block;
    included += 1;
  }
  return { text: out, includedPages: included, totalPages: chunks.length, truncated: false };
}

// Re-declared locally to avoid a circular import; kept in sync with tdsExtract.server.ts.
// Do not import from tdsExtract.server via a helper — bundlers would double-load.
const RowSchemaLocal = _RowSchema as unknown as typeof _RowSchema;

const FAST_SYSTEM = `You extract aerospace material specs for ONE named product from its TDS PDF, which has been converted to plain text with "--- Page N ---" markers.

Emit the emit_spec tool call, obeying its schema exactly. Rules:
- Units: temperatures in °C (convert °F→°C), lap shear in MPa, T-peel in N/25mm, TML/CVCM as percent (0.8 not 0.008), out-life in days, freezer life and shelf life in months.
- Never return 0 as "unknown" — return null.
- Application dry/flash time is NOT cure_time; put it in application_process.
- Shelf life, freezer life, and out life are distinct — never conflate.
- Standards classification: qualifications[] only when the product ITSELF conforms/is qualified; testMethods[] for ASTM/ISO test methods; contextualStandards[] for standards describing the test setup (substrate, primer, tape). When in doubt, prefer testMethods or contextualStandards.
- For every numeric or boolean value, include a provenance entry with page (the "--- Page N ---" number the quote is under), an exact verbatim quote, and confidence. If you cannot cite a quote for a numeric value, return null.
- Multi-dimensional tables → testResults[], not scalar fields.`;

// Minimal subset of the shared tool schema — enough for the fast path.
const FAST_TOOL = {
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
        applicationProcess: { type: "string" },
        activeIngredientOrResin: { type: "string" },
        shelfLifeMonths: { type: ["number", "null"] },
        storageTempMinC: { type: ["number", "null"] },
        storageTempMaxC: { type: ["number", "null"] },
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
        qualifications: {
          type: "array",
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
          items: {
            type: "object",
            properties: {
              standard: { type: "string" },
              role: { type: "string" },
              evidence_quote: { type: ["string", "null"] },
              page: { type: ["number", "null"] },
            },
            required: ["standard", "role"],
          },
        },
        productIdentifiers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string" },
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

/**
 * Calls the fast text-layer route once. Returns null (do not throw) when the
 * route is not viable — extracted text is essentially empty — so the caller
 * can fall back to vision. Genuine errors (429, network) throw as usual.
 */
export async function callFastTextRoute(params: {
  vendor: string;
  productName: string;
  bytes: Uint8Array;
}): Promise<{ row: ExtractedRow; usage: UsageStats; includedPages: number; totalPages: number } | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new TdsExtractError(
      "LOVABLE_API_KEY is not configured.",
      "paused",
      ERROR_CODES.AI_CONFIG_ERROR,
    );
  }

  let chunks: PageChunk[];
  try {
    chunks = await extractPdfPages(params.bytes);
  } catch (err) {
    if (err instanceof TdsExtractError) throw err;
    console.warn("[tdsFastRoute] pdf text extraction failed", err);
    return null; // fall back to vision
  }

  const totalChars = chunks.reduce((n, c) => n + c.text.length, 0);
  if (totalChars < 200) {
    // Not enough text — this PDF is almost certainly scanned. Vision route.
    return null;
  }

  const joined = joinPagesForPrompt(chunks);
  const userPrompt = `Extract the technical specs for vendor "${params.vendor}" product "${params.productName}" from the TDS text below. Every numeric or boolean value MUST include a matching provenance entry citing the "--- Page N ---" page number and an exact verbatim quote.\n\n${joined.text}`;

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), FAST_STAGE_TIMEOUTS.modelCallMs);
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
        model: FAST_MODEL,
        messages: [
          { role: "system", content: FAST_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        tools: [FAST_TOOL],
        tool_choice: { type: "function", function: { name: "emit_spec" } },
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new TdsExtractError(
        `Fast route AI request timed out after ${FAST_STAGE_TIMEOUTS.modelCallMs / 1000}s.`,
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
    console.error("[tdsFastRoute] gateway not ok", { status: resp.status, bodyPreview: t.slice(0, 200) });
    throw classifyGatewayStatus(resp.status, t, resp.headers.get("retry-after"));
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const argsStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) return null;

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(argsStr);
  } catch {
    return null;
  }
  const parsed = z.object({}).passthrough().safeParse(parsedRaw);
  if (!parsed.success) return null;
  const rowParsed = (RowSchemaLocal as unknown as { safeParse: (v: unknown) => { success: boolean; data?: ExtractedRow } }).safeParse(parsed.data);
  if (!rowParsed.success || !rowParsed.data) return null;

  const inTok = json.usage?.prompt_tokens ?? null;
  const outTok = json.usage?.completion_tokens ?? null;
  const cost =
    inTok != null && outTok != null
      ? (inTok / 1_000_000) * PRICE_IN_PER_MTOK + (outTok / 1_000_000) * PRICE_OUT_PER_MTOK
      : null;

  return {
    row: rowParsed.data,
    usage: { inputTokens: inTok, outputTokens: outTok, costUsd: cost },
    includedPages: joined.includedPages,
    totalPages: joined.totalPages,
  };
}
