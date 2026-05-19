## Goal
Replace the current flat filter sidebar on `/engineer` with a structured two-tier layout: a primary block of 6 fixed chip filters in a specific order, then a collapsible "Advanced filtering" section containing the existing filters. Prompt 2 from the earlier batch was not implemented — this plan does it.

## New sidebar structure

### Tier 1 — Primary filters (always visible, fixed chip vocabularies)

Chips are hard-coded (NOT derived from data), in this order:

1. **Product type** → matches `materialCategory` / `productForm` via keyword: `Prepreg`, `Film adhesive`, `Paste adhesive`, `Fabric`, `RTM`
2. **Supplier** → matches `vendor` exactly: `Hexcel`, `Toray`, `Syensqo`, `3M`, `Henkel`
3. **Chemistry** → matches `resinChemistry` via keyword: `Epoxy`, `BMI`, `Cyanate ester`, `PEEK`, `PEKK`, `LMPAEK`, `Phenolic`
4. **Process** → matches `processMethod` / `ooaVboCapable` flag: `OoA / VBO`, `Autoclave`, `AFP / ATL`, `RTM / Infusion`
5. **Application** → matches `applications`/`notes` keywords: `Primary structure`, `Secondary structure`, `Interior / FST`, `Engine / hot zone`, `Radome / antenna`
6. **Segment** → matches `applications`/`customers`/`notes` keywords: `Commercial aircraft`, `Military`, `Space & satellite`, `Launch vehicle`, `UAM / eVTOL`

Each group renders as a wrap of toggle chips (multi-select). Visual style matches existing chip buttons. A small "clear" appears next to the group title when any chip in that group is active.

### Tier 2 — Advanced filtering (collapsed by default)

Single `<details>` panel labeled "Advanced filtering" (chevron, click to expand). Contains, in this order, the EXISTING filters with their current behavior:

- Inventory (Any / In Stock / Tracked / Not Stocked)
- NASA E595 (Any / Pass / Fail)
- Key Spec (chip multi-select from data)
- Customer (chip multi-select from data)
- Profile (chip multi-select)
- Reinforcement (chip multi-select from data)
- Form (chip multi-select from data)
- Process Method (chip multi-select from data — kept for power users)
- Cure Temp, Peak Tg, Max Service Temp, Out Life, TML, CVCM (range inputs)
- Process Flags (REQUIRED / EXCLUDE / ANY tri-state)

No behavior changes inside Advanced — only the wrapping `<details>` collapse.

## Implementation

### File: `src/pages/Engineer.tsx`

1. **Add new filter state slices** to `FilterState`:
   - `productTypes: string[]`, `suppliers: string[]`, `applications: string[]`, `segments: string[]`
   - Reuse `chemistries` for Chemistry (rename UI label only). Keep `processMethods` for Advanced; add new `processGroups: string[]` for the Tier-1 Process chips so the two don't conflict.

2. **Add hard-coded chip vocabularies** as module-level constants (`PRODUCT_TYPES`, `SUPPLIERS`, `CHEMISTRY_GROUPS`, `PROCESS_GROUPS`, `APPLICATION_GROUPS`, `SEGMENT_GROUPS`) plus a `KEYWORDS` map of regex per chip for fuzzy matching against the relevant spec fields.

3. **Extend `matched` memo** to AND the six new chip groups. Each group: if any chip selected, spec must match at least one selected chip's regex against the relevant joined field string.

4. **Rebuild the sidebar JSX** (lines ~421-600):
   - Replace the existing list of `ChipFilter` / `FilterSection` / `RangeFilter` calls with:
     - A `<div className="space-y-4">` containing six new `<ChipGroup>` blocks (new tiny component for fixed chips, or reuse `ChipFilter` with `options={[...PRODUCT_TYPES]}`).
     - A `<details className="...">` labeled "Advanced filtering" wrapping all current Inventory / E595 / Key Spec / Customer / Profile / Reinforcement / Form / Process Method / range / flag controls — collapsed by default.

5. **Update `clearFilters`** to also reset the four new slices.

6. **Update `activeFilterCount`** to include the four new slices.

7. Keep the top full-width search bar and the secondary "Search any text…" input unchanged.

### Out of scope
- No backend / data schema changes.
- No changes to results table, drawer, procurement, or any other page.
- Existing chip data sources (vendors, chemistries, etc.) remain available inside Advanced.

## Verification
- Sidebar shows the six chip groups in the exact order specified.
- "Advanced filtering" is collapsed by default; clicking expands and shows all previous filters with current behavior intact.
- Selecting e.g. Supplier → Hexcel narrows results to vendor "Hexcel"; selecting Application → "Primary structure" narrows by keyword in applications/notes.
- Clear-all and active-count badge reflect the new chip groups.
