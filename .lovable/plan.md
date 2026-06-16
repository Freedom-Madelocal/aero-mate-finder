# Rethink: PDS/TDS Data Sheet Library

## Why the current tool is failing

Today's scrape lives on each master spec row and tries to do three things in one server call: Google-search the manufacturer site, fetch the page, ask Gemini to map fields, and (recently) download a PDF. Each step is fragile: Gemini's search-grounding often returns the wrong PDF, the row gets locked while it runs, and there's no way to review or re-match results. Failures look like "nothing happens".

## Recommended approach

Decouple **harvesting** from **matching**. Admin points at a manufacturer/distributor URL once; we crawl, store every TDS/PDS we find as a first-class record (PDF + extracted fields), then match those records to master specs. Engineers see the linked PDF + parsed specs on the material page.

Three pieces:

1. **New table `data_sheets`** — one row per discovered TDS/PDS. Holds source URL, PDF storage path, document type (TDS/PDS/SDS), parsed product name + vendor, full extracted spec JSON, match status, and `master_spec_id` once linked.
2. **New admin page `/admin/data-sheets`** — paste a root URL (e.g. a manufacturer's products page), choose crawl depth/limit, kick off a background job. Page shows: queued sources, discovered sheets with thumbnails/links, parsed fields, suggested master-spec match (with confidence), and Accept / Reject / Re-match controls. Bulk "Accept all high-confidence matches" button.
3. **Background crawler** — uses **Firecrawl** (already a supported connector) to map the site, scrape each candidate page, and download the linked PDF. Then **Lovable AI Gateway (Gemini)** parses the PDF text into the same field schema as `master_specs`. Files go into the existing private `tds-pdfs` Supabase Storage bucket — no S3 needed (works the same, fewer moving parts, no extra secret to manage). If you specifically want S3 later we can swap the storage adapter.

## Matching logic

For each parsed sheet:
- Normalize `vendor + product_name` and fuzzy-match against `master_specs` (trigram similarity on product_name within same vendor).
- If similarity > 0.85 → auto-link (write `master_spec_id`, copy PDF path + extracted fields into the spec, only filling empty columns by default; admin can flip a switch to overwrite).
- 0.6–0.85 → "suggested", needs one click.
- < 0.6 → "unmatched"; admin can search & link manually, or mark "no match" (kept in library for future specs).

A master spec can have multiple linked data sheets (TDS + PDS + revision history). Engineer view shows the latest of each type with a download button and a "View parsed specs" diff.

## Engineer-facing change

On `/material/$id` (and the spec detail panel), add a "Data sheets" section listing each linked PDF (open / download), and merge parsed-but-empty fields into the displayed spec list with a small "from TDS" tag so they know the source.

## Admin workflow (the outcome you described)

1. Admin opens **Data Sheets** → "Add source URL" → pastes e.g. `https://www.henkel-adhesives.com/us/en/products/industrial-adhesives/aerospace.html`.
2. Job runs (progress bar, cancelable, same pattern as current bulk scrape modal). Discovers ~N product pages, downloads N PDFs, parses each.
3. Results table shows everything found. Admin clicks "Accept all high-confidence" → master specs get auto-filled and PDFs attached. Remaining ones reviewed manually in seconds each.
4. Engineers immediately see the new specs + PDFs on each material.

## Technical details

- **Crawl**: Firecrawl `map` (URL discovery, fast) → filter to PDF + product-page candidates → Firecrawl `scrape` with `formats: ['markdown','links']` per page → enqueue any PDF links found.
- **PDF parse**: download PDF server-side, send bytes to Gemini via existing AI gateway with a strict JSON schema matching `master_specs` columns. Store both raw text and parsed JSON for re-parsing later without re-downloading.
- **Storage**: `tds-pdfs` bucket already exists & is private. Path pattern: `data-sheets/{data_sheet_id}.pdf`. Signed URL on demand for download.
- **Jobs table**: `data_sheet_crawl_jobs` (source_url, status, counts, error) — same shape as existing `master_spec_scrape_jobs`. Batch runner pattern reused from `runBulkScrapeBatch`.
- **Schema additions** on `data_sheets`: `id, source_url, page_url, pdf_path, pdf_size, doc_type (tds|pds|sds|other), vendor, product_name, parsed_specs jsonb, raw_text, match_status (auto|suggested|manual|rejected|unmatched), master_spec_id (nullable FK), confidence numeric, created_at, updated_at`. RLS: admins only.
- **Deprecate**: remove the per-row "Scrape" button and the bulk scrape modal once the new flow is in. Keep the existing `tds_pdf_path`/`tds_url` columns on `master_specs` (now populated by the matcher) so the engineer UI doesn't change shape.

## Open questions before I build

1. Is **Supabase Storage** (already set up) fine, or do you specifically want **S3** for the PDFs? I'd recommend Storage — same signed-URL access, no extra connector.
2. For auto-fill on match: **only fill empty fields** (safe default) or **overwrite** existing values? I'd default to "only fill empty" with a per-field "use scraped value" button.
3. Should the crawler also pull **SDS** (safety data sheets) and **revision history**, or only TDS + PDS for now?
4. Do you want the admin page to also accept **direct PDF URLs** (drop-in list of links) in addition to crawling a site root?

If you say "go", I'll build it with Supabase Storage, fill-empty-only, TDS+PDS, and both crawl-a-site + paste-PDF-list inputs.
