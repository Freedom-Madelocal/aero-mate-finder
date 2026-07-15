
-- Phase 2 queue infrastructure for TDS analysis

CREATE TABLE public.tds_analysis_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  total int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.tds_analysis_batches TO authenticated;
GRANT ALL ON public.tds_analysis_batches TO service_role;
ALTER TABLE public.tds_analysis_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin read batches" ON public.tds_analysis_batches
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "super_admin write batches" ON public.tds_analysis_batches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.tds_analysis_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.tds_analysis_batches(id) ON DELETE CASCADE,
  spec_id uuid NOT NULL REFERENCES public.master_specs(id) ON DELETE CASCADE,
  document_hash text,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  lease_until timestamptz,
  model text,
  prompt_version text,
  latency_ms int,
  updated_fields int,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tds_items_status_lease_idx ON public.tds_analysis_items (status, lease_until);
CREATE INDEX tds_items_batch_idx ON public.tds_analysis_items (batch_id);
CREATE INDEX tds_items_spec_idx ON public.tds_analysis_items (spec_id);

GRANT SELECT, INSERT, UPDATE ON public.tds_analysis_items TO authenticated;
GRANT ALL ON public.tds_analysis_items TO service_role;
ALTER TABLE public.tds_analysis_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin read items" ON public.tds_analysis_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "super_admin write items" ON public.tds_analysis_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.tds_extraction_cache (
  document_hash text PRIMARY KEY,
  model text NOT NULL,
  prompt_version text NOT NULL,
  extracted jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tds_extraction_cache TO authenticated;
GRANT ALL ON public.tds_extraction_cache TO service_role;
ALTER TABLE public.tds_extraction_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin read cache" ON public.tds_extraction_cache
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_tds_analysis_batches_updated_at
  BEFORE UPDATE ON public.tds_analysis_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tds_analysis_items_updated_at
  BEFORE UPDATE ON public.tds_analysis_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic claim RPC: pick up to _limit items that are pending, or processing
-- with an expired lease, and mark them processing with a fresh lease.
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
      AND (
        i.status = 'pending'
        OR (i.status = 'processing' AND (i.lease_until IS NULL OR i.lease_until < now()))
      )
    ORDER BY i.created_at
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
