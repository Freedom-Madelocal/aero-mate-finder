## Goal

Apply all 5 prompts from the uploaded PDF to transform the Traceium platform UI to match the mockup, while preserving all existing data and functionality. Keep the platform's Geist font and `oklch(13% 0 0)` background; adopt the mockup's blue accent (`#3B8AFF`), badge colors, chip filters, and card-based layouts.

## Scope (5 prompts)

### 1. Header navigation (replaces sidebar)
- Remove left sidebar in `DashboardLayout.tsx`.
- Add sticky top header (52px, `oklch(16% 0 0)`, 0.5px bottom border):
  - Left: Traceium logo + wordmark
  - Center: tabs — Find materials, Crossover, Compare, Learn, Inventory, Procurement
  - Active tab: 2px `#3B8AFF` underline, weight 600; inactive: 45% opacity, weight 400; 13px
  - Right: product count badge, ⌘K trigger, Settings gear, user avatar
- Main content spans full width.

### 2. Find Materials page (redesign of `/engineer`)
- Rename route surface to "Find materials"; remove "Engineer Workspace" title.
- Full-width search bar at top with mockup styling.
- Left filter panel with **chip-based toggle filters** (replacing dropdowns) in this order:
  1. Product type, 2. Supplier, 3. Chemistry, 4. Process, 5. Application, 6. Segment
- Collapsible "Advanced filtering" section retains the existing dropdown filters (Inventory, NASA E595, Key Spec, Customer, Profile, Reinforcement, Form, Process method).
- Chips: inactive = subtle border + muted text; active = blue border + 10% blue bg + blue text.
- Results area renders products as **cards** (not table rows):
  - Product name + supplier badge + chemistry badge + OoA badge
  - Type · Cure temp · Out-life · Tg line
  - Description line
  - ★ star + Procure checkbox bottom-left
  - Details (solid blue), + Compare (ghost), Crossover (ghost) on right
- Supplier/chemistry/OoA badge colors per spec.
- Product detail modal opens on Details click — shows all existing data fields.

### 3. Crossover page (new `/crossover`)
- Two-column layout with `→` arrow between.
- Left: search input + autocomplete dropdown (any product from any manufacturer) → selected product card.
- Right: list of Traceium equivalent products, best match highlighted with green border.
- Below: "What changes if you switch" 3-column difference cards (OK/warning/neutral) for OoA, cure temp, Tg, out-life, qualification gaps.
- Uses existing crossover/equivalents data from `master_specs` (vendor + crossoverProduct fields).

### 4. Compare page (new `/compare`)
- Side-by-side comparison table, up to 4 products.
- Rows: Dry Tg, Cure temp, Cure time, Out-life, Freezer life, OoA/VBO, Autoclave, AFP/ATL, Available forms, Qualifications, Chemistry (badge).
- First column highlighted blue tint.
- Footer buttons: Export PDF, Request samples, Talk to specialist.
- Compare state via React context; persists across nav; nav tab shows `Compare (N)`.
- "+ Compare" buttons on Find Materials cards populate this state.

### 5. Learn page (new `/learn`)
- 2-col grid of 6 guide cards (emoji + title + subtitle).
- Click → toast "Guide coming soon — content is being authored."
- Blue-bordered "About the data" card below grid.

## Technical Details

- **New files**: `src/routes/crossover.tsx`, `src/pages/Crossover.tsx`, `src/routes/compare.tsx`, `src/pages/Compare.tsx`, `src/routes/learn.tsx`, `src/pages/Learn.tsx`, `src/contexts/CompareContext.tsx`.
- **Edited files**: `src/components/DashboardLayout.tsx` (rip sidebar, add header), `src/pages/Engineer.tsx` (chip filters + card results + modal), `src/styles.css` (add `#3B8AFF` accent, badge tokens, chip tokens — as semantic tokens, not raw hex in components).
- **Design tokens added to `styles.css`**: `--accent-blue`, supplier badge colors (hexcel/toray/syensqo/3m/henkel), chemistry badge colors (epoxy/bmi/cyanate/peek/phenolic), OoA green, warning amber.
- **Compare context** wraps app in `__root.tsx`; max 4 products, FIFO eviction.
- **No backend changes** — pure UI transformation reading existing `master_specs` data.
- Keep all current behavior: star reorder, procure checkbox, auth gating, super-admin routing.

## Out of scope

- Writing actual Learn guide content (cards toast "coming soon" per spec).
- PDF export implementation for Compare (button stub; toast).
- New data ingestion / schema changes.
- Mobile-specific redesign beyond `overflow-x: auto` on the compare table.

## Verification

After implementation: hard-refresh `/engineer`, `/crossover`, `/compare`, `/learn`; confirm header renders, chip toggles filter, cards render with badges, compare counter increments, no console errors.
