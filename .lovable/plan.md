## Goal
On every master spec that has a TDS PDF attached, add an "Analyze TDS" button that uses AI to read the PDF and fill in the spec's technical detail fields (the ones the platform already shows). No new fields are added — only existing ones on the master_specs row are updated, and only where the AI finds a value.

## New server function — `src/lib/specTdsAnalyze.functions.ts`

`analyzeSpecTds({ specId })` — auth-gated (`requireSupabaseAuth`):

1. Load the master spec row by id; require `tds_pdf_path`.
2. Download the PDF from the `tds-pdfs` storage bucket via `supabaseAdmin` (dynamic import inside the handler, per server-side-modern rules).
3. Base64-encode the bytes and POST to Lovable AI Gateway (`google/gemini-2.5-pro`) with a single-row tool-calling schema — reuse the field list and system-prompt style from `specPdfExtract.functions.ts`, but instruct the model to return exactly one row for the named vendor + product.
4. Merge into the existing row using the same "keep existing when new value is missing" rules already used by `addMasterSpecs`:
   - Text: overwrite when AI returns a non-empty, non-"none given" string.
   - Number: overwrite when AI returns a finite number.
   - Boolean: overwrite only when AI explicitly returns `true` (avoid flipping true → false on a silent PDF).
   - Arrays (`key_specs`, `profiles`, `customers`, `qualifications_standards` string): union with existing.
5. `UPDATE public.master_specs` for that id and return the updated field list + count.

Vendor / productName / material_number / tds_pdf_path / crossover / notes / frequent_reorder / engineer_default_name are **not** touched.

## UI — button placement

Both drawers already show a "Technical Data Sheet" card with a "View PDF" button:

- `src/pages/MasterSpecs.tsx` around line 428
- `src/pages/Engineer.tsx` around line 1336

Add an "Analyze TDS" button next to "View PDF" in the same card. On click:
- Show inline spinner state ("Analyzing…"), disable the button.
- Call `analyzeSpecTds({ data: { specId: spec.id } })`.
- Toast success with count of fields updated; toast error with server message.
- Call `refreshMasterSpecStore()` so the drawer re-reads the fresh row.

Only shown when `spec.tdsPdfPath` is present (matches existing View PDF gating). On `/engineer`, the button appears for admins/engineers exactly where View PDF appears today — no separate permission gate is added.

## Files touched
- Create `src/lib/specTdsAnalyze.functions.ts` (new server fn).
- Edit `src/pages/MasterSpecs.tsx` (add button + handler in the TDS card).
- Edit `src/pages/Engineer.tsx` (add button + handler in the TDS card).

No DB migrations, no schema changes, no new columns.
