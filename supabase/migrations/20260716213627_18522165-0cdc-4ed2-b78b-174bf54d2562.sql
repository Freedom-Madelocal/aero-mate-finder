
-- ============================================================================
-- TDS worker reliability: reservations, worker tick lock/heartbeat, provider
-- cooldowns, atomic cap-pause RPC. Additive only — no destructive changes.
-- ============================================================================

-- Single-flight reservation for (document_hash, model, prompt_version).
-- Any worker that "wins" a row here is the exclusive extractor for that
-- identity. Reservations expire so a crashed holder can be reclaimed.
CREATE TABLE IF NOT EXISTS public.tds_extraction_reservations (
  document_hash text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  holder text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_hash, model, prompt_version)
);
GRANT SELECT ON public.tds_extraction_reservations TO authenticated;
GRANT ALL ON public.tds_extraction_reservations TO service_role;
ALTER TABLE public.tds_extraction_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin read reservations"
  ON public.tds_extraction_reservations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Try to acquire (or renew, if expired) a reservation atomically. Returns
-- true when the caller is the current holder after this call.
CREATE OR REPLACE FUNCTION public.try_reserve_extraction(
  _document_hash text,
  _model text,
  _prompt_version text,
  _holder text,
  _ttl_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  won boolean := false;
BEGIN
  INSERT INTO public.tds_extraction_reservations
    (document_hash, model, prompt_version, holder, expires_at)
  VALUES
    (_document_hash, _model, _prompt_version, _holder,
     now() + make_interval(secs => _ttl_seconds))
  ON CONFLICT (document_hash, model, prompt_version) DO UPDATE
    SET holder = EXCLUDED.holder,
        expires_at = EXCLUDED.expires_at
    WHERE public.tds_extraction_reservations.expires_at < now()
       OR public.tds_extraction_reservations.holder = EXCLUDED.holder
  RETURNING true INTO won;
  RETURN COALESCE(won, false);
END;
$$;
REVOKE ALL ON FUNCTION public.try_reserve_extraction(text,text,text,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_reserve_extraction(text,text,text,text,int) TO service_role;

CREATE OR REPLACE FUNCTION public.release_extraction_reservation(
  _document_hash text,
  _model text,
  _prompt_version text,
  _holder text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.tds_extraction_reservations
   WHERE document_hash = _document_hash
     AND model = _model
     AND prompt_version = _prompt_version
     AND holder = _holder;
$$;
REVOKE ALL ON FUNCTION public.release_extraction_reservation(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_extraction_reservation(text,text,text,text) TO service_role;

-- Worker tick lease: single-row table used as an atomic mutex with TTL to
-- prevent overlapping ticks. `try_acquire_worker_lease` returns true only
-- when the caller becomes the current holder.
CREATE TABLE IF NOT EXISTS public.tds_worker_lease (
  key text PRIMARY KEY,
  holder text NOT NULL,
  expires_at timestamptz NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tds_worker_lease TO authenticated;
GRANT ALL ON public.tds_worker_lease TO service_role;
ALTER TABLE public.tds_worker_lease ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin read worker lease"
  ON public.tds_worker_lease FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.try_acquire_worker_lease(
  _key text, _holder text, _ttl_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  won boolean := false;
BEGIN
  INSERT INTO public.tds_worker_lease (key, holder, expires_at, acquired_at)
  VALUES (_key, _holder, now() + make_interval(secs => _ttl_seconds), now())
  ON CONFLICT (key) DO UPDATE
    SET holder = EXCLUDED.holder,
        expires_at = EXCLUDED.expires_at,
        acquired_at = now()
    WHERE public.tds_worker_lease.expires_at < now()
  RETURNING true INTO won;
  RETURN COALESCE(won, false);
END;
$$;
REVOKE ALL ON FUNCTION public.try_acquire_worker_lease(text,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_acquire_worker_lease(text,text,int) TO service_role;

CREATE OR REPLACE FUNCTION public.release_worker_lease(_key text, _holder text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.tds_worker_lease
   WHERE key = _key AND holder = _holder;
$$;
REVOKE ALL ON FUNCTION public.release_worker_lease(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_worker_lease(text,text) TO service_role;

-- Structured heartbeat / observability for each worker tick.
CREATE TABLE IF NOT EXISTS public.tds_worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  claimed int NOT NULL DEFAULT 0,
  success int NOT NULL DEFAULT 0,
  retryable int NOT NULL DEFAULT 0,
  permanent int NOT NULL DEFAULT 0,
  paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  error text,
  holder text
);
CREATE INDEX IF NOT EXISTS idx_tds_worker_runs_started_at
  ON public.tds_worker_runs (started_at DESC);
GRANT SELECT ON public.tds_worker_runs TO authenticated;
GRANT ALL ON public.tds_worker_runs TO service_role;
ALTER TABLE public.tds_worker_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin read worker runs"
  ON public.tds_worker_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Provider-wide short cooldown after repeated 429/5xx/timeouts.
CREATE TABLE IF NOT EXISTS public.tds_provider_cooldowns (
  model text PRIMARY KEY,
  cooldown_until timestamptz NOT NULL,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tds_provider_cooldowns TO authenticated;
GRANT ALL ON public.tds_provider_cooldowns TO service_role;
ALTER TABLE public.tds_provider_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin read provider cooldowns"
  ON public.tds_provider_cooldowns FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.set_provider_cooldown(
  _model text, _seconds int, _reason text
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  until timestamptz := now() + make_interval(secs => _seconds);
BEGIN
  INSERT INTO public.tds_provider_cooldowns (model, cooldown_until, reason, updated_at)
  VALUES (_model, until, _reason, now())
  ON CONFLICT (model) DO UPDATE
    SET cooldown_until = GREATEST(public.tds_provider_cooldowns.cooldown_until, EXCLUDED.cooldown_until),
        reason = EXCLUDED.reason,
        updated_at = now();
  RETURN until;
END;
$$;
REVOKE ALL ON FUNCTION public.set_provider_cooldown(text,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_provider_cooldown(text,int,text) TO service_role;

-- Atomically move all running batches to paused_cap. Used when admission
-- denies mid-tick so items already claimed do not silently accumulate as
-- failures.
CREATE OR REPLACE FUNCTION public.pause_running_batches_cap(_reason text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.tds_analysis_batches b
     SET status = 'paused_cap',
         paused_reason = _reason,
         paused_at = COALESCE(b.paused_at, now()),
         updated_at = now()
   WHERE b.status = 'running';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.pause_running_batches_cap(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pause_running_batches_cap(text) TO service_role;
