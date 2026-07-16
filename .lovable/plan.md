# TDS Extraction Accuracy + Preflight — Phased Plan

## Phase 2A — Schema, provenance, and admin-guarded correction (this turn)

Additive migration only. No changes to existing extraction behaviour yet, so
the running queue is never broken by a half-shipped prompt/schema pair.

1. **Migration `20260716_tds_accuracy_foundation`**
   - Add to `master_specs`: `application_process text`, `shelf_life_months numeric`,
     `storage_temp_min_c numeric`, `storage_temp_max_c numeric`,
     `active_ingredient_or_resin text`.
     (`product_form` already exists.)
   - Rename read model for the classified standards. Keep the legacy
     `qualifications_standards text` column intact (backward compat) and add:
     - `qualifications jsonb` — product-conformance standards only, each
       `{ standard, revision?, class?, type?, evidence_quote?, page? }`.
     - `test_methods jsonb` — `{ method, evidence_quote?, page? }[]`.
     - `contextual_standards jsonb` — `{ standard, role, evidence_quote?, page? }[]`
       (e.g. tested-substrate coating).
     - `product_identifiers jsonb` — `{ kind, value, applicability?, evidence_quote?, page? }[]`
       (NSN, CAGE, part numbers).
     - `test_results jsonb` — structured multi-dim tables preserved with
       `{ name, conditions, rows: {label, value, units}[], evidence_quote?, page? }[]`.
   - New `tds_extraction_runs` (log of every extraction attempt with route,
     model, pages, input bytes, latency, cache status, cost estimate,
     cancellation flag).
   - New `spec_corrections` (audit trail; row_id, expected_document_hash,
     before jsonb, after jsonb, actor, evidence text, created_at).

2. **Zod schema + types** — extend `TdsExtractionSchema` in
   `src/lib/tdsExtract.server.ts` with the new grouped shapes. Do not remove
   `qualifications_standards` from the merge yet; write both (structured +
   legacy comma-joined string) so existing UI keeps rendering.

3. **Merge/canonical write** — never overwrite curated values; treat
   legacy `0` as missing only for temperature/time fields where zero is a
   sentinel (`cure_temperature_c`, `out_life_days`, `freezer_life_months`,
   `shelf_life_months`, `storage_temp_*`). Preserve zero for `tml_pct`,
   `cvcm_pct`, mechanical properties.

4. **3M Adhesion Promoter 86A correction** — new
   `src/lib/spec3MAdhesionPromoter86A.functions.ts` with
   `previewCorrection86A()` and `applyCorrection86A()`, super-admin only,
   requiring immutable row id and expected TDS document hash. Writes to
   `spec_corrections` and updates the row with the exact evidenced values
   from the request. Refuses mismatched id/hash.

5. **Tests**
   - Standards classification (ASTM D1000 → test method; MIL-PRF-85285 Type IV
     → contextual; MIL-PRF-XYZ "conforms to" → qualification).
   - Null preservation (legacy `0` on cure/out/freezer maps to `null`,
     `tml_pct=0` stays `0`).
   - Unit normalization (60–80 °F → 16–27 °C with source preserved).
   - Curated-value conflict (curated row not overwritten by extraction).
   - 3M correction guard (wrong hash → refuse; correct hash → audited write;
     10-minute drying step not written to `cure_time`).

## Phase 2B — Preflight + fast text-layer route (next turn)

- Extract PDF metadata (signature, size, page count, encryption, text-layer
  coverage) once via `pdfjs-dist` server helper; cancellation-aware.
- New route selector: text-layer PDFs → compact page-labelled text into a
  fast structured chat model (default: `google/gemini-3.1-flash-lite`);
  scanned / low-text / table-heavy pages → keep vision on
  `google/gemini-2.5-pro`.
- Chunking + deterministic merge with page/quote provenance; no silent
  truncation.
- Stage-specific timeouts (fetch 15 s, parse 20 s, model call 60 s); on
  timeout, retry with reduced chunk size, not the identical full-PDF POST.
- Record every attempt in `tds_extraction_runs`.

## Phase 2C — UI (after 2B is proven)

- Master Specs detail: render qualifications / test methods / contextual
  standards / identifiers / test-results tables from the new jsonb columns,
  with provenance popovers. Edit forms accept the new nullable canonical
  fields. No changes to Engineer / customer surfaces.

---

## Confirm before I execute Phase 2A

- Ship Phase 2A now as described (additive migration + schema/merge/tests +
  3M correction) and defer preflight/route selection and UI to 2B/2C?
- Or restructure the ordering?
