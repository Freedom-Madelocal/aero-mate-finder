
-- Crawl jobs
CREATE TABLE public.data_sheet_crawl_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  crawl_mode text NOT NULL DEFAULT 'crawl',
  max_pages integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'queued',
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  pending_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_sheet_crawl_jobs TO authenticated;
GRANT ALL ON public.data_sheet_crawl_jobs TO service_role;

ALTER TABLE public.data_sheet_crawl_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage crawl jobs"
  ON public.data_sheet_crawl_jobs FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_data_sheet_crawl_jobs_updated_at
  BEFORE UPDATE ON public.data_sheet_crawl_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Data sheets
CREATE TABLE public.data_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.data_sheet_crawl_jobs(id) ON DELETE SET NULL,
  source_url text,
  page_url text,
  pdf_url text,
  pdf_path text,
  pdf_size integer,
  doc_type text NOT NULL DEFAULT 'tds',
  vendor text,
  product_name text,
  title text,
  parsed_specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_text text,
  match_status text NOT NULL DEFAULT 'unmatched',
  master_spec_id uuid REFERENCES public.master_specs(id) ON DELETE SET NULL,
  confidence numeric,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_sheets_master_spec_id ON public.data_sheets(master_spec_id);
CREATE INDEX idx_data_sheets_job_id ON public.data_sheets(job_id);
CREATE INDEX idx_data_sheets_match_status ON public.data_sheets(match_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_sheets TO authenticated;
GRANT ALL ON public.data_sheets TO service_role;

ALTER TABLE public.data_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read data sheets"
  ON public.data_sheets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins manage data sheets"
  ON public.data_sheets FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_data_sheets_updated_at
  BEFORE UPDATE ON public.data_sheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies on tds-pdfs bucket (already exists, private)
CREATE POLICY "Super admins upload tds pdfs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'tds-pdfs' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins update tds pdfs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'tds-pdfs' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins delete tds pdfs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'tds-pdfs' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Authenticated read tds pdfs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'tds-pdfs');
