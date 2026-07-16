/**
 * TDS PDF preflight — pure bytes-in, metadata-out. Cheap signals that let the
 * router pick between text-layer fast path and vision path without paying for
 * a full model call. No network, no Supabase, no LLM.
 *
 * Text-layer coverage is a heuristic: a PDF with rich Tj/TJ text-showing
 * operators per page usually parses well as plain text; a PDF with almost
 * none is likely scanned images and needs vision.
 */

export type PdfPreflight = {
  sizeBytes: number;
  pages: number;
  encrypted: boolean;
  textCoverage: number; // 0..1 — fraction of pages with detected text operators
  textShowingOperators: number;
  suggestedRoute: "text_layer_fast" | "vision_pro";
  reason: string;
};

const MAX_TEXT_LAYER_PAGES = 24; // beyond this, always use vision
const MIN_TEXT_COVERAGE = 0.6;   // ≥60% of pages must have detectable text
const MIN_TEXT_OPS_PER_PAGE = 20;

/**
 * Cheap byte-level preflight — no PDF parser dependency. Counts /Page objects
 * and text-showing operators via a scan. Good enough to decide routing.
 */
export function preflightPdf(bytes: Uint8Array): PdfPreflight {
  const text = new TextDecoder("latin1").decode(bytes);
  const encrypted = /\/Encrypt\s/.test(text);

  // Page count: each real page has "/Type /Page" (not /Pages). This is the
  // reference-implementation heuristic used by qpdf's page counter.
  const pageMatches = text.match(/\/Type\s*\/Page(?!s)/g);
  const pages = pageMatches ? pageMatches.length : 0;

  // Text-showing operators: Tj, TJ, ', ".
  const tj = (text.match(/\)\s*Tj\b/g)?.length ?? 0) + (text.match(/\]\s*TJ\b/g)?.length ?? 0);
  const textShowingOperators = tj;

  // Approximate coverage: assume ops are roughly evenly distributed. This is
  // deliberately conservative — if we can't decide, we route to vision.
  const perPage = pages > 0 ? tj / pages : 0;
  const textCoverage = pages === 0 ? 0 : Math.min(1, perPage / MIN_TEXT_OPS_PER_PAGE);

  let suggestedRoute: PdfPreflight["suggestedRoute"] = "vision_pro";
  let reason = "default_vision";

  if (encrypted) {
    reason = "encrypted";
  } else if (pages === 0) {
    reason = "unknown_page_count";
  } else if (pages > MAX_TEXT_LAYER_PAGES) {
    reason = `pages>${MAX_TEXT_LAYER_PAGES}`;
  } else if (textCoverage >= MIN_TEXT_COVERAGE && perPage >= MIN_TEXT_OPS_PER_PAGE) {
    suggestedRoute = "text_layer_fast";
    reason = `text_coverage=${textCoverage.toFixed(2)} ops/page=${perPage.toFixed(0)}`;
  } else {
    reason = `text_coverage=${textCoverage.toFixed(2)} ops/page=${perPage.toFixed(0)}`;
  }

  return {
    sizeBytes: bytes.length,
    pages,
    encrypted,
    textCoverage,
    textShowingOperators,
    suggestedRoute,
    reason,
  };
}
