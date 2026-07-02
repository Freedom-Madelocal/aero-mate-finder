## Goal
Add a "Analyze All TDS PDFs" button to `/master-specs` that runs the existing per-spec AI analysis over every spec with an attached PDF, and skips specs that have already been analyzed unless the user opts to re-analyze.

## Tracking analyzed state

There is no reliable way to infer "already analyzed" from existing columns. Add a single timestamp column:

- Migration: `ALTER TABLE public.master_specs ADD COLUMN tds_analyzed_at timestamptz;`
- Existing `analyzeSpecTds` server fn sets `tds_analyzed_at = now()` in its patch on every successful run (even when 0 fields changed — the PDF has still been analyzed).
- `MasterSpec` type + `rowToSpec` in `src/data/masterSpecs.ts` expose the new field as `tdsAnalyzedAt: string | null`.

## Server fn — `src/lib/specTdsAnalyze.functions.ts`
- Always include `tds_analyzed_at: new Date().toISOString()` in the patch on success (so the update runs even when nothing else changed).
- Return `{ updatedCount, fields, analyzedAt }` so the client can show timestamps.

## UI — `src/pages/MasterSpecs.tsx`

Add a "Analyze All TDS" button in the admin header (super-admin only, matches existing gate). Clicking it:

1. Compute queue = specs where `tdsPdfPath` is set.
2. Split into `pending` (no `tdsAnalyzedAt`) and `alreadyAnalyzed`.
3. Open a small dialog:
   - "N materials have PDFs. M were already analyzed."
   - Options:
     - **Analyze N-M new** (skip already analyzed) — default.
     - **Re-analyze all N** — reruns everything.
     - **Cancel**.
4. Run the chosen queue sequentially through the shared helper `runAnalyzeSpecTds(specId)` (extracted from `AnalyzeTdsButton` — no duplicated logic). Show live progress: `Analyzing 12 / 87 — Toray TC275…` with running tally of updated / unchanged / failed.
5. On 429 wait ~30s then retry once; on any other error record + continue.
6. Cancel button stops after the current item.
7. On finish: summary with a collapsible failures list, then one `refreshMasterSpecStore()` call.

## Single-row button — `src/components/AnalyzeTdsButton.tsx`

- Extract the per-spec call into `runAnalyzeSpecTds(specId)` so bulk + single share code.
- Add a subtle "Analyzed <relative time>" hint under the button when `spec.tdsAnalyzedAt` is set (in the drawer where the button lives).
- Single-row button still always runs; it doesn't need a re-analyze prompt (user explicitly clicked it).

## Guardrails
- Bulk button visible only to super admins.
- Confirmation before starting when the chosen queue is >5 items.
- Disable Upload / Import controls while a bulk run is active.

## Files touched
- New migration adding `tds_analyzed_at` to `master_specs`.
- `src/lib/specTdsAnalyze.functions.ts` — stamp `tds_analyzed_at` on success, return it.
- `src/data/masterSpecs.ts` — expose `tdsAnalyzedAt` on `MasterSpec`.
- `src/components/AnalyzeTdsButton.tsx` — extract shared runner, show analyzed timestamp hint.
- `src/pages/MasterSpecs.tsx` — bulk button, choice dialog, progress modal, cancel + summary.

No RLS/policy changes (existing policies already govern `master_specs`).
