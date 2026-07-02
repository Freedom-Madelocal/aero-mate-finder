
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read feature flags"
  ON public.feature_flags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can insert feature flags"
  ON public.feature_flags FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update feature flags"
  ON public.feature_flags FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete feature flags"
  ON public.feature_flags FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.feature_flags (key, label, description, enabled) VALUES
  ('procure', 'Procurement', 'Show the Procurement page and the "Procure" button on materials.', true),
  ('learn', 'Learn', 'Show the Learn page in the top nav.', true),
  ('inventory', 'Inventory', 'Show the Inventory page in the top nav.', true),
  ('new_ui_theme', 'New UI Theme', 'Opt into the experimental UI theme. Off keeps the default theme.', false)
ON CONFLICT (key) DO NOTHING;
