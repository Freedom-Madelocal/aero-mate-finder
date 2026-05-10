
-- ENUM
CREATE TYPE public.app_role AS ENUM ('super_admin', 'org_admin', 'engineer', 'procurement', 'dev', 'integrator');

-- ORGANIZATIONS
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER_ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- USER_DEMO_SETTINGS
CREATE TABLE public.user_demo_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  demo_mode boolean NOT NULL DEFAULT false,
  first_login_at timestamptz,
  extension_requested_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_demo_settings ENABLE ROW LEVEL SECURITY;

-- ORG_INVITATIONS
CREATE TABLE public.org_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL,
  token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER FUNCTIONS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.get_user_org(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.profiles WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_demo_active(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.user_demo_settings WHERE user_id = _user_id) THEN true
    WHEN (SELECT demo_mode FROM public.user_demo_settings WHERE user_id = _user_id) = false THEN true
    WHEN (SELECT first_login_at FROM public.user_demo_settings WHERE user_id = _user_id) IS NULL THEN true
    WHEN now() - (SELECT first_login_at FROM public.user_demo_settings WHERE user_id = _user_id) < interval '48 hours' THEN true
    ELSE false
  END;
$$;

-- Stamp first_login_at on first call
CREATE OR REPLACE FUNCTION public.stamp_first_login(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_demo_settings (user_id, demo_mode, first_login_at)
  VALUES (_user_id, false, now())
  ON CONFLICT (user_id) DO UPDATE
    SET first_login_at = COALESCE(public.user_demo_settings.first_login_at, now()),
        updated_at = now();
END;
$$;

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid;
  _role public.app_role;
BEGIN
  -- read invite metadata if present
  _org := NULLIF(NEW.raw_user_meta_data->>'organization_id','')::uuid;
  _role := NULLIF(NEW.raw_user_meta_data->>'role','')::public.app_role;

  INSERT INTO public.profiles (id, email, full_name, organization_id)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', _org);

  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- TIMESTAMP TRIGGERS
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_demo_updated BEFORE UPDATE ON public.user_demo_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS POLICIES

-- profiles
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_super_admin(auth.uid()) OR organization_id = public.get_user_org(auth.uid()));
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_super_admin(auth.uid()));
CREATE POLICY "super admins insert profiles" ON public.profiles FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "super admins delete profiles" ON public.profiles FOR DELETE
  USING (public.is_super_admin(auth.uid()));

-- organizations
CREATE POLICY "read orgs" ON public.organizations FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR id = public.get_user_org(auth.uid()));
CREATE POLICY "super admins insert orgs" ON public.organizations FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "update orgs" ON public.organizations FOR UPDATE
  USING (public.is_super_admin(auth.uid()) OR (id = public.get_user_org(auth.uid()) AND public.has_role(auth.uid(), 'org_admin')));
CREATE POLICY "super admins delete orgs" ON public.organizations FOR DELETE
  USING (public.is_super_admin(auth.uid()));

-- user_roles
CREATE POLICY "read roles" ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'org_admin') AND public.get_user_org(user_id) = public.get_user_org(auth.uid())));
CREATE POLICY "super admins insert roles" ON public.user_roles FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "super admins delete roles" ON public.user_roles FOR DELETE
  USING (public.is_super_admin(auth.uid()));

-- user_demo_settings
CREATE POLICY "read own demo" ON public.user_demo_settings FOR SELECT
  USING (auth.uid() = user_id OR public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'org_admin') AND public.get_user_org(user_id) = public.get_user_org(auth.uid())));
CREATE POLICY "super admins insert demo" ON public.user_demo_settings FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'org_admin'));
CREATE POLICY "super admins update demo" ON public.user_demo_settings FOR UPDATE
  USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'org_admin') OR auth.uid() = user_id);
CREATE POLICY "super admins delete demo" ON public.user_demo_settings FOR DELETE
  USING (public.is_super_admin(auth.uid()));

-- org_invitations
CREATE POLICY "read invites" ON public.org_invitations FOR SELECT
  USING (public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'org_admin') AND organization_id = public.get_user_org(auth.uid())));
CREATE POLICY "create invites" ON public.org_invitations FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'org_admin') AND organization_id = public.get_user_org(auth.uid())));
CREATE POLICY "update invites" ON public.org_invitations FOR UPDATE
  USING (public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'org_admin') AND organization_id = public.get_user_org(auth.uid())));
CREATE POLICY "delete invites" ON public.org_invitations FOR DELETE
  USING (public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'org_admin') AND organization_id = public.get_user_org(auth.uid())));
