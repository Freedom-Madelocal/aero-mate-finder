-- Stock report uploads
CREATE TABLE public.stock_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INTEGER NOT NULL DEFAULT 0,
  custom_columns TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read stock reports"
  ON public.stock_reports FOR SELECT USING (true);
CREATE POLICY "Public can insert stock reports"
  ON public.stock_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update stock reports"
  ON public.stock_reports FOR UPDATE USING (true);
CREATE POLICY "Public can delete stock reports"
  ON public.stock_reports FOR DELETE USING (true);

-- Materials catalog
CREATE TABLE public.materials (
  id TEXT PRIMARY KEY,
  supplier TEXT NOT NULL DEFAULT '',
  product TEXT NOT NULL DEFAULT '',
  former_name TEXT,
  form TEXT NOT NULL DEFAULT '—',
  chemistry TEXT NOT NULL DEFAULT '—',
  max_service_temp TEXT NOT NULL DEFAULT '—',
  cure_temp TEXT NOT NULL DEFAULT '—',
  ooa_capable TEXT NOT NULL DEFAULT '—',
  nasa_e595 TEXT NOT NULL DEFAULT '—',
  notes TEXT,
  available_qty NUMERIC NOT NULL DEFAULT 0,
  available_unit TEXT NOT NULL DEFAULT 'units',
  incoming_qty NUMERIC NOT NULL DEFAULT 0,
  incoming_eta TEXT,
  total_lots INTEGER NOT NULL DEFAULT 0,
  active_lots INTEGER NOT NULL DEFAULT 0,
  custom_fields JSONB,
  source TEXT,
  stock_report_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read materials"
  ON public.materials FOR SELECT USING (true);
CREATE POLICY "Public can insert materials"
  ON public.materials FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update materials"
  ON public.materials FOR UPDATE USING (true);
CREATE POLICY "Public can delete materials"
  ON public.materials FOR DELETE USING (true);

CREATE INDEX idx_materials_supplier ON public.materials(supplier);
CREATE INDEX idx_materials_product ON public.materials(product);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER materials_set_updated_at
BEFORE UPDATE ON public.materials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();