# Phase 2 — Durable, Faster Batch Pipeline

Goal: bulk TDS analysis survives browser close, deduplicates unchanged PDFs, and runs with bounded concurrency on the server.

## 2a. Queue schema (migration)

New tables in `public`:

- `tds_analysis_batches`
  - `id uuid pk`, `created_by uuid` (super_admin), `label text`, `total int`, `status text` (`running|complete|cancelled`), `created_at`, `updated_at`
- `tds_analysis_items`
  - `id uuid pk`, `batch_id uuid fk`, `spec_id uuid fk master_specs`, `document_hash text`, `status text` (`pending|processing|done|failed|skipped_cache`), `attempts int default 0`, `lease_until timestamptz`, `model text`, `prompt_version text`, `latency_ms int`, `updated_fields int`, `error text`, `created_at`, `updated_at`
  - Indexes on `(status, lease_until)`, `(batch_id)`, `(spec_id)`
- `tds_extraction_cache`
  - `document_hash text pk`, `model text`, `prompt_version text`, `extracted jsonb`, `created_at`
  - Store raw AI JSON keyed by hash so unchanged PDFs skip the model.

RLS: super_admin read/write only (via `has_role`). Grants for `authenticated` + `service_role`.

## 2b. Server functions (`src/lib/tdsQueue.functions.ts`)

All `.middleware([requireSupabaseAuth])` + super_admin guard:

- `enqueueTdsBatch({ mode: 'pending'|'all', specIds? })` — inserts batch + items for specs with a `tds_pdf_path`, returns `batchId`.
- `getBatchProgress({ batchId })` — returns counts by status + latest failures.
- `cancelBatch({ batchId })` — marks batch cancelled; pending items skipped by worker.

## 2c. Worker route (`src/routes/api/public/tds-worker-tick.ts`)

Public POST endpoint, verified by `apikey` header (Supabase anon key). Body ignored.

- Claims up to N=3 items atomically via a Postgres RPC `claim_tds_items(_limit int, _lease_seconds int)`:
  - Selects `pending` OR (`processing` AND `lease_until < now()`) with `FOR UPDATE SKIP LOCKED`, sets `status='processing'`, `lease_until = now() + interval`, increments `attempts`.
- For each claimed item:
  1. Load spec, download PDF via `supabaseAdmin`.
  2. Compute `document_hash = sha256(bytes || model || prompt_version)`.
  3. If `tds_extraction_cache` hit → reuse `extracted`; mark `skipped_cache`.
  4. Else call Gemini (existing prompt), 60s AbortController, store result in cache.
  5. Apply the same safe merge from Phase 1 (`applyExtractedSpec` helper extracted from `specTdsAnalyze.functions.ts`).
  6. Update item `status='done'` with `latency_ms`, `updated_fields`, `document_hash`.
- On failure: if `attempts < 3` → back to `pending` with jittered `lease_until`; else `status='failed'` with `error`.
- Returns `{ processed, remaining }`.

## 2d. Refactor extractor

Move the merge + gateway call out of `specTdsAnalyze.functions.ts` into `src/lib/tdsExtract.server.ts` (server-only). Existing `analyzeSpecTds` becomes a thin wrapper (still available for single-row button) that also writes to the cache. This keeps Phase 1 semantics.

## 2e. Cron

Insert via `supabase--insert`, every minute:

```sql
select cron.schedule(
  'tds-worker-tick',
  '* * * * *',
  $$select net.http_post(
    url:='https://project--ca4abaac-23d6-4e8d-8183-d866b748d7da.lovable.app/api/public/tds-worker-tick',
    headers:='{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb,
    body:='{}'::jsonb) as request_id;$$
);
```

## 2f. UI (`BulkAnalyzeTdsButton.tsx`)

Rewrite:
- Click → confirm → `enqueueTdsBatch` → store `batchId` in `localStorage`.
- Poll `getBatchProgress` every 3s while dialog open; also on mount if a saved `batchId` exists and isn't complete.
- Dialog can be closed; batch continues server-side.
- Show pending / processing / done / failed / skipped_cache counts, progress bar, failure list.
- Per-item completion → we don't have push, so on poll if `done` count changed we call `refreshMasterSpecStore()` (or just once at end for simplicity).

## 2g. Acceptance

- Close browser mid-run → cron worker completes remaining items.
- Re-running against unchanged PDFs → `skipped_cache` count grows, ~0 model calls.
- Non-admins get 403 from enqueue/progress/cancel.
- Worker endpoint rejects requests missing the anon `apikey` header.

## Files created / edited

- MIGRATION: batches, items, cache tables + `claim_tds_items` RPC + RLS/grants.
- NEW: `src/lib/tdsExtract.server.ts`, `src/lib/tdsQueue.functions.ts`, `src/routes/api/public/tds-worker-tick.ts`.
- EDIT: `src/lib/specTdsAnalyze.functions.ts` (delegate to extractor + cache write).
- EDIT: `src/components/BulkAnalyzeTdsButton.tsx` (enqueue + poll).
- INSERT (not migration): pg_cron schedule.

Approve to proceed — I'll start with the migration, then code, then the cron insert.
