
-- Phase 3a: provenance table
CREATE TABLE public.tds_field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id uuid NOT NULL REFERENCES public.master_specs(id) ON DELETE CASCADE,
  field text NOT NULL,
  value_text text,
  value_num double precision,
  value_bool boolean,
  unit text,
  source_page int,
  source_quote text,
  confidence text CHECK (confidence IN ('high','medium','low')),
  model text,
  prompt_version text,
  extracted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(spec_id, field)
);
CREATE INDEX tds_field_provenance_spec_idx ON public.tds_field_provenance(spec_id);

GRANT SELECT ON public.tds_field_provenance TO authenticated;
GRANT ALL ON public.tds_field_provenance TO service_role;
ALTER TABLE public.tds_field_provenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authed can read provenance"
  ON public.tds_field_provenance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage provenance"
  ON public.tds_field_provenance FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER tds_field_provenance_updated
  BEFORE UPDATE ON public.tds_field_provenance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend tds_analysis_items with cost/token telemetry
ALTER TABLE public.tds_analysis_items
  ADD COLUMN input_tokens int,
  ADD COLUMN output_tokens int,
  ADD COLUMN cost_usd numeric(10,6);

-- Daily usage rollup
CREATE TABLE public.ai_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  model text NOT NULL,
  calls int NOT NULL DEFAULT 0,
  failures int NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day, model)
);
CREATE INDEX ai_usage_daily_day_idx ON public.ai_usage_daily(day DESC);

GRANT SELECT ON public.ai_usage_daily TO authenticated;
GRANT ALL ON public.ai_usage_daily TO service_role;
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read ai usage"
  ON public.ai_usage_daily FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER ai_usage_daily_updated
  BEFORE UPDATE ON public.ai_usage_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Settings (single row)
CREATE TABLE public.ai_settings (
  id int PRIMARY KEY DEFAULT 1,
  daily_call_cap int NOT NULL DEFAULT 500,
  daily_cost_cap_usd numeric(10,2) NOT NULL DEFAULT 25.00,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read ai settings"
  ON public.ai_settings FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins update ai settings"
  ON public.ai_settings FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER ai_settings_updated
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ai_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- RPC: atomically record a usage event
CREATE OR REPLACE FUNCTION public.record_ai_usage(
  _model text,
  _input_tokens int,
  _output_tokens int,
  _cost_usd numeric,
  _failed boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_usage_daily(day, model, calls, failures, input_tokens, output_tokens, cost_usd)
  VALUES (current_date, _model, 1, CASE WHEN _failed THEN 1 ELSE 0 END,
          COALESCE(_input_tokens,0), COALESCE(_output_tokens,0), COALESCE(_cost_usd,0))
  ON CONFLICT (day, model) DO UPDATE
    SET calls = ai_usage_daily.calls + 1,
        failures = ai_usage_daily.failures + CASE WHEN _failed THEN 1 ELSE 0 END,
        input_tokens = ai_usage_daily.input_tokens + COALESCE(_input_tokens,0),
        output_tokens = ai_usage_daily.output_tokens + COALESCE(_output_tokens,0),
        cost_usd = ai_usage_daily.cost_usd + COALESCE(_cost_usd,0),
        updated_at = now();
END;
$$;

-- RPC: check if worker is allowed to run right now
CREATE OR REPLACE FUNCTION public.ai_worker_allowed()
RETURNS TABLE(allowed boolean, reason text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.ai_settings%ROWTYPE;
  today_calls int;
  today_cost numeric;
BEGIN
  SELECT * INTO s FROM public.ai_settings WHERE id = 1;
  IF NOT FOUND OR NOT s.enabled THEN
    RETURN QUERY SELECT false, 'paused'::text;
    RETURN;
  END IF;
  SELECT COALESCE(SUM(calls),0), COALESCE(SUM(cost_usd),0)
    INTO today_calls, today_cost
    FROM public.ai_usage_daily WHERE day = current_date;
  IF today_calls >= s.daily_call_cap THEN
    RETURN QUERY SELECT false, 'call_cap'::text; RETURN;
  END IF;
  IF today_cost >= s.daily_cost_cap_usd THEN
    RETURN QUERY SELECT false, 'cost_cap'::text; RETURN;
  END IF;
  RETURN QUERY SELECT true, 'ok'::text;
END;
$$;
