
CREATE TABLE public.scrape_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  master_spec_id uuid REFERENCES public.master_specs(id) ON DELETE SET NULL,
  bulk_job_id uuid REFERENCES public.master_spec_scrape_jobs(id) ON DELETE SET NULL,
  child_job_id uuid REFERENCES public.data_sheet_crawl_jobs(id) ON DELETE SET NULL,
  data_sheet_id uuid REFERENCES public.data_sheets(id) ON DELETE SET NULL,
  vendor text,
  product_name text,
  step text NOT NULL,               -- 'search' | 'scrape' | 'download_pdf' | 'extract' | 'match' | 'apply' | 'orchestrate'
  status text NOT NULL,             -- 'success' | 'not_found' | 'failed' | 'skipped' | 'info'
  source_url text,                  -- the search/page URL used
  attempted_url text,               -- the PDF or product URL attempted
  http_status int,
  error_message text,
  details jsonb
);

CREATE INDEX scrape_logs_spec_idx ON public.scrape_logs (master_spec_id, created_at DESC);
CREATE INDEX scrape_logs_bulk_idx ON public.scrape_logs (bulk_job_id, created_at DESC);
CREATE INDEX scrape_logs_child_idx ON public.scrape_logs (child_job_id, created_at DESC);
CREATE INDEX scrape_logs_created_idx ON public.scrape_logs (created_at DESC);

GRANT SELECT ON public.scrape_logs TO authenticated;
GRANT ALL ON public.scrape_logs TO service_role;

ALTER TABLE public.scrape_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read scrape logs"
  ON public.scrape_logs FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));
