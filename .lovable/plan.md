## Goal

Ingest the six uploaded spreadsheets into the (now empty) master spec list, normalizing each vendor's "standard format" into the canonical `master_specs` schema, enriching `profiles[]` from the index sheets, and wiring up crossover relationships from the MultiOEM file.

## What gets ingested per file

```text
File                          Source sheet(s)                  Vendor tag
────────────────────────────  ───────────────────────────────  ──────────
3M_Traceium.xlsx              Master Product List              3M
Henkel_Traceium.xlsx          Master Product List              Henkel
Syensqo_Traceium.xlsx         Master Product List              Syensqo
Toray_Traceium.xlsx           Master Product List              Toray
Hexcel_Traceium.xlsx          HexPly Prepregs +                Hexcel
                              HexFlow HiFlow RTM Resins +
                              HexForce Reinforcements
MultiOEM_Composite_           Prepreg Crossover +              (per column:
  Crossover_Reference-3       Film Adhesive Crossover +         Toray, Hexcel,
                              Thermoplastic Crossover            Syensqo,
                                                                 Henkel, 3M)
```

## Column mapping (canonical "standard format")

For the four straightforward vendor files (3M / Henkel / Syensqo / Toray Master Product List):

```text
Spreadsheet column                  → master_specs field
──────────────────────────────────────────────────────────
Part Number / ID                    → product_name
Full Product Name                   → notes (prefix) + searchable
Brand / Family · Brand              → product_family
Category                            → material_category
Aerospace Segment(s)                → profiles[]  (split on / and ,)
Application Areas                   → applications
Product Type                        → product_form
Key Notes & Features                → notes
Cure Temperature                    → cure_temperature_c (parse °C
                                       from "250°F / 121°C")
Base Chemistry / Resin / Matrix     → resin_chemistry
Dry Tg DMA / Dry Tg or Tm           → dry_tg_onset_c
Cure Time                           → cure_time
Out-Life (Days)                     → out_life_days
Freezer Life (Mo)                   → freezer_life_months
Market Segments (Toray)             → profiles[] (merged)
(file vendor)                       → vendor
(file name)                         → source_document, uploaded_from
```

Hexcel adds: `Weight (gsm)`, `Weave Style`, `Fiber Type / Grade`, `Tow / Yarn`, `Ply Thickness` (HexForce sheet) → packed into `notes` since there are no canonical schema fields for fabric attributes; `reinforcement` gets the fiber type.

## Profile enrichment

After loading each Master Product List row, walk the file's `Segment Quick Reference` sheet. Every (segment, part-number) pair adds the segment to that part's `profiles[]` (case-insensitive dedupe). Segment strings are normalized to short tags by stripping the dash suffix:

```text
"Structures — Composite Fabrication"     → "Structures"
"Interiors — Component Fabrication"      → "Interiors"
"Propulsion / MRO"                       → "Propulsion", "MRO"
"Solid Rocket Motors (SRM)"              → "Solid Rocket Motors"
"Civil Aircraft — Primary Structures"    → "Civil Aircraft"
```

`Category Index` and `Cure Temp Guide` add no new info, so they're skipped.

## MultiOEM crossover ingestion

Each row of `Prepreg Crossover`, `Film Adhesive Crossover`, `Thermoplastic Crossover` lines up equivalent products across Toray, Hexcel, Syensqo, Henkel, 3M. Processing per row:

1. For each non-empty vendor cell, **upsert a master_specs row** keyed on (vendor, product_name). New parts are created; parts already loaded from the per-vendor files merge (existing scalars win, arrays union — the existing `addMasterSpecs` merge logic handles this).
2. Generate a **shared key_specs tag** for the row — derived from the row's "category cluster" (e.g. `XOVER:120C-EPOXY-PREPREG`, `XOVER:175C-FILM-ADHESIVE`). Add it to every product in the row's `key_specs[]`. This makes `Engineer.tsx`'s Key Spec filter group the equivalents together.
3. Populate `crossover_product` / `crossover_vendor` on each row pointing at the most prominent equivalent (first non-self vendor in the row), so the existing crossover field in the spec drawer shows a useful pointer.

## Customers / key specs

Per your decision: leave `customers[]` empty for these uploads; only the MultiOEM file writes `key_specs[]` (the synthetic XOVER tags above). Real BMS/AMS/MIL-PRF numbers will come from a future upload.

## Execution

This is a one-time data import, not a feature. The ingestion runs as a Python script in the sandbox that:

1. Parses all six XLSX files with pandas.
2. Builds the upsert payload exactly as the existing `addMasterSpecs` function expects (same field names, same merge semantics).
3. Writes rows in batches via the `supabase--insert` tool (`INSERT ... ON CONFLICT (vendor, product_name) DO UPDATE`).
4. Logs one `master_spec_uploads` row per source file with `source_type='spreadsheet'` and the file name.

No code changes to the app — the existing PDF/spreadsheet upload UI, Engineer page filters, and crossover drawer all already render these fields.

## Expected row counts

```text
3M Master Product List          ~89 parts
Henkel Master Product List      ~76 parts
Syensqo Master Product List     ~34 parts
Toray Master Product List      ~103 parts
Hexcel HexPly                   ~20 parts
Hexcel HexFlow                   ~9 parts
Hexcel HexForce                 ~70 parts
MultiOEM (new rows after merge)  ~30–60 parts
                               ────────────
                               ~430–460 master spec rows
```

## What you'll see after ingestion

- Master Specs page: ~440 rows across 5 vendors with profile chips (Structures, Interiors, MRO, Propulsion, Civil Aircraft, Launch Vehicles, etc.).
- Engineer page: Profile filter populates immediately. Key Spec filter shows the synthetic XOVER tags from the crossover file (groups equivalent products). Customer filter stays empty for now.
- Spec drawer: Crossover Vendor / Crossover Product fields populated for any product that appears in the MultiOEM file.

## Out of scope

- Customer/OEM tagging (deferred per your decision).
- Real industry key spec numbers like BMS5-101 (deferred until you upload a list with them).
- Mechanical property fields (lap shear, peel, etc.) — these vendor sheets don't include them.
- Editing the spec sheet upload UI — this is a direct backend ingest.
