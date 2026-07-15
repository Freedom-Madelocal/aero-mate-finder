
# Analyze TDS Remediation Plan

Based on the CTO audit. Phase 1 addresses the two most critical items (data accuracy on detail screens + safety/performance foundations for Analyze TDS). Later phases harden the pipeline.

---

## Phase 1 — Correctness & Safety (do first)

Goal: user-facing screens show truthful values, and the analyzer stops corrupting canonical data or exposing itself to abuse.

### 1a. Fix temperature unit display (data accuracy on detail screens)
- All DB columns are already `_c` (Celsius). Change presentation everywhere to either:
  - Convert C→F via a single `cToF()` helper and label `°F`, OR
  - Label the raw value `°C`.
- Apply consistently in `MasterSpecs.tsx`, `Engineer.tsx`, `MaterialDetail.tsx`, and the TDS drawer / compare views.
- Add a small unit test for `cToF`.

### 1b. Kill misleading zeros / false booleans on detail screens
- Update `MasterSpecs.tsx`, `Engineer.tsx`, `MaterialDetail.tsx` renderers so numeric `0` for cure temp, out life, freezer life, Tg, TML/CVCM, mechanicals renders as `—` unless the record has explicit source evidence of a real zero (treat numeric 0 as "unknown" for these fields).
- Booleans: render only `true` chips; do not show `false` as a negative claim.
- One-time data repair: SQL migration to null-out `0` in the above columns where no source evidence exists (start with material 28 / the 3M sheet).

### 1c. Lock down the analyzer endpoint
- `analyzeSpecTds` and the bulk runner: add `assertSuperAdmin(context.userId)` (same guard `tdsUpload.functions.ts` uses) before any storage or model call.
- Return 403 for non-admins.

### 1d. Close the public-write RLS hole on `master_specs`
- Migration: drop the unconditional public `INSERT/UPDATE/DELETE` policies. Replace with `super_admin`-only write policies (via `has_role`). Keep read policy scoped as today.
- Verify server functions using `supabaseAdmin` still function (they bypass RLS).

### 1e. Stop unsafe merge on canonical fields
- In `specTdsAnalyze.functions.ts` merge logic:
  - Text/numeric: write ONLY when the existing DB value is null/empty. Never overwrite curated data.
  - Booleans: unchanged (only non-true → true), but stop writing `false`.
  - Arrays (`profiles`, `key_specs`, `customers`): stop unioning `key_specs` blindly. For now, do not auto-append any ASTM/MIL/test-method strings to `key_specs`; those need explicit qualification evidence.
- Only stamp `tds_analyzed_at` when at least one field actually changed OR record a separate `tds_last_attempted_at` for the timestamp side effect.
- Invalidate `tds_analyzed_at` when the underlying TDS PDF path changes (tdsUpload path).

### 1f. Minimal request hardening
- Add a 60s fetch timeout (AbortController) around the Gemini call.
- Reject PDFs larger than a configured max byte size with a clear error.

### 1g. Prompt tightening (quick win, no schema change)
- Update the system prompt so:
  - `key_specs` only accepts numbers the PDF explicitly states the product is qualified/approved to (not test methods, not tested-substrate specs).
  - Application dry time is NOT `cure_time`. Shelf life is NOT freezer life.
  - Do not emit numeric zero for unknown properties.

**Phase 1 acceptance:** non-admins get 403; RLS blocks non-admin writes to `master_specs`; temperatures render correctly; zero placeholders show `—`; re-running analyzer never overwrites a non-empty curated field.

---

## Phase 2 — Durable, faster batch pipeline

Goal: make the 800-doc run survive browser close and run materially faster.

### 2a. Server-side job queue
- New tables: `tds_analysis_batches`, `tds_analysis_items` (spec_id, document_hash, status, attempts, lease_until, model/prompt version, latency, error).
- New server functions: `enqueueTdsBatch`, `claimNextTdsItem`, `completeTdsItem`, `getBatchProgress`.
- Bulk UI (`BulkAnalyzeTdsButton`) becomes: enqueue → poll progress. Closing the browser does not stop the run.

### 2b. Worker with bounded concurrency
- A public-API route (`src/routes/api/public/tds-worker-tick.ts`, signature-verified) that pulls up to N=3 available items and processes them with per-item timeout, jittered retry, and `Retry-After` handling.
- Trigger via pg_cron on a short interval.

### 2c. Text-first extraction with hash cache
- Compute `sha256(pdf bytes + parser version + prompt version + model)`.
- If a prior extraction exists for that hash → reuse, no model call.
- Otherwise, extract PDF text server-side; only send text (with page markers) to a faster model (`google/gemini-2.5-flash`). Escalate to Pro only when text quality is low or extraction is ambiguous.

### 2d. Per-record cache update
- Completing one item invalidates that spec's query only, not the whole master-spec store.

**Phase 2 acceptance:** browser can close mid-run; unchanged docs re-run with zero model calls; p95 per-doc latency drops materially; dashboard shows per-item status and errors.

---

## Phase 3 — Evidence, review, and typed taxonomy

Goal: canonical data changes are auditable and never silently wrong.

### 3a. Evidence-backed facts
- New tables: `tds_extraction_runs`, `tds_extracted_facts` (field, value, source unit, normalized unit, page, quote, confidence, status).
- Analyzer writes to facts first; canonical patch is applied only when the target field is empty AND confidence ≥ threshold AND deterministic validators pass.

### 3b. Review workflow
- Admin screen to accept/reject/edit low-confidence facts and any proposed replacement of a curated value.
- `master_spec_change_history` (old, new, actor, run_id, reason).

### 3c. Typed identifier / standard taxonomy
- Split what today is `key_specs` into: `qualifications`, `test_methods`, `tested_substrate_specs`, `nsns`, `part_numbers`.
- Migrate existing `key_specs` values into the correct bucket via a scripted, reviewable pass.

### 3d. PDF replacement invalidates prior facts
- On new TDS upload for a spec: new `document_hash` → mark prior facts stale, re-enqueue.

---

## Phase 4 — Schema breadth & code hygiene (ongoing)

- Hybrid property model: keep the small canonical set for filter/rank; add `material_properties` JSONB collection for category-specific fields (solids, viscosity, flash point, storage temp range, shelf life, peel matrix, composition/ingredients).
- Split `specTdsAnalyze.functions.ts` into domain / application / infrastructure modules; single source of truth for the extraction schema (Zod → generated tool schema → DB mapping).
- Remove import of an operation from `AnalyzeTdsButton.tsx` by the bulk runner; both call a shared hook/API.
- Add a minimal test suite: `cToF`, merge policy, prompt-regression golden doc (the supplied 3M PDF), authorization matrix.

---

## Notes / open questions before build

1. For Phase 1b: OK to run a one-time SQL migration that nulls the specific bogus zero fields on all `master_specs` rows where value = 0? Or only material 28 for now?
2. Preferred temperature display: convert to °F everywhere, or label as °C? (Audit recommends either; app currently shows °F labels.)
3. Phase 2 worker cron cadence and concurrency (default: every 30s, concurrency 3) — OK to proceed with those defaults?

I'll start Phase 1 as soon as you approve.
