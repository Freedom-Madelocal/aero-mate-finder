CREATE OR REPLACE FUNCTION public.mark_invitation_accepted(_email text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.org_invitations
     SET accepted_at = now()
   WHERE lower(email) = lower(_email)
     AND accepted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.mark_invitation_accepted(text) TO authenticated;