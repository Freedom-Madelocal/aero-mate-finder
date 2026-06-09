## What's actually happening

Looking at the session replay from your click, the scrape **did run successfully** — the button spinner spun, then a link to `3m.com/.../b00037324/` titled "3M™ Adhesion Promoter 86A | 3M United States" was inserted into the page. So Gemini found the TDS and the DB row was updated.

The reason it *feels* like nothing happened is that the **drawer panel doesn't re-render with the new data**:

- `MasterSpecs.tsx` keeps the open drawer in local state: `const [selected, setSelected] = useState<MasterSpec | null>(null)`.
- `ScrapeSpecButton` calls `refreshMasterSpecStore()` after a successful scrape, which updates the `specs` array in the store — but `selected` is a snapshot captured when you opened the drawer, so the TDS Source block and any newly-filled fields don't appear until you close and reopen.
- There's also no toast / success indicator, which makes it look like the click was a no-op.

## Fix

1. **Re-sync the open drawer to the latest store data.** In `MasterSpecs.tsx`, derive the drawer's spec from the store on every render instead of from `useState`:
   - Track only `selectedId: string | null` in state.
   - Compute `const selected = selectedId ? specs.find(s => s.id === selectedId) ?? null : null;`
   - Update everywhere `setSelected(...)` is currently used.
   This way, the moment `refreshMasterSpecStore()` finishes, the drawer rerenders with `tdsUrl`, `tdsSourceTitle`, `tdsScrapedAt`, and any newly filled cure-temp / Tg / etc. values.

2. **Surface success/failure in `ScrapeSpecButton`.** Right now only errors render. Add a short-lived inline status under the button:
   - `success` → "Found TDS" with a small check (1.5s auto-clear).
   - `not_found` → "No TDS found" with the warning color.
   - `failed` → existing error message (already shown).
   Pull these from the `scrapeSpec` return value (`status`, `url`).

3. **Pass an `onDone` callback from the drawer** to `ScrapeSpecButton` so it can also nudge a local state bump (belt-and-suspenders in case the store refresh races with the drawer rerender). No functional impact beyond ensuring the rerender happens.

## Out of scope

- No change to the scrape pipeline itself (Gemini call, schema, overwrite policy) — it's working.
- No change to bulk-scrape behavior.
- No PDF download or storage work (still just storing the URL, as before).

## Files touched
- `src/pages/MasterSpecs.tsx` — switch drawer to `selectedId` + derived spec; pass `onDone`.
- `src/components/ScrapeSpecButton.tsx` — add ephemeral success/not-found status line.
