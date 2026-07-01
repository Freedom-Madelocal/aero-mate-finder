// Curated per-manufacturer TDS/PDS seed pages. The bulk "Scrape TDS/PDS"
// button and per-row Scrape button use these to feed the vendor agent
// (interactive Firecrawl scrapes with click/type/wait actions) instead of
// blind Google/vendor-search queries. MatWeb is intentionally excluded —
// it gates PDFs behind login and returned no useful sheets in testing.

export type VendorSource = {
  aliases: string[]; // lowercased fuzzy tokens to match master_specs.vendor
  seeds: string[]; // pages to map/agent-crawl
};

export const VENDOR_SOURCES: Record<string, VendorSource> = {
  Hexcel: {
    aliases: ["hexcel"],
    seeds: ["https://www.hexcel.com/resources/"],
  },
  "3M": {
    aliases: ["3m"],
    seeds: [
      "https://technicaldatasheets.3m.com/",
      "https://www.3m.com/3M/en_US/thinsulate-us/technical-data-sheets/",
    ],
  },
  Toray: {
    aliases: ["toray", "toray composite", "toray composites"],
    seeds: ["https://www.toraycma.com/resources/data-sheets/"],
  },
  Syensqo: {
    aliases: ["syensqo", "solvay"],
    seeds: [
      "https://www.syensqo.com/en/chemical-categories/specialty-polymers/product-data",
    ],
  },
  Henkel: {
    aliases: ["henkel", "loctite"],
    seeds: ["https://tdx.henkel.com/com/en.html"],
  },
};

/** Return canonical vendor key for a raw master_specs.vendor value, or null. */
export function resolveVendorKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  for (const [key, src] of Object.entries(VENDOR_SOURCES)) {
    for (const a of src.aliases) {
      if (lower.includes(a)) return key;
    }
  }
  return null;
}

export function listSupportedVendors(): string[] {
  return Object.keys(VENDOR_SOURCES);
}
