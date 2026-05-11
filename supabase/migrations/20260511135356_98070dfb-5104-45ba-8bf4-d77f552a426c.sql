ALTER TABLE public.master_specs
  ADD COLUMN IF NOT EXISTS key_specs text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS master_specs_key_specs_gin
  ON public.master_specs USING GIN (key_specs);