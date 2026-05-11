
-- 1. CRM contacts table
CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  email text NOT NULL,
  phone text,
  company text,
  notes text,
  source text NOT NULL DEFAULT 'manual',
  lead_signup_id uuid,
  promoted_user_id uuid,
  promoted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX crm_contacts_lead_signup_id_key
  ON public.crm_contacts (lead_signup_id)
  WHERE lead_signup_id IS NOT NULL;

CREATE INDEX crm_contacts_email_idx ON public.crm_contacts (lower(email));

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins read crm" ON public.crm_contacts
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "super admins insert crm" ON public.crm_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "super admins update crm" ON public.crm_contacts
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "super admins delete crm" ON public.crm_contacts
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER crm_contacts_updated_at
  BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Backfill from lead_magnet_signups
INSERT INTO public.crm_contacts (full_name, email, company, source, lead_signup_id, created_at)
SELECT s.full_name, s.email, s.company, 'lead_magnet', s.id, s.created_at
FROM public.lead_magnet_signups s
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_contacts c WHERE c.lead_signup_id = s.id
);

-- 3. Trigger to auto-add new lead magnet signups
CREATE OR REPLACE FUNCTION public.crm_from_lead_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.crm_contacts (full_name, email, company, source, lead_signup_id, created_at)
  VALUES (NEW.full_name, NEW.email, NEW.company, 'lead_magnet', NEW.id, NEW.created_at)
  ON CONFLICT (lead_signup_id) WHERE lead_signup_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lead_magnet_signups_to_crm
  AFTER INSERT ON public.lead_magnet_signups
  FOR EACH ROW EXECUTE FUNCTION public.crm_from_lead_signup();

-- 4. Update handle_new_user to honor demo_mode metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid;
  _role public.app_role;
  _demo boolean;
BEGIN
  _org := NULLIF(NEW.raw_user_meta_data->>'organization_id','')::uuid;
  _role := NULLIF(NEW.raw_user_meta_data->>'role','')::public.app_role;
  _demo := COALESCE((NEW.raw_user_meta_data->>'demo_mode')::boolean, false);

  INSERT INTO public.profiles (id, email, full_name, organization_id)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', _org);

  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
    ON CONFLICT DO NOTHING;
  END IF;

  IF _demo THEN
    INSERT INTO public.user_demo_settings (user_id, demo_mode)
    VALUES (NEW.id, true)
    ON CONFLICT (user_id) DO UPDATE SET demo_mode = true, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;
