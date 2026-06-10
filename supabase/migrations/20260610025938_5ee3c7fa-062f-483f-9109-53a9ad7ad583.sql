
ALTER TABLE public.master_specs
  ADD COLUMN IF NOT EXISTS tds_pdf_path text,
  ADD COLUMN IF NOT EXISTS tds_pdf_size integer,
  ADD COLUMN IF NOT EXISTS tds_pdf_downloaded_at timestamptz;

DROP POLICY IF EXISTS "Authenticated read tds-pdfs" ON storage.objects;
CREATE POLICY "Authenticated read tds-pdfs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'tds-pdfs');
