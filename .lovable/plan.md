## Goal

Replace the token-link invite flow with a real email invite: admin enters email + role, the user receives a branded email, clicks the link, sets a password, and lands in the app already in the right org with the right role.

## Flow

1. Org admin / super admin opens the team / users page, enters email + role (+ org for super admin), clicks **Send invite**.
2. Backend (edge function with service role) calls `supabase.auth.admin.inviteUserByEmail(email, { data: { organization_id, role, invited_by }, redirectTo: <app>/accept-invite })`.
3. Supabase sends the invite email (using Lovable's auth email templates) with a recovery-style link.
4. User clicks the link → lands on `/accept-invite` with a temporary session.
5. `/accept-invite` shows a "Set your password" form (+ optional full name) and calls `supabase.auth.updateUser({ password, data: { full_name } })`.
6. `handle_new_user` trigger (already exists) reads `organization_id` and `role` from the user metadata at signup time and wires up `profiles` + `user_roles` automatically.
7. We mark the matching `org_invitations` row as accepted (for audit) via a SECURITY DEFINER RPC.

## Backend changes

- New edge function `invite-user` (service role, JWT-verified):
  - Inputs: `email`, `role`, `organization_id`.
  - Authorization: caller must be `super_admin`, OR `org_admin` of the same `organization_id`.
  - Inserts a row in `org_invitations` (for tracking).
  - Calls `auth.admin.inviteUserByEmail` with `data: { organization_id, role }` and `redirectTo` pointing to `/accept-invite` on the current site origin.
- New SECURITY DEFINER RPC `mark_invitation_accepted(_email text)` that flips `accepted_at` on any pending invite for that email (called from the accept-invite page after successful password set).
- Auth email templates: scaffold Lovable's auth email templates so the **Invite user** email is on-brand. (Requires email domain — if not set up yet, surface the email setup dialog.)

## Frontend changes

- `src/pages/OrgTeam.tsx` and `src/pages/admin/Users.tsx`: replace the local `org_invitations.insert` + clipboard-copy flow with a `supabase.functions.invoke("invite-user", { body: { email, role, organization_id } })` call. Toast "Invite email sent."
- New route `src/routes/accept-invite.tsx` + page `src/pages/AcceptInvite.tsx`:
  - Reads the session (Supabase establishes it from the invite link automatically).
  - If no session → show "This invite link is invalid or expired."
  - Form: full name + new password + confirm.
  - On submit: `supabase.auth.updateUser({ password, data: { full_name } })`, then `supabase.rpc("mark_invitation_accepted", { _email })`, then redirect to the role's landing route.
- Delete the now-unused `src/pages/Invite.tsx` and `src/routes/invite.$token.tsx` (token-link flow).

## Notes

- The existing `handle_new_user` trigger already maps `raw_user_meta_data.organization_id` and `role` into `profiles` and `user_roles`, so passing them through `inviteUserByEmail`'s `data` field is enough — no extra wiring needed.
- Email domain must be configured for the invite email to actually deliver; we'll surface the email-setup dialog if it isn't.
