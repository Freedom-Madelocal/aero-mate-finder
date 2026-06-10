## Goal

Make it obvious when "Scrape TDS" / "Rescrape TDS" runs and what it found, since the current inline "Found TDS" badge is easy to miss.

## Changes

1. **Add sonner toasts to `ScrapeSpecButton`** (`src/components/ScrapeSpecButton.tsx`)
   - On click: `toast.loading("Scraping TDS…")` with an id so we can update it.
   - On `success`: `toast.success("Found TDS", { description: sourceTitle, action: { label: "Open", onClick: () => window.open(url) } })`.
   - On `not_found`: `toast.warning("No TDS found for this product")`.
   - On `failed`: `toast.error("Scrape failed", { description: errorMessage })`.
   - Keep the existing inline badge as a secondary indicator (or remove it — see question below).

2. **Have `scrapeSpec` return the error message on failure** (`src/lib/specScrape.functions.ts`)
   - It already returns `{ status: "failed", error }` in the catch — confirm the client surfaces `res.error` in the toast description.

## Out of scope

- No changes to the scrape pipeline, schema, or bulk-scrape flow.
- No PDF download / storage work.
- `BulkScrapeModal` already shows progress, so no toast changes there.

## Files touched

- `src/components/ScrapeSpecButton.tsx`
