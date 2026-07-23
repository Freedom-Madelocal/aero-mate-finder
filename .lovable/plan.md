# Master Specs Data Audit & Manual Review

Admin-console-only tooling to (1) see TDS coverage at a glance, (2) verify detail-screen data against the attached PDF, (3) track which materials a human data worker has checked, and (4) let admins hand-edit fields with the PDF open beside them — with a full "who edited what, when" audit trail.

## What we're building

### 1. TDS coverage & review dashboard (new page: `/admin/data-audit`)

A single admin page with three counters and a filterable table of every master spec:

- **With TDS PDF** / **Without TDS PDF** / **Total**
- **Reviewed** / **Needs review** / **Flagged**
- Filters: has PDF, review status, reviewer, last-edited-by, vendor
- Row actions: **Open review** (opens the split-screen editor below), **Mark checked**, **Flag**

### 2. Review status on every material

New per-spec fields:
- `review_status`: `unreviewed` | `in_review` | `checked` | `flagged` (default `unreviewed`)
- `reviewed_by`, `reviewed_at`, `review_notes`

Shown as a colored pill in the Master Specs list and in the new dashboard. Only admins see it. `/engineer` is untouched.

### 3. Split-screen manual editor (admin-only, on Master Specs detail)

New **"Review & Edit"** button in the Master Specs `SpecDrawer` (super-admin only, next to the existing Data Audit button). Opens a full-screen two-pane workspace:

- **Left pane:** the TDS PDF (reuses existing `TdsPdfViewer`). If no PDF is attached, shows an upload slot.
- **Right pane:** every editable field from the detail panel as inline inputs — identity, storage, cure/temp, qualifications, test results, etc. Each field shows the current value, its provenance badge (AI/manual/seed), and a small "override" input.
- Footer: **Save changes**, **Mark as checked**, **Flag with note**, **Cancel**.
- Not surfaced anywhere in `/engineer`.

### 4. Full edit audit trail

Every manual edit writes one row per changed field to a new `spec_manual_edits` table: spec id, field, old value, new value, editor user id, timestamp, optional note. In the Data Audit Drawer (already exists) we add a new **"Manual edits"** section listing the trail so admins can see who last touched each field and what they changed. The existing AI provenance section stays as-is; manual edits are additive and always win over AI on the "last writer" display.

### 5. Data-vs-PDF match indicator (lightweight)

For each field with AI provenance we already store `source_page` and `source_quote`. In the split editor, next to each field, we show a small "verify" chip: click it to jump the PDF pane to `source_page` and highlight the quote. The reviewer then either accepts the value (leave as-is), edits it, or flags it. No new AI work — we're just wiring existing provenance to the PDF viewer.

## Access control

Everything above is gated to `super_admin` (same gate as the existing admin console). Regular authed users and `/engineer` see nothing new. Server functions re-check the role; RLS on the new tables restricts writes to super-admins and reads to the owning admin scope.

## Out of scope for this plan

- Assigning materials to specific data workers / queues (can add later once the flag/checked flow is in use)
- Bulk CSV import of manual corrections
- Re-running AI extraction from the editor (already exists as a separate control)

## Technical details

**Migration (additive):**
- `master_specs`: add `review_status` (enum), `reviewed_by uuid`, `reviewed_at timestamptz`, `review_notes text`.
- New `spec_manual_edits` table: `id`, `spec_id`, `field`, `old_value jsonb`, `new_value jsonb`, `edited_by`, `edited_at`, `note`. GRANTs for `authenticated` + `service_role`; RLS: SELECT/INSERT only when `has_role(auth.uid(),'super_admin')`.
- Trigger on `master_specs` UPDATE by an admin path: not automatic — writes go through a server fn (`updateSpecFields`) that logs each changed field into `spec_manual_edits` in one transaction, so we capture intent and note.

**Server functions (`src/lib/specManualReview.functions.ts`, new):**
- `listSpecsForReview({ filters, page })` — powers the dashboard; returns coverage counters + paginated rows.
- `updateSpecFields({ specId, changes: Record<field, newValue>, note? })` — super-admin only; diffs against current row, writes patch + audit rows atomically.
- `setReviewStatus({ specId, status, note? })` — logs status change into audit trail too.
- `listManualEdits({ specId })` — feeds the Data Audit Drawer's new section.

**UI:**
- New route `src/routes/admin.data-audit.tsx` + page `src/pages/admin/DataAudit.tsx` (counters, filters, table).
- New component `src/components/SpecReviewWorkspace.tsx` (split-screen PDF + editable form), opened from the existing Master Specs `SpecDrawer`.
- Extend `DataAuditDrawer.tsx` with a "Manual edits" section.
- Sidebar link under Admin → "Data Audit".

**Types:** regenerate Supabase types after the migration runs; update `MasterSpec` in `src/data/masterSpecs.ts` with the four new fields.

## Rollout order

1. Migration (schema + RLS + GRANTs).
2. Server functions + types.
3. Admin dashboard page.
4. Split-screen editor + audit-drawer "Manual edits" section.
5. Wire "verify" chip to jump PDF viewer to `source_page`.
