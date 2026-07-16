-- Widget clients table for embeddable Crossover widget
CREATE TABLE public.widget_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand_name text NOT NULL,
  logo_url text,
  accent_color text NOT NULL DEFAULT '#3B82F6',
  api_key_prefix text NOT NULL,
  api_key_hash text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  subscription_status text NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial','active','past_due','cancelled')),
  monthly_price_usd numeric,
  subscription_started_at timestamptz,
  subscription_renews_at timestamptz,
  last_used_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.widget_usage_monthly (
  client_id uuid NOT NULL REFERENCES public.widget_clients(id) ON DELETE CASCADE,
  month date NOT NULL,
  request_count bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.widget_clients TO authenticated;
GRANT ALL ON public.widget_clients TO service_role;
GRANT SELECT ON public.widget_usage_monthly TO authenticated;
GRANT ALL ON public.widget_usage_monthly TO service_role;

ALTER TABLE public.widget_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_usage_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages widget_clients" ON public.widget_clients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "super_admin reads widget_usage" ON public.widget_usage_monthly
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_widget_clients_updated_at
  BEFORE UPDATE ON public.widget_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();