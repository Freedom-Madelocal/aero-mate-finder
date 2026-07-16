
-- Additive columns on tds_analysis_items
ALTER TABLE public.tds_analysis_items
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill next_attempt_at from legacy next_run_at so the new claim RPC sees
-- existing scheduled retries.
UPDATE public.tds_analysis_items
   SET next_attempt_at = next_run_at
 WHERE next_attempt_at IS NULL AND next_run_at IS NOT NULL;

-- Additive columns on tds_analysis_batches
ALTER TABLE public.tds_analysis_batches
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS resumed_at timestamptz;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tds_items_status_next_attempt
  ON public.tds_analysis_items (status, next_attempt_at)
  WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS idx_tds_items_lease_until
  ON public.tds_analysis_items (lease_until)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_tds_items_batch_status
  ON public.tds_analysis_items (batch_id, status);

CREATE INDEX IF NOT EXISTS idx_tds_batches_status
  ON public.tds_analysis_batches (status);

-- Replace claim_tds_items: atomic, lease vs retry are separate concerns.
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
          AND (i.next_attempt_at IS NULL OR i.next_attempt_at <= now()))
        OR
        (i.status = 'processing'
          AND i.lease_until IS NOT NULL
          AND i.lease_until < now())
      )
    ORDER BY COALESCE(i.next_attempt_at, i.created_at)
    LIMIT _limit
    FOR UPDATE OF i SKIP LOCKED
  )
  UPDATE public.tds_analysis_items t
     SET status = 'processing',
         lease_until = now() + make_interval(secs => _lease_seconds),
         attempts = t.attempts + 1,
         next_attempt_at = NULL,
         updated_at = now()
    FROM picked
   WHERE t.id = picked.id
  RETURNING t.*;
END;
$$;

-- Tighten claim RPC: only service role (worker) may invoke.
REVOKE ALL ON FUNCTION public.claim_tds_items(int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_tds_items(int, int) FROM anon;
REVOKE ALL ON FUNCTION public.claim_tds_items(int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tds_items(int, int) TO service_role;

-- Aggregate status counts by batch (avoids scanning all item rows client-side)
CREATE OR REPLACE FUNCTION public.get_batch_status_summary(_batch_id uuid)
RETURNS TABLE(status text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status, count(*)::bigint
    FROM public.tds_analysis_items
   WHERE batch_id = _batch_id
   GROUP BY status;
$$;
GRANT EXECUTE ON FUNCTION public.get_batch_status_summary(uuid) TO authenticated, service_role;

-- Update finalize_stuck_batches: emit the richer status vocabulary
-- (paused_cap on cap breaches, completed on terminal). Existing 'paused' /
-- 'complete' rows continue to work — resume flips them back to running.
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

  -- Any active batch whose items are all terminal → completed
  UPDATE public.tds_analysis_batches b
     SET status = 'completed', updated_at = now()
   WHERE b.status IN ('running','paused','paused_cap','paused_admin')
     AND b.total > 0
     AND b.terminal_count >= b.total;

  IF NOT allowed.allowed THEN
    UPDATE public.tds_analysis_batches b
       SET status = 'paused_cap',
           paused_reason = allowed.reason,
           paused_at = COALESCE(b.paused_at, now()),
           updated_at = now()
     WHERE b.status = 'running'
       AND b.terminal_count < b.total;
  ELSE
    -- Cap re-enabled: automatic pauses flip back to running.
    -- 'paused_admin' is a manual pause and is NOT auto-resumed.
    UPDATE public.tds_analysis_batches b
       SET status = 'running',
           resumed_at = now(),
           updated_at = now()
     WHERE b.status IN ('paused','paused_cap')
       AND b.terminal_count < b.total;
  END IF;
END;
$$;
