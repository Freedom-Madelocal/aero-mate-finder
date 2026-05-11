ALTER TABLE public.master_specs ADD COLUMN IF NOT EXISTS profiles text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS master_specs_profiles_gin ON public.master_specs USING GIN (profiles);
ALTER TABLE public.master_spec_uploads ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'spreadsheet';