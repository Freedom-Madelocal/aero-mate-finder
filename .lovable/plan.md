## Goal

Extend the "Upload Spec Sheet" flow on the Master Specs page so users can drop a **PDF** in addition to CSV/XLSX. The PDF is sent to a server function that uses Lovable AI (Gemini 2.5 Pro) to extract a product table, including profile tags (e.g. MRO, Interiors) inferred from PDF section headings. The user reviews the extracted rows in the existing mapping/preview step and accepts or rejects them.

## Schema changes

`master_specs` table:
- Add `profiles text[] not null default '{}'` — a row can belong to multiple profiles.
- Add a GIN index on `profiles` for fast filtering.

`master_spec_uploads` table:
- Add `source_type text not null default 'spreadsheet'` (`'spreadsheet' | 'pdf'`) for audit.

No RLS changes (existing public policies on these tables are unchanged).

## Backend: PDF extraction server function

New file `src/lib/specPdfExtract.functions.ts` (TanStack `createServerFn`, POST, `requireSupabaseAuth`):

- Input: `{ fileBase64: string, fileName: string }` (validated with Zod, size capped ~15 MB).
- Calls Lovable AI Gateway (`google/gemini-2.5-pro`) with the PDF as an inline part and a strict tool-call schema (`extract_specs`) so the model returns structured JSON, not prose.
- System prompt instructs the model to:
  - Walk the document section by section, treating section/category headings (e.g. "MRO", "Interiors", "Structural") as **profiles**.
  - Emit one row per product, with every numeric/text field mapped to the existing `MasterSpec` fields used by `SpecSheetUpload`.
  - For any missing field, return the literal string `"none given"` (numbers stay null; the UI surfaces "none given" for text fields and renders nulls as "none given" badges).
  - Attach `profiles: string[]` per product based on the heading(s) the product appears under. A product that appears under multiple sections gets multiple profile tags.
- Returns `{ rows: ExtractedSpec[], profilesDetected: string[] }`.
- Surfaces 429 / 402 from the gateway as friendly errors.

## Frontend: SpecSheetUpload changes (`src/components/SpecSheetUpload.tsx`)

- Accept `.pdf` in the dropzone, file picker, and validation.
- Branch in `parseFile`:
  - Spreadsheet path: unchanged.
  - PDF path: read as base64, call the new server function, show a "Analyzing PDF with AI…" state, then jump to **Step 2** with rows pre-mapped (skip the column-mapping table since the AI returns canonical fields). Instead show a **review table** of extracted rows with their `profiles` chips and a per-row checkbox to accept/reject. Bulk select-all/clear at the top.
- "Add N rows to master list" button ingests only checked rows via the existing `addMasterSpecs` helper, plus the new `profiles` array. Records `source_type='pdf'` on the upload row.
- `addMasterSpecs` (`src/data/masterSpecs.ts`) and the `MasterSpec` type get a `profiles?: string[]` field wired through to the insert payload.

## Frontend: Master Specs page filter (`src/pages/MasterSpecs.tsx`)

- Compute the union of all `profiles` across loaded specs.
- Render a chip row above the table: "All" + one chip per profile. Multi-select; a row matches if **any** of its profiles is selected. Empty selection = no profile filter.
- Show profile chips in the row detail view.

## Review-table UX (Step 2 for PDFs)

```text
┌─ filename.pdf — 42 products extracted ────────────────────┐
│ [Select all] [Clear]                                       │
├────┬─────────────────┬───────────────┬──────────────────┐
│ ✓  │ Vendor          │ Product       │ Profiles         │
├────┼─────────────────┼───────────────┼──────────────────┤
│ ☑  │ Henkel          │ EA 9395       │ [MRO] [Repair]   │
│ ☑  │ 3M              │ Scotch-Weld…  │ [Interiors]      │
│ ☐  │ none given      │ none given    │ [Structural]     │
└────┴─────────────────┴───────────────┴──────────────────┘
[ Cancel ]                       [ Add 38 selected to master list ]
```

Rows with missing `vendor` or `product_name` are unchecked by default and flagged with an "incomplete" badge so the user knows to fix them externally.

## Out of scope

- Editing extracted rows inline (user accepts/rejects only this iteration; can re-upload a corrected PDF or edit via existing Master Specs editing).
- Persisting the PDF file itself (only extracted data is stored).
