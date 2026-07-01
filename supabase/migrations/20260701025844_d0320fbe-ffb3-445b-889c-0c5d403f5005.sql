ALTER TABLE public.master_spec_scrape_jobs
  ADD COLUMN IF NOT EXISTS child_job_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'firecrawl';