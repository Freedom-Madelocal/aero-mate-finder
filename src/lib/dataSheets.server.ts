// Server-only helpers for the Data Sheet Library.
// Firecrawl for crawl + per-page scrape (handles PDFs natively),
// Lovable AI Gateway (Gemini) for field extraction from markdown.

import { z } from "zod";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

export type CandidateUrl = {
  url: string;
  vendorHint: string | null;
  pageUrl: string | null;
  productNumber?: string | null;
  searchMode?: boolean;
};

function firecrawlKey(): string {
  const k = process.env.FIRECRAWL_API_KEY;
  if (!k) throw new Error("FIRECRAWL_API_KEY not configured");
  return k;
}

function lovableKey(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY not configured");
  return k;
}

// -------- Firecrawl --------

export async function firecrawlMap(rootUrl: string, limit = 200): Promise<string[]> {
  const res = await fetch(`${FIRECRAWL_BASE}/map`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${firecrawlKey()}` },
    body: JSON.stringify({ url: rootUrl, limit, includeSubdomains: false }),
  });
  if (!res.ok) throw new Error(`Firecrawl map ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const links: unknown = json?.links ?? json?.data?.links ?? [];
  if (!Array.isArray(links)) return [];
  return links
    .map((l: unknown) => (typeof l === "string" ? l : (l as { url?: string })?.url ?? null))
    .filter((u): u is string => !!u);
}

export type FirecrawlScrape = {
  isPdf: boolean;
  markdown: string;
  links: string[];
  title: string | null;
  sourceUrl: string;
};

export async function firecrawlScrape(url: string): Promise<FirecrawlScrape> {
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${firecrawlKey()}` },
    body: JSON.stringify({
      url,
      formats: ["markdown", "links"],
      onlyMainContent: true,
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl scrape ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const data = json?.data ?? json;
  const meta = data?.metadata ?? {};
  const contentType: string = (meta.contentType ?? meta["content-type"] ?? "").toLowerCase();
  const isPdf = contentType.includes("pdf") || /\.pdf(\?|#|$)/i.test(url);
  return {
    isPdf,
    markdown: data?.markdown ?? "",
    links: Array.isArray(data?.links) ? data.links : [],
    title: meta?.title ?? meta?.ogTitle ?? null,
    sourceUrl: meta?.sourceURL ?? url,
  };
}

// -------- PDF download --------

export async function downloadPdf(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TraceiumTDSFetcher/1.0)",
        Accept: "application/pdf,*/*;q=0.8",
      },
    });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (!buf.length || buf.byteLength > MAX_PDF_BYTES) return null;
    // %PDF magic bytes
    if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) return null;
    return buf;
  } catch {
    return null;
  }
}

// -------- Gemini extraction --------

const FieldsSchema = z.object({
  vendor: z.string().nullable(),
  product_name: z.string().nullable(),
  doc_type: z.enum(["tds", "pds", "sds", "other"]).nullable(),
  cure_temperature_f: z.number().nullable(),
  cure_time: z.string().nullable(),
  dry_tg_onset_f: z.number().nullable(),
  wet_tg_f: z.number().nullable(),
  peak_tg_f: z.number().nullable(),
  max_service_temperature_f: z.number().nullable(),
  out_life_days: z.number().nullable(),
  freezer_life_months: z.number().nullable(),
  tml_pct: z.number().nullable(),
  cvcm_pct: z.number().nullable(),
  tensile_lap_shear_mpa: z.number().nullable(),
  t_peel_n_per_25mm: z.number().nullable(),
  flatwise_tension_mpa: z.number().nullable(),
  climbing_drum_peel_in_lb_per_in: z.number().nullable(),
  process_method: z.string().nullable(),
  resin_chemistry: z.string().nullable(),
  reinforcement: z.string().nullable(),
  product_form: z.string().nullable(),
  applications: z.string().nullable(),
  qualifications_standards: z.string().nullable(),
});

export type ExtractedFields = z.infer<typeof FieldsSchema>;

export const FIELD_TO_COLUMN: Record<string, string> = {
  cure_temperature_f: "cure_temperature_c",
  cure_time: "cure_time",
  dry_tg_onset_f: "dry_tg_onset_c",
  wet_tg_f: "wet_tg_c",
  peak_tg_f: "peak_tg_c",
  max_service_temperature_f: "max_service_temperature_c",
  out_life_days: "out_life_days",
  freezer_life_months: "freezer_life_months",
  tml_pct: "tml_pct",
  cvcm_pct: "cvcm_pct",
  tensile_lap_shear_mpa: "tensile_lap_shear_mpa",
  t_peel_n_per_25mm: "t_peel_n_per_25mm",
  flatwise_tension_mpa: "flatwise_tension_mpa",
  climbing_drum_peel_in_lb_per_in: "climbing_drum_peel_in_lb_per_in",
  process_method: "process_method",
  resin_chemistry: "resin_chemistry",
  reinforcement: "reinforcement",
  product_form: "product_form",
  applications: "applications",
  qualifications_standards: "qualifications_standards",
};

export async function extractFromMarkdown(
  markdown: string,
  pageTitle: string | null,
  hintUrl: string,
): Promise<ExtractedFields> {
  const trimmed = markdown.slice(0, 80_000); // generous cap
  const prompt = `You are extracting structured data from an aerospace materials Technical Data Sheet (TDS) or Product Data Sheet (PDS).

Source page title: ${pageTitle ?? "(unknown)"}
Source URL: ${hintUrl}

Document text (markdown):
---
${trimmed}
---

Return STRICT JSON only:
{
  "vendor": string | null,            // manufacturer / brand name
  "product_name": string | null,      // primary product/grade name as shown
  "doc_type": "tds" | "pds" | "sds" | "other" | null,
  "cure_temperature_f": number | null,
  "cure_time": string | null,
  "dry_tg_onset_f": number | null,
  "wet_tg_f": number | null,
  "peak_tg_f": number | null,
  "max_service_temperature_f": number | null,
  "out_life_days": number | null,
  "freezer_life_months": number | null,
  "tml_pct": number | null,
  "cvcm_pct": number | null,
  "tensile_lap_shear_mpa": number | null,
  "t_peel_n_per_25mm": number | null,
  "flatwise_tension_mpa": number | null,
  "climbing_drum_peel_in_lb_per_in": number | null,
  "process_method": string | null,
  "resin_chemistry": string | null,
  "reinforcement": string | null,
  "product_form": string | null,
  "applications": string | null,
  "qualifications_standards": string | null
}

RULES:
- All temperatures in degrees Fahrenheit. If Celsius given, convert F = C*9/5+32.
- Use null for any field not stated. Do not guess.
- Output ONLY the JSON object, no commentary, no markdown fences.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey(),
      "X-Lovable-AIG-SDK": "lovable-app",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You extract aerospace materials data into strict JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text: string = j?.choices?.[0]?.message?.content ?? "";
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return FieldsSchema.parse(JSON.parse(cleaned));
}

// -------- URL filtering --------

const PDF_HINT_WORDS = ["tds", "pds", "datasheet", "data-sheet", "data_sheet", "technical", "product-data", "spec"];

export function looksLikeDataSheetUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (/\.pdf(\?|#|$)/i.test(lower)) return true;
  return PDF_HINT_WORDS.some((w) => lower.includes(w));
}

// -------- Matching --------

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let overlap = 0;
  for (const x of A) if (B.has(x)) overlap++;
  return (2 * overlap) / (A.size + B.size);
}

export type SpecCandidate = { id: string; vendor: string; product_name: string };

export function bestMatch(
  vendor: string | null,
  product: string | null,
  candidates: SpecCandidate[],
): { id: string; confidence: number } | null {
  if (!product) return null;
  const nv = normalize(vendor);
  const np = normalize(product);
  let best: { id: string; confidence: number } | null = null;
  for (const c of candidates) {
    const cv = normalize(c.vendor);
    const cp = normalize(c.product_name);
    // Vendor gate: must overlap if known
    if (nv && cv && !(nv.includes(cv) || cv.includes(nv))) continue;
    let score: number;
    if (np === cp) score = 1;
    else if (np.includes(cp) || cp.includes(np)) score = 0.9;
    else score = dice(np, cp);
    if (!best || score > best.confidence) best = { id: c.id, confidence: score };
  }
  return best;
}
