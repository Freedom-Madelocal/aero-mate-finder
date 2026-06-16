## Goal

Add a third crawl mode to the Data Sheet Library that takes a **vendor search URL template + a list of product numbers** (or pulls them from existing `master_specs` rows filtered by vendor), submits each query, follows the top result(s) to the TDS/PDS PDF, and runs the existing extract → match → attach pipeline.

Works for 3M (`https://technicaldatasheets.3m.com/?q={query}`), Henkel, Momentive, Permatex, anything with a public search box.

## How it works

```text
[vendor, product#] → Firecrawl search/scrape → top PDF link → download → Gemini extract → fuzzy-match → attach to master_spec
```

Two ways to drive it:

1. **Manual list** — admin picks vendor, pastes product numbers (one per line), and a search URL template containing `{query}`.
2. **From existing specs** — admin picks a vendor; the crawler pulls every `master_specs` row for that vendor that has a `product_name`/SKU and no `tds_pdf_path` yet, and runs them as the input list. This is the "fill in the gaps for everything I already have" button.

For each product number:
- Render the search URL (`template.replace('{query}', encodeURIComponent(productNumber))`).
- Use **Firecrawl `scrape`** with `formats: ['links', 'markdown']` on that search results page.
- Pick the best candidate link: prefer `.pdf` URLs whose filename/text contains the product number; fall back to the first product-page link that contains the number, then scrape *that* page for a PDF link.
- Download the PDF, store in `tds-pdfs` bucket, create a `data_sheets` row pre-linked to the originating `master_spec` (high confidence, since the query came from that spec) → status `auto` if confidence ≥ 0.85, else `suggested` for admin review.

## UI changes

On `/admin/data-sheets`, the "Crawl a source" modal gets a third tab:

```text
[ Crawl site ] [ Direct PDF URLs ] [ Search vendor site ]
```

The new tab shows:
- Vendor (dropdown of distinct `master_specs.vendor` values + free text)
- Search URL template (with `{query}` placeholder, pre-filled for known vendors — 3M default: `https://technicaldatasheets.3m.com/?q={query}`)
- Either: textarea of product numbers, OR a checkbox **"Use all master specs for this vendor missing a TDS"** with a live count
- Max results per query (default 1)

A small `vendor_search_templates` JSON config in code seeds known vendors; admins can override per-job.

## Data model

No new tables. Add columns to `data_sheet_crawl_jobs`:
- `crawl_mode` already exists — new value `search`
- `search_template text` — the URL template used
- `vendor text` — the vendor scope

`data_sheets` already has `master_spec_id`; for search-mode rows we pre-fill it from the originating product number, so matching is essentially free.

## Server-function changes (`src/lib/dataSheets.functions.ts` + `.server.ts`)

- `startDataSheetCrawl` gains a new branch when `mode: 'search'` is passed. It expands product numbers (manual list or DB query for unfilled specs) into a `data_sheet_crawl_urls` queue, one row per `productNumber`, with the rendered search URL.
- `runDataSheetCrawlBatch` handles the search case: scrape search page → pick PDF candidate → if HTML, scrape that page → download PDF → extract → upsert `data_sheets` with `master_spec_id` already set.
- Reuse all existing extract / signed-URL / accept / reject logic unchanged.

## Out of scope (call out)

- Sites that require login or POST-only search forms. We rely on GET search URLs. If a vendor has no GET search endpoint, admin falls back to "Direct PDF URLs" mode.
- CAPTCHA-gated search (rare for TDS portals; if hit, the row goes to `failed` with the captcha error and admin sees it in the jobs table).

## Open questions

1. For the default vendor list, do you want me to seed templates for **just 3M** for now, or include Henkel / Permatex / Momentive / Loctite up front?
2. When "use all master specs missing a TDS" is checked, should it also re-run specs that already have a `tds_url` but no `tds_pdf_path` (i.e. we know the link but never downloaded the PDF)?
