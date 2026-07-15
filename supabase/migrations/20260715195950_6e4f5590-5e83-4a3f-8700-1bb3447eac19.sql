-- Phase A: Analyze TDS repair foundations (additive, idempotent)

-- ─── A2: item classification / retry columns ─────────────────────────────────
ALTER TABLE public.tds_analysis_items
  ADD COLUMN IF NOT EXISTS error_class text,
  ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz;

CREATE INDEX IF NOT EXISTS tds_items_status_nextrun_idx
  ON public.tds_analysis_items (status, next_run_at);

-- ─── A5: batch rollup counters ───────────────────────────────────────────────
ALTER TABLE public.tds_analysis_batches
  ADD COLUMN IF NOT EXISTS pending_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS done_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_cache_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terminal_count int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recount_tds_batch(_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tds_analysis_batches b
     SET pending_count       = c.pending,
         processing_count    = c.processing,
         done_count          = c.done,
         failed_count        = c.failed,
         skipped_cache_count = c.skipped_cache,
         terminal_count      = c.done + c.failed + c.skipped_cache,
         updated_at          = now()
    FROM (
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')        AS pending,
        COUNT(*) FILTER (WHERE status = 'processing')     AS processing,
        COUNT(*) FILTER (WHERE status = 'done')           AS done,
        COUNT(*) FILTER (WHERE status = 'failed')         AS failed,
        COUNT(*) FILTER (WHERE status = 'skipped_cache')  AS skipped_cache
      FROM public.tds_analysis_items
      WHERE batch_id = _batch_id
    ) c
   WHERE b.id = _batch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tds_items_recount_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recount_tds_batch(OLD.batch_id);
    RETURN OLD;
  END IF;
  PERFORM public.recount_tds_batch(NEW.batch_id);
  IF TG_OP = 'UPDATE' AND NEW.batch_id <> OLD.batch_id THEN
    PERFORM public.recount_tds_batch(OLD.batch_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tds_items_recount ON public.tds_analysis_items;
CREATE TRIGGER tds_items_recount
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.tds_analysis_items
  FOR EACH ROW EXECUTE FUNCTION public.tds_items_recount_trg();

-- Backfill counters for existing batches (in-flight 789-item batch included).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.tds_analysis_batches LOOP
    PERFORM public.recount_tds_batch(r.id);
  END LOOP;
END $$;

-- ─── A4: allow `paused` batch status + reconciler ────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_stuck_batches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed record;
BEGIN
  SELECT * INTO allowed FROM public.ai_worker_allowed();

  -- Any running batch whose items are all terminal → complete
  UPDATE public.tds_analysis_batches b
     SET status = 'complete', updated_at = now()
   WHERE b.status IN ('running','paused')
     AND b.total > 0
     AND b.terminal_count >= b.total;

  IF NOT allowed.allowed THEN
    UPDATE public.tds_analysis_batches b
       SET status = 'paused', updated_at = now()
     WHERE b.status = 'running'
       AND b.terminal_count < b.total;
  ELSE
    -- Worker re-enabled: flip paused batches back to running.
    UPDATE public.tds_analysis_batches b
       SET status = 'running', updated_at = now()
     WHERE b.status = 'paused'
       AND b.terminal_count < b.total;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_stuck_batches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_stuck_batches() TO service_role;

-- ─── A1: harden claim RPC to honour next_run_at on pending retries ──────────
CREATE OR REPLACE FUNCTION public.claim_tds_items(_limit int, _lease_seconds int)
RETURNS SETOF public.tds_analysis_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT i.id
    FROM public.tds_analysis_items i
    JOIN public.tds_analysis_batches b ON b.id = i.batch_id
    WHERE b.status = 'running'
      AND i.attempts < i.max_attempts
      AND (
        (i.status = 'pending'
          AND (i.next_run_at IS NULL OR i.next_run_at <= now()))
        OR
        (i.status = 'processing'
          AND (i.lease_until IS NULL OR i.lease_until < now()))
      )
    ORDER BY COALESCE(i.next_run_at, i.created_at)
    LIMIT _limit
    FOR UPDATE OF i SKIP LOCKED
  )
  UPDATE public.tds_analysis_items t
     SET status = 'processing',
         lease_until = now() + make_interval(secs => _lease_seconds),
         attempts = t.attempts + 1,
         updated_at = now()
    FROM picked
   WHERE t.id = picked.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_tds_items(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_tds_items(int, int) TO service_role;