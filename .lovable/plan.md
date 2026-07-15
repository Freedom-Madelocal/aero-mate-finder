# Analyze TDS Repair — Implementation Map

## Repository check
- HEAD `e7aeee2` is a descendant of `bf38c7f`. Working tree clean. Safe to proceed.

## Confirmed defects
All ten defects reproduce against current `main`:

1. **No scheduler in repo.** `pg_cron` for `/api/public/tds-worker-tick` was created out-of-band; no SQL committed to `supabase/migrations/`. Cannot be reproduced from source.
2. **Paused ≠ batch state.** `tds-worker-tick.ts` short-circuits on `ai_worker_allowed().allowed=false` and returns `{ paused: true }`, but `tds_analysis_batches.status` stays `running` and the UI keeps spinning.
3. **`lease_until` ignored for pending retries.** In migration `20260715031541`, `claim_tds_items` claims any row where `status='pending'` unconditionally; the retry path in `processOne` sets `status='pending'` + a future `lease_until` expecting it to defer, but the claim query does not filter `AND (lease_until IS NULL OR lease_until < now())` for the pending branch.
4. **Uniform retry policy.** `processOne` uses `MAX_ATTEMPTS=3` for every error class — missing PDF, 4xx from Gemini, plausibility rejects, and transient 5xx/timeouts are all retried three times with the same jitter.
5. **Weak worker auth.** Endpoint accepts `apikey === SUPABASE_ANON_KEY`, i.e. a public value. Anyone can drive the worker.
6. **No mid-retry checkpointing.** On failure the next attempt re-downloads the storage object and re-invokes Gemini even when the document hash is already known and cached. Cache is only consulted at the top of `runExtractionForSpec`, which is fine for hash hits, but repeated failed extractions still burn tokens because failures never populate the cache and the download always runs before the hash is compared.
7. **Chatty progress polling.** `BulkAnalyzeTdsButton` polls `getBatchProgress` every 3s and that server fn `SELECT`s every row of `tds_analysis_items` for the batch (789 rows) to compute counts client-side.
8. **Single-item path bypasses queue.** `AnalyzeTdsButton` → `specTdsAnalyze.functions.ts` → `runExtractionForSpec` directly. No queue row, no cap check, no telemetry item, no lease, no retry.
9. **No behavioral tests.** No vitest/playwright coverage for extractor, claim RPC, retry classification, or worker auth.
10. **Legacy 3M data not repaired.** UI hides zeros; the underlying rows still hold `0` values and wrong qualification flags. Re-analysis is required to correct them; nothing in the codebase enqueues that repair.

## Fix plan (order matters)

### Phase A — Data & scheduling foundations (migrations)
Additive only. New migration files; no edits to existing ones.

- **Migration A1 — claim RPC hardening.**
  `CREATE OR REPLACE FUNCTION claim_tds_items` adding `AND (i.lease_until IS NULL OR i.lease_until < now())` to the pending branch as well. Signature unchanged; existing 789-item batch continues to drain. Fixes defect 3.
- **Migration A2 — item classification columns.**
  `ALTER TABLE tds_analysis_items ADD COLUMN error_class text, ADD COLUMN max_attempts int NOT NULL DEFAULT 3, ADD COLUMN next_run_at timestamptz;` plus an index on `(status, next_run_at)`. `next_run_at` replaces the double-duty of `lease_until` for pending retries; `lease_until` stays for processing-lease semantics only. Update `claim_tds_items` in the same migration to gate pending on `next_run_at IS NULL OR next_run_at <= now()`. Fixes defects 3, 4.
- **Migration A3 — scheduler.**
  Commit `pg_cron.schedule('tds-worker-tick', '* * * * *', $$ SELECT net.http_post(...) $$)` idempotently (unschedule-if-exists + reschedule). URL is `project--<id>.lovable.app/api/public/tds-worker-tick`. Header is a new private secret (see B2), not the anon key. Fixes defect 1.
- **Migration A4 — batch reconciliation view/RPC.**
  `finalize_stuck_batches()` marks a batch `paused` when `ai_worker_allowed` is false and all items are non-terminal, and `complete` when all items terminal. Called from the worker each tick. Adds `paused` as a legal status value. Fixes defect 2.
- **Migration A5 — progress rollup.**
  Add `pending_count, processing_count, done_count, failed_count, skipped_cache_count` to `tds_analysis_batches` maintained by an `AFTER INSERT/UPDATE` trigger on `tds_analysis_items`. Backfill once for the in-flight batch. Enables cheap polling. Fixes defect 7.

### Phase B — Worker & auth
- **B1** Rewrite `src/routes/api/public/tds-worker-tick.ts` to:
  classify errors (`transient`, `permanent`, `plausibility`, `missing_pdf`, `rate_limited`) and set `max_attempts` accordingly (permanent = 1, transient = 5 w/ exponential backoff, rate_limited defers with `Retry-After`), write `next_run_at` instead of `lease_until` on defer, and call `finalize_stuck_batches` at end of tick. Fixes 2, 4.
- **B2** Introduce `TDS_WORKER_SECRET` (generated). Worker requires `Authorization: Bearer $TDS_WORKER_SECRET`. Anon key path removed. Cron uses the new secret. Fixes 5.
- **B3** Add short-circuit: before download, compute `document_hash` from the storage object's ETag/`HEAD` metadata when available; if `tds_extraction_cache` has that hash, resolve as `skipped_cache` without downloading bytes. Fixes 6.

### Phase C — Client & single-item unification
- **C1** `AnalyzeTdsButton` / `specTdsAnalyze.functions.ts` become a thin wrapper that enqueues a one-item batch and awaits it (poll-then-return with a short server-side wait, cap 30s, otherwise return the batch id and let the button watch it). Removes direct `runExtractionForSpec` call from the request path. Fixes 8.
- **C2** `getBatchProgress` returns the pre-aggregated columns from `tds_analysis_batches` plus failures capped to N=20; `BulkAnalyzeTdsButton` slows polling to 5s and drops item-scan. Fixes 7.
- **C3** `AiUsage.tsx` gains a "Repair legacy zeros" action that enqueues a batch scoped to `master_specs` where any of the tracked numeric fields is exactly `0` OR qualification flag looks stale (list defined in `tdsExtract.server.ts`). Fixes 10.

### Phase D — Tests
- **D1** Vitest units: error classifier, claim/lease semantics via pg-mem or a dedicated test schema, batch finalizer state machine.
- **D2** Integration test hitting `/api/public/tds-worker-tick` with mocked Gemini + storage: verifies auth rejection, cache short-circuit, transient retry with backoff, permanent no-retry, paused → batch status flips.
- **D3** Playwright: admin logs in, enqueues a 2-item batch against fixture PDFs, sees progress and final state.
Fixes 9.

## Compatibility & risk
- **In-flight 789-item batch:** A1+A2 are compatible. Existing rows have `next_run_at = NULL` → claim treats them as immediately eligible, matching current behavior. `max_attempts` defaults to 3, matching today.
- **`paused` batch status:** New value; UI must accept it. `BulkAnalyzeTdsButton` currently treats non-`running` as terminal — will need explicit `paused` handling before A4 ships.
- **Worker secret rotation:** B2 requires the cron job (A3) and the deployed worker to pick up the same secret in the same release, or the worker returns 401 to cron. Ship A3 + B2 together, keep a 24h grace window that also accepts the old anon key behind a feature flag, then remove.
- **Cache short-circuit (B3):** relies on Supabase storage returning a stable ETag; if unavailable for a given bucket, code must fall back to full download without error.
- **Single-item wrapper (C1):** existing callers expect a synchronous result shape; the wrapper preserves it for the fast path (< 30s) and only breaks for slow PDFs, where callers already tolerate async batch UI.

## Rollback boundaries
- Each migration in Phase A is independently revertible with a paired `down` script committed alongside (drop added columns/indexes/RPCs; restore prior `claim_tds_items` body captured verbatim). No destructive edits to existing migrations.
- Phase B code changes are gated behind `TDS_WORKER_V2=1`; unset to fall back to current handler (retained as `-legacy.ts` for one release).
- Phase C client changes are gated by a `tds_bulk_v2` feature flag in `feature_flags`.
- Phase D adds files only.

## Deliverables per phase
- A: 5 migration files under `supabase/migrations/` + matching `.down.sql` notes in PR description.
- B: rewritten worker route, new `TDS_WORKER_SECRET` via `secrets--generate_secret`, updated `tdsExtract.server.ts` classifier + ETag path.
- C: edits to `AnalyzeTdsButton.tsx`, `specTdsAnalyze.functions.ts`, `tdsQueue.functions.ts` (getBatchProgress), `BulkAnalyzeTdsButton.tsx`, `AiUsage.tsx`.
- D: `src/lib/__tests__/`, `tests/e2e/tds-*.spec.ts`, CI wiring if missing.

No defect will be marked fixed until the corresponding phase lands and its D-phase test is green.
