ALTER TABLE public.master_specs
ADD COLUMN IF NOT EXISTS density_g_cm3 NUMERIC,
ADD COLUMN IF NOT EXISTS tensile_modulus_gpa NUMERIC,
ADD COLUMN IF NOT EXISTS compressive_strength_mpa NUMERIC,
ADD COLUMN IF NOT EXISTS mix_ratio_by_weight TEXT,
ADD COLUMN IF NOT EXISTS mix_ratio_by_volume TEXT,
ADD COLUMN IF NOT EXISTS mixed_viscosity_cp NUMERIC,
ADD COLUMN IF NOT EXISTS areal_weight_gsm NUMERIC,
ADD COLUMN IF NOT EXISTS resin_content_pct NUMERIC,
ADD COLUMN IF NOT EXISTS volatile_content_pct NUMERIC,
ADD COLUMN IF NOT EXISTS gel_time_minutes NUMERIC,
ADD COLUMN IF NOT EXISTS pot_life_hours NUMERIC;