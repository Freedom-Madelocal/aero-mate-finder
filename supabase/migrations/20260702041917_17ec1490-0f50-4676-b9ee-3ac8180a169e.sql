-- Auto-assign Traceium material_number on insert; sequence starts after current max
CREATE SEQUENCE IF NOT EXISTS public.master_specs_material_number_seq;

SELECT setval(
  'public.master_specs_material_number_seq',
  GREATEST((SELECT COALESCE(MAX(material_number), 0) FROM public.master_specs), 1),
  true
);

ALTER TABLE public.master_specs
  ALTER COLUMN material_number SET DEFAULT nextval('public.master_specs_material_number_seq');

ALTER SEQUENCE public.master_specs_material_number_seq OWNED BY public.master_specs.material_number;

-- Backfill trigger for rows inserted without material_number
CREATE OR REPLACE FUNCTION public.assign_material_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.material_number IS NULL THEN
    NEW.material_number := nextval('public.master_specs_material_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_master_specs_assign_material_number ON public.master_specs;
CREATE TRIGGER trg_master_specs_assign_material_number
  BEFORE INSERT ON public.master_specs
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_material_number();