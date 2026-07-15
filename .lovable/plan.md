# Phase 3 — Extractor Accuracy, Data Quality UI, Observability

Three tracks. Ship in order; each is independently valuable.

## 3a. Extractor accuracy pass

Goal: fewer wrong numbers, no unit confusion, every extracted value is auditable.

**Prompt + schema changes (`src/lib/tdsExtract.server.ts`)**
- Rewrite the Gemini prompt to be explicit:
  - All temperatures MUST be returned in Celsius. If the TDS lists °F, convert before returning. Never return a value where the unit is ambiguous.
  - All pressures in psi, all times in minutes, all densities in g/cm³, all viscosities in cP (document the canonical unit per field).
  - If a value is not stated on the TDS, return `null` — never guess, never return `0` as a placeholder.
- Expand the structured-output schema so every extracted numeric field is an object, not a bare number:
  ```
  cure_temperature_c: { value: number|null, source_page: number|null, source_quote: string|null, confidence: "high"|"medium"|"low" }
  ```
- Post-processing (server, before merge):
  - Plausibility gate per field (e.g. cure temp 20–400 °C, tg 20–400 °C, density 0.5–3.0). Values outside range → dropped + logged.
  - Reject fields with `confidence: "low"` unless the target column is empty.
  - Reject fields where `source_quote` is missing.
- Persist provenance: new `tds_field_provenance` table (spec_id, field, value, unit, source_page, source_quote, confidence, model, prompt_version, extracted_at). Upsert on `(spec_id, field)`.
- Bump `PROMPT_VERSION` so cached extractions from the old prompt are not reused.

**Model**
- Keep `google/gemini-2.5-pro` for extraction (multimodal + long context). No change requested.

## 3b. Detail-screen data quality UI

Goal: on `/master-specs` detail and `/engineer` material detail, users can see where a number came from and flag or refresh it.

- Small "ⓘ" affordance next to each AI-extracted spec value. Click → popover shows:
  - Source page + quoted text from TDS
  - Confidence chip (high / medium / low)
  - Model + extraction date
  - "Open TDS at page N" (deep-links into the existing left drawer PDF viewer)
  - "Re-analyze this field" (super_admin only) → runs single-field re-extraction
- Values with `confidence: "low"` render in muted color with a small warning dot.
- Values older than 90 days show a "stale" chip.
- New server fn `getSpecProvenance({ specId })` returns the provenance rows for that spec; loaded lazily when popover opens.
- New server fn `reanalyzeSpecField({ specId, field })` — super_admin only — re-runs the extractor and overwrites that single field + provenance row.

## 3c. Observability + cost controls

Goal: I can see what the queue is doing, what it's costing, and stop runaway spend.

**Metrics capture**
- Extend `tds_analysis_items` with `input_tokens`, `output_tokens`, `cost_usd` (nullable). Populate from the Gateway response in `tdsExtract.server.ts`.
- New `ai_usage_daily` rollup table (date, model, calls, input_tokens, output_tokens, cost_usd, failures). Updated by the worker on each successful/failed call via `INSERT ... ON CONFLICT (date, model) DO UPDATE`.

**Daily cap**
- New `ai_settings` row (single-row table): `daily_call_cap`, `daily_cost_cap_usd`, `enabled`.
- Worker checks the current day's rollup before claiming; if over cap, it no-ops and marks batches `paused_cap`. Super_admin sees a banner and can raise the cap.

**Admin dashboard** — new route `/admin/ai-usage`:
- Last 30 days chart: calls, tokens, cost, failure rate.
- Live queue: running batches, pending count, avg latency, cache hit rate.
- Recent failures list with error snippets.
- "Pause worker" toggle (flips `ai_settings.enabled`).

**Alerting**
- On failure spike (>25% failures in last 50 calls), the dashboard shows a red banner. No email/webhook in this phase — keep it in-app.

## Files

- MIGRATION: `tds_field_provenance`, `ai_usage_daily`, `ai_settings`, new columns on `tds_analysis_items`, RLS + grants.
- EDIT: `src/lib/tdsExtract.server.ts` (prompt, schema, plausibility gate, provenance write, token/cost capture, cap check).
- NEW: `src/lib/tdsProvenance.functions.ts` (`getSpecProvenance`, `reanalyzeSpecField`).
- NEW: `src/components/SpecValueProvenance.tsx` (popover UI).
- EDIT: `src/pages/MasterSpecs.tsx`, `src/pages/Engineer.tsx` (mount popover next to AI-extracted values).
- NEW: `src/pages/admin/AiUsage.tsx` + `src/routes/admin.ai-usage.tsx`.
- NEW: `src/lib/aiUsage.functions.ts` (dashboard queries, cap toggle).
- INSERT (not migration): seed row in `ai_settings`.

## Acceptance

- New extraction on a Fahrenheit TDS returns Celsius; unit-mismatch case that failed before now passes.
- Every AI-populated field on the detail screen has a working provenance popover with a quote and page link.
- `/admin/ai-usage` shows non-zero cost/token counts after a batch run; toggling "Pause" stops new claims within one tick.
- Hitting the daily cap pauses the worker and surfaces a banner instead of silently failing.

Approve to proceed — I'll start with 3a (migration + extractor), then 3b (UI), then 3c (dashboard).
