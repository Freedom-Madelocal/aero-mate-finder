## Goal

Add a "Scrape TDS/PDS" capability to every material in the Master Spec list, powered by Gemini grounded web search. Supports per-item rescrape and a bulk "Scrape all" run from the Master Specs page that processes in batches of 5, shows progress, skips already-scraped items, and stores a link to the source PDF/page on each spec.

## Data model

Add columns to `master_specs`:
- `tds_url text` — link to the manufacturer's TDS/PDS page or PDF
- `tds_scraped_at timestamptz` — null = never scraped (drives "skip if already done")
- `tds_scrape_status text` — `success` | `not_found` | `failed`
- `tds_scrape_error text` — last error message (for the failed ones)
- `tds_source_title text` — display label for the link

New table `master_spec_scrape_jobs` for the bulk run:
- `id`, `started_by`, `started_at`, `finished_at`
- `total`, `processed`, `succeeded`, `failed`, `skipped`
- `status` (`running` | `completed` | `cancelled` | `failed`)
- `current_spec_id` (nullable)

RLS: super-admins can read/write both surfaces.

## Backend (TanStack server functions)

In `src/lib/specScrape.functions.ts` (auth-gated, super-admin only):

1. `scrapeSpec({ specId, force })` — runs the pipeline for one material:
   - Loads the spec row.
   - Calls Gemini (`google/gemini-3-flash-preview` via Lovable AI Gateway) with web grounding enabled and a prompt: "Find the official manufacturer Technical/Product Data Sheet for `{vendor} {productName}`. Return JSON: `{ url, sourceTitle, fields: { cure_temperature_f, dry_tg_onset_f, wet_tg_f, peak_tg_f, max_service_temperature_f, out_life_days, freezer_life_months, tml_pct, cvcm_pct, tensile_lap_shear_mpa, t_peel_n_per_25mm, flatwise_tension_mpa, climbing_drum_peel_in_lb_per_in, cure_time, process_method, resin_chemistry, reinforcement, product_form, applications, qualifications_standards } }`. Temperatures must be Fahrenheit (matches the existing fix). Any field not stated on the sheet → null.
   - Uses `Output.object` with a Zod schema so the response is typed.
   - Merge policy:
     - `force === true` (single-item rescrape button) → overwrite any field returned non-null.
     - `force === false` (bulk path) → only fill fields currently null/empty.
   - Always writes `tds_url`, `tds_source_title`, `tds_scraped_at = now()`, status, error.
   - Returns `{ status, url, filledFields[] }`.

2. `startBulkScrape()` — creates a `master_spec_scrape_jobs` row for all specs where `tds_scraped_at IS NULL`, returns `jobId` and `total`.

3. `runBulkScrapeBatch({ jobId })` — picks the next ≤5 pending specs, runs `scrapeSpec({ force:false })` for each in parallel, updates job counters, returns `{ processed, remaining, currentSpecId, status }`. The client polls this until `remaining === 0`. This avoids long-running serverless requests while still feeling like a background job.

4. `getBulkScrapeStatus({ jobId })` — read-only progress snapshot for the UI.

5. `cancelBulkScrape({ jobId })` — sets status to `cancelled`; the batch runner short-circuits.

All five use `requireSupabaseAuth` + a super-admin check via `has_role`.

## Frontend changes

### `src/pages/MasterSpecs.tsx`
- Header gets a new button next to "Upload Spec Sheet": **"Scrape TDS/PDS for new items"**.
- Clicking it: calls `startBulkScrape`, then opens a small progress modal showing `processed / total`, current vendor + product, succeeded/failed/skipped counts, a "Cancel" button, and a "Close (keeps running in background)" button. The modal drives the loop by calling `runBulkScrapeBatch` repeatedly until done.
- Table gets a new "TDS" column showing one of:
  - external-link icon → opens `tds_url` in a new tab
  - "—" if never scraped
  - small red dot if last attempt failed (tooltip = error)
- New filter toggle "Missing TDS" to focus the next run.

### `SpecDrawer` (detail panel inside MasterSpecs.tsx)
- Header gets a **"Scrape TDS"** / **"Rescrape TDS"** button (label depends on `tds_scraped_at`).
- Shows a "Source" row with the linked TDS URL + title + last-scraped timestamp under a new "Source Document" section.
- Single-item rescrape uses `force:true` (overwrites fields per the user's chosen policy).

### `src/pages/Engineer.tsx` and `src/pages/MaterialDetail.tsx`
- When a spec has `tds_url`, surface a small "View TDS" link (external-link icon) in the material header/detail block so engineers can reach the source sheet.

## Resume behavior

- Bulk button always targets `tds_scraped_at IS NULL` → safely resumable; re-pressing it never re-hits successes.
- Items that failed previously (`status='failed'`) stay marked with `tds_scraped_at` set, so they are skipped by bulk. The Master Specs table shows the failed indicator; the user can rescrape them individually from the drawer, or we can add a secondary "Retry failed" button later if they want.

## Out of scope (call out if user wants these next)
- Downloading and storing the PDF itself in Storage (we only store the URL).
- OCR/parsing the PDF directly — Gemini grounded search reads the manufacturer page; if quality is weak for PDF-only specs, the natural follow-up is to add Firecrawl scrape of the URL as a second pass.
- Per-org scraping (this is super-admin global).

## Technical notes (for the engineer)
- Add `LOVABLE_API_KEY` provider helper at `src/lib/ai-gateway.server.ts` per the gateway pattern; key already present in secrets.
- Web grounding via `toolsSpec`-style `webGroundingSpec` isn't an AI SDK primitive — implement by calling Gemini with `tools: { googleSearch: {} }` parameter through the OpenAI-compatible adapter's `providerOptions`, or fall back to Firecrawl `/search` for URL discovery + Firecrawl `/scrape` of the URL as the grounding source if grounding via the gateway proves unreliable. Pick at implementation time based on a smoke test against 2–3 known materials (e.g. Hexcel HexBond ST 1035 — sample PDF attached).
- Bulk run uses client-driven batch polling (no Inngest/cron needed). Keeps it simple and matches the "background job with progress" UX requested.
