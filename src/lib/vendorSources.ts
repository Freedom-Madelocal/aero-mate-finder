// Curated per-manufacturer TDS/PDS seed pages. The bulk "Scrape TDS/PDS"
// button and per-row Scrape button use these to feed Firecrawl instead of
// blind Google/vendor-search queries.

export type VendorSource = {
  aliases: string[]; // lowercased fuzzy tokens to match master_specs.vendor
  seeds: string[]; // pages to map + follow one hop for PDFs
};

export const VENDOR_SOURCES: Record<string, VendorSource> = {
  Hexcel: {
    aliases: ["hexcel"],
    seeds: [
      "https://www.hexcel.com/resources/",
      "https://www.matweb.com/search/GetMatlsByManufacturer.aspx?manID=81",
    ],
  },
  "3M": {
    aliases: ["3m"],
    seeds: [
      "https://technicaldatasheets.3m.com/",
      "https://www.3m.com/3M/en_US/thinsulate-us/technical-data-sheets/",
      "https://www.matweb.com/search/GetMatlsByManufacturer.aspx?manID=1",
    ],
  },
  Toray: {
    aliases: ["toray", "toray composite", "toray composites"],
    seeds: [
      "https://www.toraycma.com/resources/data-sheets/",
      "https://matweb.com/search/GetMatlsByManufacturer.aspx?manID=1109",
    ],
  },
  Syensqo: {
    aliases: ["syensqo", "solvay"],
    seeds: [
      "https://www.syensqo.com/en/chemical-categories/specialty-polymers/product-data",
      "https://www.matweb.com/search/GetMatlsByManufacturer.aspx?manID=139",
    ],
  },
  Henkel: {
    aliases: ["henkel", "loctite"],
    seeds: [
      "https://tdx.henkel.com/com/en.html",
      "https://www.matweb.com/search/GetMatlsByManufacturer.aspx?navletter=H&manID=835",
    ],
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
