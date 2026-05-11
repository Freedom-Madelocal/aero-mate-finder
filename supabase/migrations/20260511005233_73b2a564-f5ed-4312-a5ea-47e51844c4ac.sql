-- Site settings table (single-row config for landing page)
CREATE TABLE public.site_settings (
  id text PRIMARY KEY DEFAULT 'landing',
  hero_video_url text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read site_settings"
  ON public.site_settings FOR SELECT
  USING (true);

CREATE POLICY "super admins insert site_settings"
  ON public.site_settings FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "super admins update site_settings"
  ON public.site_settings FOR UPDATE
  USING (public.is_super_admin(auth.uid()));

INSERT INTO public.site_settings (id, content) VALUES ('landing', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER site_settings_updated_at
BEFORE UPDATE ON public.site_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public storage bucket for landing video
INSERT INTO storage.buckets (id, name, public)
VALUES ('landing-media', 'landing-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read landing-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'landing-media');

CREATE POLICY "super admins upload landing-media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'landing-media' AND public.is_super_admin(auth.uid()));

CREATE POLICY "super admins update landing-media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'landing-media' AND public.is_super_admin(auth.uid()));

CREATE POLICY "super admins delete landing-media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'landing-media' AND public.is_super_admin(auth.uid()));