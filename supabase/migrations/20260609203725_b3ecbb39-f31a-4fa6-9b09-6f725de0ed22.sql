
ALTER TABLE public.master_specs
  ADD COLUMN IF NOT EXISTS tds_url text,
  ADD COLUMN IF NOT EXISTS tds_source_title text,
  ADD COLUMN IF NOT EXISTS tds_scraped_at timestamptz,
  ADD COLUMN IF NOT EXISTS tds_scrape_status text,
  ADD COLUMN IF NOT EXISTS tds_scrape_error text;

CREATE TABLE IF NOT EXISTS public.master_spec_scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  current_spec_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_spec_scrape_jobs TO authenticated;
GRANT ALL ON public.master_spec_scrape_jobs TO service_role;

ALTER TABLE public.master_spec_scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage scrape jobs"
  ON public.master_spec_scrape_jobs
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_master_spec_scrape_jobs_updated_at
  BEFORE UPDATE ON public.master_spec_scrape_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
