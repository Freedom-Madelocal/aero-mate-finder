// Shared vendor search-URL templates. Used by admin UI and bulk scrape orchestrator.
// `{query}` is replaced with the URL-encoded product number by the crawler.
export const VENDOR_SEARCH_TEMPLATES: Record<string, string> = {
  "3M": "https://technicaldatasheets.3m.com/?q={query}",
};

// Generic Google fallback for vendors without a dedicated template. Forces the
// vendor name into the query and asks for a PDF. Firecrawl scrapes the result
// page and the batch runner harvests any PDF links from it.
export function genericVendorSearchTemplate(vendor: string): string {
  const v = encodeURIComponent(vendor);
  return `https://www.google.com/search?q=${v}+%22{query}%22+technical+data+sheet+filetype%3Apdf`;
}

export function templateForVendor(vendor: string): string {
  return VENDOR_SEARCH_TEMPLATES[vendor] ?? genericVendorSearchTemplate(vendor);
}
