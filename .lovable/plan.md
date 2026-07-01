
# Interactive vendor TDS agent

## 1. Prune MatWeb from vendor sources
Edit `src/lib/vendorSources.ts` — remove every `matweb.com` seed. Resulting seeds:

- **Hexcel:** `https://www.hexcel.com/resources/`
- **3M:** `https://technicaldatasheets.3m.com/`, `https://www.3m.com/3M/en_US/thinsulate-us/technical-data-sheets/`
- **Toray:** `https://www.toraycma.com/resources/data-sheets/`
- **Syensqo:** `https://www.syensqo.com/en/chemical-categories/specialty-polymers/product-data`
- **Henkel:** `https://tdx.henkel.com/com/en.html`

Update `BulkScrapeModal.tsx` copy to drop the "MatWeb" mention.

## 2. Why Firecrawl alone isn't enough
`tdx.henkel.com`, the Syensqo product-data page, and 3M's `technicaldatasheets.3m.com` are JS-driven catalogs behind dropdowns / search boxes / "Load more" buttons. `firecrawlMap` returns a near-empty link set on those, which is why scrapes come back with nothing. We need a real browser session that can type into search fields, pick dropdown values, and click through result cards.

## 3. Add a browser-agent crawl mode
New file `src/lib/vendorAgents.server.ts` — one adapter per vendor site, each running Playwright (Chromium) via Firecrawl v2's **cloud browser** (`browser` + `browserExecute`, per the firecrawl knowledge card). This keeps us serverless-safe (no local Chromium in the Worker) and gives us `page.click`, `page.fill`, `page.selectOption`, `page.waitForSelector`, network sniffing for `.pdf` responses, etc.

Adapters:

- **HenkelAgent** — open `tdx.henkel.com/com/en.html`, accept cookies, type each product name into the search box, wait for suggestions, click first match, on product page harvest any anchor ending in `.pdf` (TDS + SDS).
- **SyensqoAgent** — open the specialty-polymers product-data page, use the family dropdown + text filter, iterate result cards, follow "Technical datasheet" link, capture the download URL.
- **ThreeMTdsAgent** — `technicaldatasheets.3m.com`: fill the product-number search, wait for results grid, click each row, capture PDF download URL from the modal.
- **ThreeMThinsulateAgent** — flat listing page, plain `firecrawlMap` + link filter is enough (kept as passive seed).
- **HexcelAgent** — `hexcel.com/resources/` is a filterable resource library; adapter selects "Data Sheets" category then walks paginated cards.
- **TorayAgent** — `toraycma.com/resources/data-sheets/` is a static grid; keep as passive seed (map + filter) — no interaction needed.

Each adapter returns `CandidateUrl[]` with `pageUrl` + resolved PDF `url`, ready to feed the existing download / extract / match pipeline.

## 4. Wire the runner
`src/lib/dataSheets.runner.server.ts` — when a seed's host matches an interactive adapter, dispatch to `vendorAgents.server.ts` instead of `firecrawlMap`. Non-interactive seeds keep today's map+filter path. All existing `scrape_logs` steps (`search`, `scrape`, `download_pdf`, `extract`, `match`, `apply`) still fire, plus a new `agent` step logging each interactive action (opened URL, filled field, clicked selector, captured PDF, error).

Cap per adapter: 25 product queries per job, 10 s per action, 60 s per product. Reuse one browser session per child job (`browser({ ttl: 600 })`, close in `finally`).

## 5. Orchestrator
`src/lib/specScrape.functions.ts` — no shape change. It still groups specs by vendor and creates one `data_sheet_crawl_jobs` child per vendor; the runner now decides interactive vs. passive per seed. Products for a vendor are passed through `productFilterTokens` (already exists) and read by the adapter as the query list.

## 6. UI
- `BulkScrapeModal.tsx` — update body: "Uses a browser agent to search each manufacturer's TDS portal (Hexcel, 3M, Toray, Syensqo, Henkel), open product pages, and download the linked PDFs."
- `/admin/data-sheets` — add a per-vendor "Run agent now" button (reuses the same job creation path). Progress + failures visible via existing `/admin/scrape-logs` (filter `step=agent`).

## 7. DB
No schema changes. `scrape_logs.step` is free text so `agent` needs no migration.

## Files touched
- **Edit:** `src/lib/vendorSources.ts`, `src/lib/dataSheets.runner.server.ts`, `src/lib/dataSheets.server.ts` (types), `src/components/BulkScrapeModal.tsx`, `src/pages/admin/DataSheets.tsx`
- **New:** `src/lib/vendorAgents.server.ts` (one file, one adapter per vendor)

## Open questions
1. **Cost:** Firecrawl cloud browser sessions bill by time. Ballpark ~5–15 s per product × ~25 products × 5 vendors ≈ 15–30 min of browser time per full bulk run. OK, or should the agent only run for specs with no PDF *and* no prior `agent` attempt in the last 7 days?
2. **Henkel SDS vs TDS:** `tdx.henkel.com` product pages expose both. Attach both, or TDS only?
3. **Fallback for zero results:** if the agent finds nothing for a product, should it fall back to Firecrawl `search` mode scoped `site:vendor.com "<product>" filetype:pdf`, or just log `agent/not_found` and stop?
