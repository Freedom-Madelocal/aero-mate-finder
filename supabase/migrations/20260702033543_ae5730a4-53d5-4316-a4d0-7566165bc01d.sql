ALTER TABLE public.master_specs ADD COLUMN IF NOT EXISTS material_number INTEGER UNIQUE;
CREATE INDEX IF NOT EXISTS idx_master_specs_material_number ON public.master_specs(material_number);