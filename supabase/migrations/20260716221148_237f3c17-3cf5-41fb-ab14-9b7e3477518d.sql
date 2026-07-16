
-- === master_specs: additive nullable columns ===
ALTER TABLE public.master_specs
  ADD COLUMN IF NOT EXISTS application_process text,
  ADD COLUMN IF NOT EXISTS shelf_life_months numeric,
  ADD COLUMN IF NOT EXISTS storage_temp_min_c numeric,
  ADD COLUMN IF NOT EXISTS storage_temp_max_c numeric,
  ADD COLUMN IF NOT EXISTS active_ingredient_or_resin text,
  ADD COLUMN IF NOT EXISTS qualifications jsonb,
  ADD COLUMN IF NOT EXISTS test_methods jsonb,
  ADD COLUMN IF NOT EXISTS contextual_standards jsonb,
  ADD COLUMN IF NOT EXISTS product_identifiers jsonb,
  ADD COLUMN IF NOT EXISTS test_results jsonb;

-- === tds_extraction_runs ===
CREATE TABLE IF NOT EXISTS public.tds_extraction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id uuid REFERENCES public.master_specs(id) ON DELETE SET NULL,
  document_hash text,
  route text NOT NULL,               -- 'text_layer_fast' | 'vision_pro' | 'legacy_vision'
  model text NOT NULL,
  prompt_version text,
  pages integer,
  input_bytes integer,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric,
  latency_ms integer,
  cache_status text,                 -- 'miss' | 'hit_hash' | 'hit_etag' | 'reservation_wait'
  cancelled boolean NOT NULL DEFAULT false,
  outcome text NOT NULL,             -- 'success' | 'failure'
  error_code text,
  error_class text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tds_extraction_runs TO authenticated;
GRANT ALL ON public.tds_extraction_runs TO service_role;

ALTER TABLE public.tds_extraction_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_extraction_runs"
  ON public.tds_extraction_runs
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS tds_extraction_runs_spec_created_idx
  ON public.tds_extraction_runs (spec_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tds_extraction_runs_hash_idx
  ON public.tds_extraction_runs (document_hash);

-- === spec_corrections ===
CREATE TABLE IF NOT EXISTS public.spec_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id uuid NOT NULL REFERENCES public.master_specs(id) ON DELETE CASCADE,
  correction_key text NOT NULL,      -- e.g. '3m_adhesion_promoter_86a_v1'
  expected_document_hash text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  before_values jsonb NOT NULL,
  after_values jsonb NOT NULL,
  evidence text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.spec_corrections TO authenticated;
GRANT ALL ON public.spec_corrections TO service_role;

ALTER TABLE public.spec_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_corrections"
  ON public.spec_corrections
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "super_admin_insert_corrections"
  ON public.spec_corrections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) AND actor_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS spec_corrections_spec_idx
  ON public.spec_corrections (spec_id, created_at DESC);
CREATE INDEX IF NOT EXISTS spec_corrections_key_idx
  ON public.spec_corrections (correction_key);
