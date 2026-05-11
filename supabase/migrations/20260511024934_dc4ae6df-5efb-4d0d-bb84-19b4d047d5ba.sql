-- Signups table
CREATE TABLE public.lead_magnet_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_domain text NOT NULL,
  full_name text,
  company text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_magnet_signups_created ON public.lead_magnet_signups (created_at DESC);

ALTER TABLE public.lead_magnet_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can submit lead magnet signup"
ON public.lead_magnet_signups
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "super admins read signups"
ON public.lead_magnet_signups
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "super admins delete signups"
ON public.lead_magnet_signups
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Storage bucket for the downloadable file
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-magnet', 'lead-magnet', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read lead magnet files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'lead-magnet');

CREATE POLICY "Super admins upload lead magnet files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lead-magnet' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins update lead magnet files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'lead-magnet' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins delete lead magnet files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'lead-magnet' AND public.is_super_admin(auth.uid()));