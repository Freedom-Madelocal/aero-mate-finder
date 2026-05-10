# Procurement Workflow + Spec-Driven Compliance

## 1. Navigation cleanup
Hide **Dashboard, Compliance, Documents, Suppliers, Orders** from `DashboardLayout` sidebar (routes stay so direct URLs still work). Add **Procurement** nav item. Default landing route changes from `/` → `/engineer` (or `/master-specs`).

## 2. Compliance data on every product
Compliance is already partially captured on `master_specs` (`qualifications_standards`, `nasa_e595` via `tml_pct`/`cvcm_pct`, `flame_retardant`, etc.). Add a dedicated **Compliance** section to:
- Master Spec drawer (existing) — group fields under "Compliance & Qualifications".
- Engineer result row → click opens a side drawer with full spec sheet + compliance tab.

No schema change needed; just UI grouping.

## 3. Engineer search — all-spec filters
Replace today's narrow filter set with a **filter panel** keyed off every queryable `master_spec` column:
- Text search (vendor, product_name, applications, qualifications, notes)
- Multi-select chips: material_category, resin_chemistry, reinforcement, product_form, process_method
- Numeric range sliders: cure_temperature_c, peak_tg_c, max_service_temperature_c, out_life_days, tml_pct, cvcm_pct
- Boolean toggles: ooa_vbo_capable, toughened, flame_retardant, low_dielectric, low_moisture_absorption, impact_resistant, high_temperature
- Inventory status filter: In Stock / Tracked / Not Stocked

## 4. Engineer result row controls
Each row gains:
- **Procure** checkbox (header = column label + select-all)
- **Star** icon (Phosphor-style filled star SVG provided) — toggles "frequent reorder" flag on the spec
- **Engineer note** — small inline input for "needed for" context (optional)
- **Supplier select** — defaults to spec.vendor; lets engineer override if a crossover vendor is preferred

Checking "Procure" creates a `procurement_requests` row.

## 5. New tables

```sql
-- One row per engineer pick
procurement_requests (
  id uuid pk,
  master_spec_id uuid fk → master_specs,
  engineer_name text,            -- free text for now (no auth)
  chosen_vendor text,            -- defaults to spec.vendor
  quantity text,                 -- free text ("2 rolls", etc.)
  note text,
  status text default 'pending', -- pending | sent | fulfilled | cancelled
  created_at, updated_at
)

-- Vendor email contacts
vendor_contacts (
  id uuid pk,
  vendor text unique,
  contact_name text,
  email text not null,
  notes text,
  created_at, updated_at
)

-- Frequent-reorder flag on master_specs
ALTER TABLE master_specs ADD COLUMN frequent_reorder boolean default false;
ALTER TABLE master_specs ADD COLUMN engineer_default_name text; -- last engineer who starred it (optional)

-- Procurement send log
procurement_sends (
  id uuid pk,
  vendor text,
  email text,
  request_ids uuid[],
  body text,
  sent_at timestamptz default now()
)
```

All public RLS (consistent with current setup).

## 6. `/procurement` page
Two stacked sections:

**A. Active Pick List** (default)
- Table of `procurement_requests` where status = 'pending'
- Columns: Engineer · Vendor · Product · Spec summary · Qty · Note · Status · Remove
- Sort by engineer or vendor (clickable headers)
- **Procure** button (top): groups pending requests by `chosen_vendor`, looks up `vendor_contacts.email`, sends one email per vendor listing all parts. Marks rows `status = 'sent'`.

**B. Frequent Reorder list** (toggle slider)
- Reads `master_specs WHERE frequent_reorder = true`
- Same vendor grouping; "Add to pick list" button per row

**Settings gear** (bottom-right) → opens dialog managing `vendor_contacts` (add / edit / delete vendor + email).

## 7. Procurement email
Use **Lovable Cloud email infrastructure** (transactional). Steps:
1. Check email domain status; if none, prompt setup.
2. Scaffold transactional email + register `vendor-procurement-request` template (vendor name, list of items, engineer notes).
3. "Procure" button calls a server function that:
   - Aggregates pending requests by vendor
   - Looks up vendor email
   - Sends one email per vendor via `sendTransactionalEmail`
   - Logs to `procurement_sends`
   - Updates request statuses

If user prefers to skip email setup now, the button can also generate `mailto:` links as a fallback — will ask.

## Files to touch / create
- `supabase/migrations/...` — new tables + columns
- `src/components/DashboardLayout.tsx` — hide nav items, add Procurement
- `src/data/procurement.ts` — new store (requests, vendor contacts, frequent reorder)
- `src/data/masterSpecs.ts` — add `frequent_reorder` field + toggle helper
- `src/pages/Engineer.tsx` — full filter panel, checkbox/star columns, drawer
- `src/pages/MasterSpecs.tsx` — compliance grouping, frequent_reorder badge
- `src/pages/Procurement.tsx` (new) + `src/routes/procurement.tsx`
- `src/components/VendorContactsDialog.tsx` (new)
- `src/routes/index.tsx` — redirect to `/engineer`
- Email template + send helper (if email path approved)

## Out of scope
- Authentication (engineer name stays free-text)
- Real ERP/PO integration
- Quantity unit normalization
