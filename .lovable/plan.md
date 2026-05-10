## Goal

Introduce a canonical "Master Spec List" — the engineer-facing catalog of every aerospace material spec we know about — separate from the operational `materials` (inventory) table. Engineers search the master list; when a row also exists in inventory, it's badged accordingly.

## 1. Database — new `master_specs` table

Mirror the 36 columns of `Aerospace_Materials_Master_Dataset.csv`. Snake_cased columns, TEXT for free-form fields, NUMERIC where the dataset is numeric, BOOLEAN for the Yes/blank flag columns.

Columns (grouped):

- **Identity**: `id` (uuid pk), `vendor`, `product_name`, `product_family`, `material_category`
- **Chemistry / form**: `resin_chemistry`, `reinforcement`, `product_form`
- **Cure**: `cure_temperature_c` (numeric), `cure_time` (text — values like "90 min")
- **Thermal**: `dry_tg_onset_c`, `wet_tg_c`, `peak_tg_c`, `max_service_temperature_c` (all numeric)
- **Storage**: `out_life_days` (numeric), `freezer_life_months` (numeric)
- **Outgassing**: `tml_pct`, `cvcm_pct` (numeric)
- **Mechanical**: `tensile_lap_shear_mpa`, `t_peel_n_per_25mm`, `flatwise_tension_mpa`, `climbing_drum_peel_in_lb_per_in` (numeric)
- **Process flags**: `process_method`, `ooa_vbo_capable` (bool), `toughened` (bool), `flame_retardant` (bool), `low_dielectric` (bool), `low_moisture_absorption` (bool), `impact_resistant` (bool), `high_temperature` (bool)
- **Context**: `applications`, `qualifications_standards`, `crossover_product`, `crossover_vendor`, `notes`, `minimum_order_quantity`, `source_document`
- **Provenance**: `uploaded_from` (text — file name, null for the seed), `created_at`, `updated_at`

RLS: same permissive read/write as `materials` (no auth yet). A unique index on `(vendor, product_name)` so re-uploads upsert cleanly.

A second tiny table `master_spec_uploads` (id, file_name, uploaded_at, row_count) tracks each upload, parallel to `stock_reports`.

## 2. Seed data

Parse the uploaded CSV server-side once and insert all 203 rows via the migration's seed step. Cure-temp, Tg, etc. get cast to numeric; "Yes" → true, blank → false for the flag columns; semicolon/pipe-delimited applications stay as text for now.

## 3. New page: `/master-specs` ("Master Spec List")

Route file `src/routes/master-specs.tsx` + page component `src/pages/MasterSpecs.tsx` styled to match the existing dark Material Intelligence aesthetic.

Layout:

- Header with title, subtitle ("Canonical aerospace material spec catalog — search, compare, and qualify.") and a primary "Upload Spec Sheet" button.
- Top metric strip: total specs, vendors, categories, # in inventory.
- Filter bar: search box (vendor / product / family / chemistry / applications), and dropdowns for Vendor, Material Category, Resin Chemistry, Product Form, OOA Capable.
- Table columns (default, others behind a column toggle): Vendor, Product, Category, Chemistry, Form, Cure °C, Max Service °C, Tg °C, OOA, Out Life, Freezer Life, **In Inventory** badge, Source.
- Click a row → side drawer / detail view with the full 36-field spec sheet, qualifications, crossovers, and any matching inventory lots.

"Upload Spec Sheet" reuses a generalized version of the existing `StockReportUpload` component (same XLSX/CSV parser, same auto-mapping flow). Mappings are aimed at the master-spec schema; unrecognized columns are flagged but not stored (master schema is fixed). On confirm: rows upsert into `master_specs` keyed on `(vendor, product_name)` and the upload is logged in `master_spec_uploads`.

Add nav entry "Master Specs" (BookOpen icon) to `DashboardLayout` between Engineer and TSM Compliance.

## 4. Inventory linkage

Each `master_specs` row is matched to inventory by reusing `fuzzyMatch(product_name, materials.product)` plus exact vendor match (case-insensitive). The match is computed client-side from the two stores so no schema-level FK is required and re-uploads on either side stay loosely coupled.

Result surfaced as:

- A green "In Inventory" pill in the Master Spec table
- On the detail drawer: link to `/material/$id` and a mini summary (available qty, active lots) for the matched inventory item

## 5. Engineer page rework

Switch the Engineer page's primary data source from `useMaterialStore().materials` to the master spec catalog:

- Reverse-lookup search filters (service temp, chemistry, OOA, NASA E595, applications) run against `master_specs`.
- Each result card shows the spec sheet preview plus an inventory badge:
  - **In Stock** (green) if a matching inventory row exists with `available_qty > 0`
  - **Tracked** (muted) if the material exists in inventory but is out of stock
  - **Not Stocked** (subtle) if no inventory match — with a "Request Sourcing" CTA
- "Save Kit" continues to work; saved kits reference `master_spec.id` so they survive inventory changes.

## 6. Data layer changes

`src/data/masterSpecs.ts` — mirrors the pattern in `src/data/materials.ts`:

- `MasterSpec` type
- `useMasterSpecStore()` hook hydrating from Supabase
- `addMasterSpecs(specs, upload)` upsert helper used by the spec uploader
- `getInventoryMatch(spec, materials)` helper returning `{ status: "in-stock" | "tracked" | "none", material? }`

Engineer page imports `useMasterSpecStore` and `useMaterialStore` together.

## Out of scope

- Authentication / per-user spec lists (still permissive RLS pending the auth pass)
- COA/COC document linkage from master specs
- AI-assisted natural-language spec search

## Technical notes

```text
src/
  data/
    masterSpecs.ts          (new — Supabase-backed store)
  pages/
    MasterSpecs.tsx         (new)
    Engineer.tsx            (refactor to use master spec store)
  routes/
    master-specs.tsx        (new file route → /master-specs)
  components/
    StockReportUpload.tsx   (extract upload modal into a reusable
                             SpreadsheetUpload with a `mode` prop:
                             "stock-report" | "master-spec")
    DashboardLayout.tsx     (add Master Specs nav item)

supabase migration:
  - create master_specs (36 fields + uploaded_from + timestamps)
  - create master_spec_uploads
  - unique(vendor, product_name) on master_specs
  - permissive RLS policies (read/insert/update/delete)
  - seed 203 rows from the attached dataset
```
