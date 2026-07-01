# Vendor-Targeted TDS Crawl & Auto-Link

## Goal
Replace generic Firecrawl "vendor search" mode with a **curated per-manufacturer source list**. For each supported vendor (Hexcel, 3M, Toray, Syensqo, Henkel), crawl a known set of matweb + manufacturer resource pages, harvest every TDS/PDS PDF, extract fields, and auto-match to `master_specs` rows so PDFs surface on `/engineer`.

## Why the current scrape fails
Today's bulk scrape sends one `search`-mode Firecrawl job per vendor using a Google `filetype:pdf` fallback (`vendorSearchTemplates.ts`). Google increasingly returns JS-only SERPs that Firecrawl can't parse, and the 3M template hits a JS-rendered search that also comes back empty — so `scrape_logs` fills with `search / no_results`.

## Plan

### 1. Curated vendor source registry
Rewrite `src/lib/vendorSearchTemplates.ts` → `src/lib/vendorSources.ts`:
```ts
export const VENDOR_SOURCES: Record<string, {
  aliases: string[];         // fuzzy match against master_specs.vendor
  seeds: string[];           // pages to map/crawl
  productSearchUrl?: (q: string) => string; // optional per-product query
}> = {
  Hexcel: { aliases:["hexcel"], seeds:[
    "https://www.hexcel.com/resources/",
    "https://www.matweb.com/search/GetMatlsByManufacturer.aspx?manID=81",
  ]},
  "3M":     { aliases:["3m"], seeds:[
    "https://technicaldatasheets.3m.com/",
    "https://www.3m.com/3M/en_US/thinsulate-us/technical-data-sheets/",
    "https://www.matweb.com/search/GetMatlsByManufacturer.aspx?manID=1",
  ]},
  Toray:    { aliases:["toray","toray composite"], seeds:[
    "https://www.toraycma.com/resources/data-sheets/",
    "https://matweb.com/search/GetMatlsByManufacturer.aspx?manID=1109",
  ]},
  Syensqo:  { aliases:["syensqo","solvay"], seeds:[
    "https://www.syensqo.com/en/chemical-categories/specialty-polymers/product-data",
    "https://www.matweb.com/search/GetMatlsByManufacturer.aspx?manID=139",
  ]},
  Henkel:   { aliases:["henkel","loctite"], seeds:[
    "https://tdx.henkel.com/com/en.html",
    "https://www.matweb.com/search/GetMatlsByManufacturer.aspx?manID=835",
  ]},
};
```

### 2. Two-phase crawler in `dataSheets.runner.server.ts`
Add a new job `mode: "vendor_sources"`:
- **Phase A – Discover.** For each seed URL: `firecrawlMap` (fast) → filter links by `looksLikeDataSheetUrl` + vendor-alias in URL/anchor text. For matweb manufacturer pages, also follow one hop into product datasheet pages.
- **Phase B – Harvest.** For each candidate page: `firecrawlScrape`; if PDF, download → store in `tds-pdfs` bucket; else extract PDF links from markdown and download those. Cap per seed (e.g. 200 URLs).
- Log every step (search / scrape / download / extract / match / apply) to `scrape_logs` — the infra already exists.

### 3. Orchestrator changes
`src/lib/specScrape.functions.ts`:
- `startBulkScrape` groups specs missing `tds_pdf_path` by resolved vendor (via aliases). For each supported vendor, spawn ONE `vendor_sources` crawl job seeded with `VENDOR_SOURCES[vendor].seeds` plus the vendor's product-name list (used in Phase B matching, not as search queries).
- Unsupported vendors: log `orchestrate / skipped_unsupported_vendor` (no Google fallback — it's noise).
- Per-spec `scrapeSpec` (single-row button) reuses the same crawler but with `productHint` narrowing Phase A to links whose text/URL contains the product number.

### 4. Matching & linking (unchanged wiring, tighter thresholds)
`bestMatch` in `dataSheets.server.ts` already fuzzy-matches sheet → spec. After Phase B:
- confidence ≥ 0.85 → auto-apply (attach PDF to `master_specs`, write extracted fields via `applySheetToSpec`).
- 0.6–0.85 → attach as unlinked `data_sheets` row + log for admin review at `/admin/data-sheets`.
- `<0.6` → keep sheet, no link.

Engineer page (`AttachedDataSheets`) already renders linked PDFs — no change needed.

### 5. UI copy
- `BulkScrapeModal.tsx`: update body to list the 5 supported vendors and the source URLs it will crawl.
- `/admin/data-sheets`: add a "Vendor Sources" tab that lets admins trigger one vendor's crawl on demand (reuses the same job).

### 6. DB
- `data_sheet_crawl_jobs`: add `source_urls text[]` and allow `mode='vendor_sources'` (currently 'site' | 'urls' | 'search'). One migration.
- No new tables.

## Files touched
- **New:** `src/lib/vendorSources.ts`
- **Rewrite:** `src/lib/vendorSearchTemplates.ts` → deleted, imports repointed
- **Edit:** `src/lib/dataSheets.runner.server.ts`, `src/lib/specScrape.functions.ts`, `src/lib/dataSheets.functions.ts`, `src/pages/admin/DataSheets.tsx`, `src/components/BulkScrapeModal.tsx`
- **Migration:** add `source_urls` column, extend `mode` check

## Open questions
1. Matweb often gates PDFs behind login — is it OK if matweb seeds mostly yield product *pages* (with specs in HTML) rather than PDFs? Extraction still works from the HTML→markdown.
2. Should Henkel `tdx.henkel.com` (which requires an interactive product picker) fall back to Firecrawl's `search` mode scoped to `site:tdx.henkel.com` when map returns nothing?
3. Do you want a scheduled re-crawl (e.g. weekly) or only on-demand from the admin button?
