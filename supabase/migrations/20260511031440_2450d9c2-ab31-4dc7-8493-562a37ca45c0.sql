-- Activity log capturing logins and page views
CREATE TABLE public.user_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('login','page_view')),
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_activity_user_created_idx
  ON public.user_activity (user_id, created_at DESC);

CREATE INDEX user_activity_user_event_created_idx
  ON public.user_activity (user_id, event_type, created_at DESC);

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert their own activity rows
CREATE POLICY "users insert own activity"
  ON public.user_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- A user can read their own activity; super admins can read all
CREATE POLICY "read own or super admin"
  ON public.user_activity
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()));

-- Super admins can prune
CREATE POLICY "super admins delete activity"
  ON public.user_activity
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));