## Goal

Capture 11 additional material properties (density, modulus, mix ratios, viscosity, areal weight, resin/volatile content, gel time, pot life) end-to-end, so extracted TDS data lands in `master_specs` with provenance.

## Step 1 — Database migration

Additive migration on `public.master_specs` adding all 11 nullable columns exactly as specified (`density_g_cm3`, `tensile_modulus_gpa`, `compressive_strength_mpa`, `mix_ratio_by_weight`, `mix_ratio_by_volume`, `mixed_viscosity_cp`, `areal_weight_gsm`, `resin_content_pct`, `volatile_content_pct`, `gel_time_minutes`, `pot_life_hours`). Existing grants/RLS on the table already cover new columns. After approval the generated types file regenerates so the new columns are typed.

## Step 2 — `src/lib/tdsExtract.server.ts`

- Add the 11 fields to `RowSchema` (line ~211).
- Add matching properties with unit-conversion descriptions to the `TOOL` JSON schema (line ~260).
- Replace the `Units (STRICT …)` block in the `SYSTEM` prompt (line ~411) with the expanded unit rules plus the "Complex tables and category-specific data" guidance.
- Extend `FIELD_MAP` (line ~443) with the 11 AI-key → column → kind tuples, `RANGES` (line ~501) with the plausibility bounds, and `UNIT_FOR` (line ~521) with display units.

Because `buildSafePatch` iterates `FIELD_MAP`, the new columns are written automatically — never overwriting existing non-empty values, dropped when out of range or missing a provenance quote, and recorded in `tds_field_provenance`.

## Step 3 — `src/lib/tdsFastRoute.server.ts`

Mirror the same three additions in the fast text-layer route: new Zod fields, new `FAST_TOOL` properties, and the same unit rules in `FAST_SYSTEM`, so both routes emit identical shapes.

## Step 4 — `src/lib/specPdfExtract.functions.ts` (bulk upload)

- Add the 11 fields to `ExtractedSpecSchema` and to the `ExtractedSpec` interface.
- Add the 11 properties to that file's `TOOL` definition.
- Insert the unit-conversion block into `SYSTEM_PROMPT`.
- Extend `normalize()` using existing `numOrNull` (numeric fields) and `txt` (the two mix-ratio strings).

## Verification

- Run the vitest suite (currently green) plus a `tsgo` typecheck to confirm no missing properties across schemas, `FIELD_MAP`, and generated Supabase types.
- Confirm `buildSafePatch` now returns the new columns in its patch by extending the existing unit tests with a case covering a new field (e.g. `densityGcm3` with provenance, and an out-of-range rejection).

## Notes

- Migration is additive only; no existing data touched, missing values stay `null`.
- Step 2 must land after the migration is approved so the regenerated Supabase types include the columns.
