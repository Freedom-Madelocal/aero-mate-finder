
ALTER TABLE public.master_specs
  ADD COLUMN IF NOT EXISTS frequent_reorder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS engineer_default_name text;

CREATE TABLE IF NOT EXISTS public.procurement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_spec_id uuid NOT NULL REFERENCES public.master_specs(id) ON DELETE CASCADE,
  engineer_name text NOT NULL DEFAULT '',
  chosen_vendor text NOT NULL DEFAULT '',
  quantity text,
  note text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.procurement_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read procurement_requests" ON public.procurement_requests FOR SELECT USING (true);
CREATE POLICY "Public insert procurement_requests" ON public.procurement_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update procurement_requests" ON public.procurement_requests FOR UPDATE USING (true);
CREATE POLICY "Public delete procurement_requests" ON public.procurement_requests FOR DELETE USING (true);

CREATE TRIGGER procurement_requests_updated_at
  BEFORE UPDATE ON public.procurement_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.vendor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text NOT NULL UNIQUE,
  contact_name text,
  email text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read vendor_contacts" ON public.vendor_contacts FOR SELECT USING (true);
CREATE POLICY "Public insert vendor_contacts" ON public.vendor_contacts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update vendor_contacts" ON public.vendor_contacts FOR UPDATE USING (true);
CREATE POLICY "Public delete vendor_contacts" ON public.vendor_contacts FOR DELETE USING (true);

CREATE TRIGGER vendor_contacts_updated_at
  BEFORE UPDATE ON public.vendor_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.procurement_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text NOT NULL,
  email text NOT NULL,
  request_ids uuid[] NOT NULL DEFAULT '{}',
  body text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.procurement_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read procurement_sends" ON public.procurement_sends FOR SELECT USING (true);
CREATE POLICY "Public insert procurement_sends" ON public.procurement_sends FOR INSERT WITH CHECK (true);
