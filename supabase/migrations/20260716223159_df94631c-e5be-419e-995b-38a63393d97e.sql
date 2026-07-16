
-- 3A/3B: idempotency + audit + rich health RPC

ALTER TABLE public.tds_analysis_items
  ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS tds_items_client_request_active_uidx
  ON public.tds_analysis_items (client_request_id)
  WHERE client_request_id IS NOT NULL
    AND status IN ('pending','processing');

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  batch_id uuid,
  item_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin read audit" ON public.admin_audit_log;
CREATE POLICY "super_admin read audit"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super_admin insert audit" ON public.admin_audit_log;
CREATE POLICY "super_admin insert audit"
  ON public.admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin')
              AND actor_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS admin_audit_batch_idx
  ON public.admin_audit_log (batch_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_batch_health(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.tds_analysis_batches%ROWTYPE;
  counts jsonb;
  errors jsonb;
  attempts jsonb;
  oldest_pending_seconds int;
  next_retry timestamptz;
  worker_last_run timestamptz;
  worker_heartbeat timestamptz;
  cooldowns jsonb;
  p50 int;
  p95 int;
  cache_hits int;
  model_calls int;
  cost_total numeric;
  throughput numeric;
  eta_seconds int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO b FROM public.tds_analysis_batches WHERE id = _batch_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT jsonb_object_agg(status, cnt) INTO counts
  FROM (
    SELECT status, count(*)::int AS cnt
    FROM public.tds_analysis_items WHERE batch_id = _batch_id GROUP BY status
  ) s;

  SELECT jsonb_object_agg(COALESCE(error_code,'unknown'), cnt) INTO errors
  FROM (
    SELECT error_code, count(*)::int AS cnt
    FROM public.tds_analysis_items
    WHERE batch_id = _batch_id AND status = 'failed'
    GROUP BY error_code
  ) e;

  SELECT jsonb_object_agg(attempts::text, cnt) INTO attempts
  FROM (
    SELECT attempts, count(*)::int AS cnt
    FROM public.tds_analysis_items WHERE batch_id = _batch_id GROUP BY attempts
  ) a;

  SELECT EXTRACT(EPOCH FROM (now() - min(created_at)))::int INTO oldest_pending_seconds
    FROM public.tds_analysis_items
   WHERE batch_id = _batch_id AND status = 'pending';

  SELECT min(next_attempt_at) INTO next_retry
    FROM public.tds_analysis_items
   WHERE batch_id = _batch_id AND status = 'pending' AND next_attempt_at IS NOT NULL;

  BEGIN
    SELECT max(started_at), max(ended_at) INTO worker_last_run, worker_heartbeat
      FROM public.tds_worker_runs;
  EXCEPTION WHEN undefined_table THEN
    worker_last_run := NULL; worker_heartbeat := NULL;
  END;

  BEGIN
    SELECT jsonb_object_agg(model, cooldown_until) INTO cooldowns
      FROM public.tds_provider_cooldowns
     WHERE cooldown_until > now();
  EXCEPTION WHEN undefined_table THEN
    cooldowns := '{}'::jsonb;
  END;

  SELECT
    COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::int, 0),
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int, 0),
    count(*) FILTER (WHERE status='skipped_cache')::int,
    count(*) FILTER (WHERE status='done')::int,
    COALESCE(sum(cost_usd), 0)
  INTO p50, p95, cache_hits, model_calls, cost_total
  FROM public.tds_analysis_items
  WHERE batch_id = _batch_id
    AND latency_ms IS NOT NULL;

  -- throughput = terminal items in the last 5 minutes / 300 seconds
  SELECT (count(*)::numeric / 300.0) INTO throughput
    FROM public.tds_analysis_items
   WHERE batch_id = _batch_id
     AND status IN ('done','failed','skipped_cache')
     AND updated_at > now() - interval '5 minutes';

  IF throughput IS NULL OR throughput <= 0 THEN
    eta_seconds := NULL;
  ELSE
    eta_seconds := (
      GREATEST(b.total - b.terminal_count, 0) / throughput
    )::int;
  END IF;

  RETURN jsonb_build_object(
    'batch', jsonb_build_object(
      'id', b.id,
      'status', b.status,
      'paused_reason', b.paused_reason,
      'paused_at', b.paused_at,
      'resumed_at', b.resumed_at,
      'label', b.label,
      'total', b.total,
      'terminal_count', b.terminal_count,
      'created_at', b.created_at,
      'updated_at', b.updated_at
    ),
    'counts', COALESCE(counts, '{}'::jsonb),
    'errors', COALESCE(errors, '{}'::jsonb),
    'attempts', COALESCE(attempts, '{}'::jsonb),
    'oldest_pending_seconds', oldest_pending_seconds,
    'next_retry_at', next_retry,
    'worker_last_run_at', worker_last_run,
    'worker_heartbeat_at', worker_heartbeat,
    'cooldowns', COALESCE(cooldowns, '{}'::jsonb),
    'latency_ms', jsonb_build_object('p50', p50, 'p95', p95),
    'cache_hits', cache_hits,
    'model_calls', model_calls,
    'estimated_cost_usd', cost_total,
    'throughput_per_sec', throughput,
    'eta_seconds', eta_seconds,
    'as_of', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_batch_health(uuid) TO authenticated;

-- Return the most recent batch id involving a given spec (any status),
-- used by the single-item Analyze button to poll status.
CREATE OR REPLACE FUNCTION public.get_latest_spec_batch(_spec_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT batch_id
    FROM public.tds_analysis_items
   WHERE spec_id = _spec_id
   ORDER BY created_at DESC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_spec_batch(uuid) TO authenticated;
