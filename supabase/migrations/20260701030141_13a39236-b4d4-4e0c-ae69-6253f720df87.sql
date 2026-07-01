ALTER TABLE public.data_sheet_crawl_jobs
  ADD COLUMN IF NOT EXISTS vendor text;