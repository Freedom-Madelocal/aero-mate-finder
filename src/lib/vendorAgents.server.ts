// Interactive per-vendor "agent" scraping via Firecrawl v2 scrape `actions`.
// Firecrawl runs Chromium server-side; we script click/type/wait/press then
// scrape the resulting DOM. This handles JS-only catalogs (Henkel tdx,
// Syensqo product-data, 3M technicaldatasheets, Hexcel resources) that a
// plain sitemap map cannot walk.
//
// Each adapter returns CandidateUrl[] pointing at PDFs (or product pages that
// contain PDF links) which the runner then downloads + extracts + matches.

import type { CandidateUrl } from "@/lib/dataSheets.server";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

function firecrawlKey(): string {
  const k = process.env.FIRECRAWL_API_KEY;
  if (!k) throw new Error("FIRECRAWL_API_KEY not configured");
  return k;
}

type ScrapeAction =
  | { type: "wait"; milliseconds?: number; selector?: string }
  | { type: "click"; selector: string; all?: boolean }
  | { type: "write"; selector?: string; text: string }
  | { type: "press"; key: string }
  | { type: "scroll"; direction?: "up" | "down"; amount?: number }
  | { type: "screenshot" }
  | { type: "scrape" };

type AgentScrapeResult = {
  markdown: string;
  links: string[];
  title: string | null;
  finalUrl: string;
};

/** Interactive scrape via Firecrawl v2 with an actions script. */
async function agentScrape(url: string, actions: ScrapeAction[]): Promise<AgentScrapeResult> {
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firecrawlKey()}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "links"],
      onlyMainContent: false,
      waitFor: 2000,
      timeout: 60000,
      actions,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Firecrawl agent scrape ${res.status}: ${(await res.text()).slice(0, 400)}`,
    );
  }
  const json = await res.json();
  const data = json?.data ?? json;
  return {
    markdown: data?.markdown ?? "",
    links: Array.isArray(data?.links) ? data.links : [],
    title: data?.metadata?.title ?? null,
    finalUrl: data?.metadata?.sourceURL ?? url,
  };
}

/** Extract absolute PDF URLs from markdown + links list. */
function collectPdfLinks(markdown: string, links: string[], baseUrl: string): string[] {
  const out = new Set<string>();
  for (const l of links) {
    if (typeof l === "string" && /\.pdf(\?|#|$)/i.test(l)) {
      try {
        out.add(new URL(l, baseUrl).toString());
      } catch {
        /* skip */
      }
    }
  }
  const re = /\bhttps?:\/\/[^\s)"']+\.pdf(?:\?[^\s)"']*)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) out.add(m[0]);
  return Array.from(out);
}

/** Follow-up product-page links (non-PDF) worth scraping for embedded TDS. */
function collectProductLinks(
  links: string[],
  baseUrl: string,
  tokens: string[],
  hostFilter: string,
  max = 5,
): string[] {
  const out: string[] = [];
  for (const l of links) {
    if (typeof l !== "string") continue;
    if (/\.pdf(\?|#|$)/i.test(l)) continue;
    let u: URL;
    try {
      u = new URL(l, baseUrl);
    } catch {
      continue;
    }
    if (!u.hostname.includes(hostFilter)) continue;
    const norm = u.toString().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (tokens.length && !tokens.some((t) => t && norm.includes(t))) continue;
    out.push(u.toString());
    if (out.length >= max) break;
  }
  return out;
}

export type AgentLogSink = (entry: {
  status: "success" | "not_found" | "failed" | "info";
  attemptedUrl?: string | null;
  errorMessage?: string | null;
  details?: Record<string, unknown> | null;
}) => Promise<void>;

// ---------- Per-vendor agents ----------

const MAX_PRODUCTS_PER_AGENT = 20;

function tok(p: string): string {
  return p.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function searchStyleAgent(opts: {
  seed: string;
  vendorKey: string;
  hostFilter: string;
  products: string[];
  label: string;
  log: AgentLogSink;
}): Promise<CandidateUrl[]> {
  const { seed, vendorKey, hostFilter, products, label, log } = opts;
  const out: CandidateUrl[] = [];
  for (const product of products.slice(0, MAX_PRODUCTS_PER_AGENT)) {
    try {
      const r = await agentScrape(seed, [
        { type: "wait", milliseconds: 2500 },
        { type: "click", selector: "#onetrust-accept-btn-handler" },
        { type: "wait", milliseconds: 600 },
        {
          type: "write",
          selector:
            "input[type='search'], input[placeholder*='search' i], input[name*='search' i], input[name*='query' i], input[type='text']",
          text: product,
        },
        { type: "wait", milliseconds: 1200 },
        { type: "press", key: "Enter" },
        { type: "wait", milliseconds: 3500 },
        { type: "scrape" },
      ]);
      const pdfs = collectPdfLinks(r.markdown, r.links, r.finalUrl);
      const productPages = collectProductLinks(r.links, r.finalUrl, [tok(product)], hostFilter, 5);
      for (const p of pdfs) {
        out.push({ url: p, vendorHint: vendorKey, pageUrl: r.finalUrl, productNumber: product });
      }
      for (const p of productPages) {
        out.push({ url: p, vendorHint: vendorKey, pageUrl: r.finalUrl, productNumber: product });
      }
      await log({
        status: pdfs.length + productPages.length > 0 ? "success" : "not_found",
        attemptedUrl: r.finalUrl,
        errorMessage: `${label}: "${product}" → ${pdfs.length} PDF(s), ${productPages.length} product page(s)`,
        details: { pdfs: pdfs.slice(0, 5), productPages },
      });
    } catch (e) {
      await log({
        status: "failed",
        attemptedUrl: seed,
        errorMessage: `${label} "${product}": ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return out;
}

async function hexcelAgent(
  products: string[],
  vendorKey: string,
  log: AgentLogSink,
): Promise<CandidateUrl[]> {
  const seed = "https://www.hexcel.com/resources/";
  try {
    const tokens = products.map(tok).filter((t) => t.length >= 3);
    const r = await agentScrape(seed, [
      { type: "wait", milliseconds: 2500 },
      { type: "click", selector: "#onetrust-accept-btn-handler" },
      { type: "wait", milliseconds: 600 },
      { type: "click", selector: "a[href*='data-sheet' i]" },
      { type: "wait", milliseconds: 2000 },
      { type: "scroll", direction: "down", amount: 5 },
      { type: "wait", milliseconds: 1500 },
      { type: "scrape" },
    ]);
    const pdfs = collectPdfLinks(r.markdown, r.links, r.finalUrl).filter((u) => {
      const norm = u.toLowerCase().replace(/[^a-z0-9]/g, "");
      return tokens.length === 0 || tokens.some((t) => norm.includes(t));
    });
    await log({
      status: pdfs.length > 0 ? "success" : "not_found",
      attemptedUrl: r.finalUrl,
      errorMessage: `Hexcel agent: ${pdfs.length} matching PDF(s) from ${r.links.length} link(s)`,
      details: { pdfs: pdfs.slice(0, 10), linkCount: r.links.length },
    });
    return pdfs.map((p) => ({
      url: p,
      vendorHint: vendorKey,
      pageUrl: r.finalUrl,
      productNumber: null,
    }));
  } catch (e) {
    await log({
      status: "failed",
      attemptedUrl: seed,
      errorMessage: `Hexcel agent: ${e instanceof Error ? e.message : String(e)}`,
    });
    return [];
  }
}

// ---------- Dispatcher ----------

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** True when this seed has an interactive adapter (skip firecrawlMap). */
export function hasAgent(seedUrl: string): boolean {
  const h = safeHost(seedUrl);
  return (
    h.includes("tdx.henkel.com") ||
    (h.includes("syensqo.com") && seedUrl.includes("product-data")) ||
    h.includes("technicaldatasheets.3m.com") ||
    (h.includes("hexcel.com") && seedUrl.includes("resources"))
  );
}

/** Dispatch to the vendor-specific agent for this seed. */
export async function runAgentForSeed(
  seedUrl: string,
  vendorKey: string,
  products: string[],
  log: AgentLogSink,
): Promise<CandidateUrl[]> {
  const host = safeHost(seedUrl);
  if (host.includes("tdx.henkel.com")) {
    return searchStyleAgent({
      seed: "https://tdx.henkel.com/com/en.html",
      vendorKey,
      hostFilter: "henkel.com",
      products,
      label: "Henkel agent",
      log,
    });
  }
  if (host.includes("syensqo.com")) {
    return searchStyleAgent({
      seed: "https://www.syensqo.com/en/chemical-categories/specialty-polymers/product-data",
      vendorKey,
      hostFilter: "syensqo.com",
      products,
      label: "Syensqo agent",
      log,
    });
  }
  if (host.includes("technicaldatasheets.3m.com")) {
    return searchStyleAgent({
      seed: "https://technicaldatasheets.3m.com/",
      vendorKey,
      hostFilter: "3m.com",
      products,
      label: "3M TDS agent",
      log,
    });
  }
  if (host.includes("hexcel.com")) {
    return hexcelAgent(products, vendorKey, log);
  }
  return [];
}
