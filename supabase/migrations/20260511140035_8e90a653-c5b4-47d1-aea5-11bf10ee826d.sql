ALTER TABLE public.master_specs ADD COLUMN IF NOT EXISTS customers text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS master_specs_customers_gin ON public.master_specs USING GIN (customers);