## Goal

Kill the Gemini "guess a URL" bulk scraper. Make the header **Scrape TDS/PDS** button spawn a Firecrawl-backed Data Sheets crawl (vendor-search mode) covering every `master_specs` row that doesn't yet have a stored PDF.

## What the button does today (broken)

`BulkScrapeModal` → `startBulkScrape` / `runBulkScrapeBatch` in `src/lib/specScrape.functions.ts` calls `google/gemini-2.5-flash` per spec, asks it to invent a TDS URL, then tries to download that URL. Most URLs are hallucinated → nothing gets stored.

## New behavior

Same button, same modal UX (progress + cancel), but under the hood it drives the existing Firecrawl pipeline in `src/lib/dataSheets.functions.ts` (`startDataSheetCrawl` / `runDataSheetCrawlBatch`). One crawl job per vendor, mode `search`, seeded with the product names of that vendor's spec rows missing a PDF. Matching + PDF storage + auto-apply already work there — we just fan out the work.

## Changes

### 1. New orchestration server functions — `src/lib/specScrape.functions.ts`

Rewrite `startBulkScrape`, `runBulkScrapeBatch`, `getBulkScrapeStatus`, `cancelBulkScrape` (keep the same names + shapes so `BulkScrapeModal` needs no API changes):

- `startBulkScrape`: query `master_specs` where `tds_pdf_path IS NULL`, group by `vendor`, and for each vendor with a `vendor_search_templates` entry (or generic fallback) call the existing `startDataSheetCrawl` logic with `mode: "search"` and the list of `product_name`s as queries. Record the created `data_sheet_crawl_jobs` ids in a new lightweight parent row (reuse `master_spec_scrape_jobs` table — add `child_job_ids uuid[]` column via migration, or store JSON in an existing `metadata` column if present). Return `{ jobId, total }` where `total` = sum of queued items across child jobs.
- `runBulkScrapeBatch`: pop the next N pending items across the child jobs and delegate to the existing `runDataSheetCrawlBatch` handler (imported directly, not via RPC). Aggregate progress.
- `getBulkScrapeStatus` / `cancelBulkScrape`: aggregate/cancel the child `data_sheet_crawl_jobs` rows.
- Delete the Gemini URL-guessing code path (`ScrapeResponseSchema`, model call, `downloadAndStoreTdsPdf` invocation from the old handler). Keep the `downloadAndStoreTdsPdf` helper only if `dataSheets.server.ts` doesn't already own it (it does — `downloadPdf` + storage upload live there; drop the duplicate).

### 2. Vendor template fallback — `src/lib/dataSheets.server.ts` (small addition)

If a vendor has no row in `vendor_search_templates`, use a generic `"{vendor} {product} technical data sheet filetype:pdf"` query so no vendor is skipped. Existing extraction/matching stays unchanged.

### 3. Per-row `ScrapeSpecButton` — `src/components/ScrapeSpecButton.tsx`

Repoint to a single-spec Firecrawl run: create a one-off `startDataSheetCrawl` with mode `search`, one query = that spec's product name, scoped to its vendor. Same toast UX. Drop the Gemini call.

### 4. Data model — migration

Add `child_job_ids uuid[] DEFAULT '{}'` and `mode text` to `master_spec_scrape_jobs` (or reuse if a metadata jsonb column already exists — verify at build time and prefer that). GRANTs already in place; no RLS change needed (admin-only).

### 5. Cleanup

- Remove the now-unused Gemini fields/schema from `specScrape.functions.ts`.
- No UI copy changes needed; the modal already says "Scrape TDS/PDS".
- Docs comment at top of `specScrape.functions.ts` explaining it's now a thin orchestrator over `dataSheets`.

## Validation

1. Open **Master Spec Sheet** → click **Scrape TDS/PDS** → modal shows non-zero total (was `0` before).
2. Batch runs; `data_sheet_crawl_jobs` rows fill in; `data_sheets` rows appear; high-confidence matches auto-apply and populate `master_specs.tds_pdf_path`.
3. Re-open the modal → total drops as rows gain PDFs. Cancel works.
4. Per-row **Scrape TDS** on a single row stores a PDF (or reports "no data sheet found") — no more hallucinated URLs.
5. Check AI Gateway logs: Gemini calls only come from extraction (`extractFromMarkdown`), not URL guessing.

## Out of scope

- Redesigning `/admin/data-sheets`.
- Changing `vendor_search_templates` schema.
- Touching the spreadsheet auto-mapper.
