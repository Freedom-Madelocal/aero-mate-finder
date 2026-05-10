CREATE TABLE public.master_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_family TEXT,
  material_category TEXT,
  resin_chemistry TEXT,
  reinforcement TEXT,
  product_form TEXT,
  cure_temperature_c NUMERIC,
  cure_time TEXT,
  dry_tg_onset_c NUMERIC,
  wet_tg_c NUMERIC,
  peak_tg_c NUMERIC,
  max_service_temperature_c NUMERIC,
  out_life_days NUMERIC,
  freezer_life_months NUMERIC,
  tml_pct NUMERIC,
  cvcm_pct NUMERIC,
  tensile_lap_shear_mpa NUMERIC,
  t_peel_n_per_25mm NUMERIC,
  flatwise_tension_mpa NUMERIC,
  climbing_drum_peel_in_lb_per_in NUMERIC,
  process_method TEXT,
  ooa_vbo_capable BOOLEAN NOT NULL DEFAULT false,
  toughened BOOLEAN NOT NULL DEFAULT false,
  flame_retardant BOOLEAN NOT NULL DEFAULT false,
  low_dielectric BOOLEAN NOT NULL DEFAULT false,
  low_moisture_absorption BOOLEAN NOT NULL DEFAULT false,
  impact_resistant BOOLEAN NOT NULL DEFAULT false,
  high_temperature BOOLEAN NOT NULL DEFAULT false,
  applications TEXT,
  qualifications_standards TEXT,
  crossover_product TEXT,
  crossover_vendor TEXT,
  notes TEXT,
  minimum_order_quantity TEXT,
  source_document TEXT,
  uploaded_from TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vendor, product_name)
);

ALTER TABLE public.master_specs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read master_specs" ON public.master_specs FOR SELECT USING (true);
CREATE POLICY "Public insert master_specs" ON public.master_specs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update master_specs" ON public.master_specs FOR UPDATE USING (true);
CREATE POLICY "Public delete master_specs" ON public.master_specs FOR DELETE USING (true);

CREATE INDEX idx_master_specs_vendor ON public.master_specs(vendor);
CREATE INDEX idx_master_specs_category ON public.master_specs(material_category);
CREATE INDEX idx_master_specs_chemistry ON public.master_specs(resin_chemistry);

CREATE TRIGGER master_specs_set_updated_at
BEFORE UPDATE ON public.master_specs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.master_spec_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.master_spec_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read master_spec_uploads" ON public.master_spec_uploads FOR SELECT USING (true);
CREATE POLICY "Public insert master_spec_uploads" ON public.master_spec_uploads FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update master_spec_uploads" ON public.master_spec_uploads FOR UPDATE USING (true);
CREATE POLICY "Public delete master_spec_uploads" ON public.master_spec_uploads FOR DELETE USING (true);