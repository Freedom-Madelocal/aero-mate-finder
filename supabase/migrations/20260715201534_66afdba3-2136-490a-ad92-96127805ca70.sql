
ALTER TABLE public.tds_extraction_cache ADD COLUMN IF NOT EXISTS object_etag text;
CREATE INDEX IF NOT EXISTS tds_extraction_cache_etag_idx ON public.tds_extraction_cache (object_etag) WHERE object_etag IS NOT NULL;
