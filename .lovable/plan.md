## Goal

Upload the `01_By_Material/` PDF folder + `INDEX_all_materials.csv` once, have every PDF auto-attach to its Traceium material row, and expose a "View TDS" link on the Engineer page.

## What already exists

- `tds-pdfs` private storage bucket (super-admin write, authenticated read) — reused as-is.
- `master_specs` table has `tds_pdf_path`, `tds_pdf_size`, `tds_pdf_downloaded_at` columns — reused.
- 898 master_specs rows; `(vendor, product_name)` is unique across all 898.

## What's missing

- No stable integer Material ID on `master_specs` (only UUIDs). The CSV uses IDs 1–898.
- No UI to upload PDFs.
- No UI to view the attached PDF on Engineer cards or the Master Spec drawer.

## Plan

### 1. Schema: add `material_number`

Migration adds `material_number INT UNIQUE` to `master_specs`. Backfilled from the uploaded INDEX CSV during the first import (matched by `vendor` + `product_name`). Once populated, all future re-imports use `material_number` as the join key — no fuzzy matching.

### 2. Admin page: `/admin/tds-upload` (super-admin only)

Two-step wizard:

**Step A — Upload the INDEX CSV.** Parses `Material ID, Vendor, Product, Has TDS PDF, PDF Filename`. Server function:
- For each row, finds the matching `master_specs` row by `(vendor, product_name)`.
- Writes `material_number` on the spec if not already set.
- Returns a preview table: matched / unmatched / already-linked, with counts and a downloadable "unmatched.csv" for the user to fix.

**Step B — Drop the PDF folder.** User drags the `01_By_Material/` folder into a dropzone (HTML `<input webkitdirectory>` supports whole-folder select). For each file:
- Parse the `NNNN_` prefix → `material_number`.
- Client requests a signed upload URL from a server function; server verifies caller is super-admin, then uploads directly to `tds-pdfs/{material_number}/{original_filename}`.
- On success, server function updates the matching spec's `tds_pdf_path`, `tds_pdf_size`, `tds_pdf_downloaded_at`.
- Progress bar with per-file status (uploaded / skipped / failed). Idempotent — re-uploads overwrite the same path.

### 3. Surface the PDF on Engineer + Master Spec drawer

- Engineer card: when `tds_pdf_path` is set, show a small "TDS" pill/link. Clicking calls a server function that returns a short-lived signed download URL, then opens it in a new tab.
- Master Spec detail drawer: same "View TDS" link near the header, plus filename and uploaded date.

### 4. Storage layout

```text
tds-pdfs/
  0002/0002_1035_Hexcel_E-Glass_E595.pdf
  0004/0004_1078-1_Hexcel.pdf
  ...
```

Zero-padded folder per material — easy to spot in the bucket, avoids collisions on filename changes.

## Technical notes

- Migration only adds one nullable column; safe on the existing 898 rows.
- All server functions gated by `has_role(auth.uid(), 'super_admin')` before touching storage or writing paths.
- Uploads go browser → Supabase Storage directly via signed URL, not through a server function body, so 800 × ~1 MB PDFs don't hit any request-size limits.
- CSV parsing done client-side with a small parser (no new dep needed).
- Unmatched rows are logged in a temporary in-memory report the admin can export — no new audit table needed unless you want one later.

## Out of scope (say so if you want it in)

- Multiple PDFs per material (TDS + PDS + SDS). Current plan is one TDS per spec, overwrite on re-upload.
- Auto-diff / versioning of PDF revisions.
- Backfilling `material_number` from anything other than the INDEX CSV.
