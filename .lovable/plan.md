
# User Management & Auth Plan

## 1. Backend (Lovable Cloud)

**Enums**
- `app_role`: `super_admin`, `org_admin`, `engineer`, `procurement`, `dev`, `integrator`

**Tables**
- `organizations`: `id`, `name`, `slug`, `created_at`, `created_by`
- `profiles`: `id` (= `auth.users.id`), `email`, `full_name`, `organization_id` (nullable for super_admin/dev), `created_at`
- `user_roles`: `id`, `user_id`, `role` (app_role), unique(`user_id`, `role`)
- `user_demo_settings`: `user_id` PK, `demo_mode` bool, `first_login_at` timestamptz nullable, `extension_requested_at` timestamptz nullable
- `org_invitations`: `id`, `organization_id`, `email`, `role`, `token`, `invited_by`, `expires_at`, `accepted_at`

**Security definer functions**
- `has_role(_user_id, _role)`
- `is_super_admin(_user_id)`
- `get_user_org(_user_id)` → uuid
- `is_demo_active(_user_id)` → bool (true if `demo_mode=false` OR within 48h of `first_login_at`)

**RLS (high level, plain English)**
- `profiles`: a user can read/update their own profile; super admins can read/update all; org admins can read profiles in their organization.
- `organizations`: super admins manage all; org admin can read/update their own org.
- `user_roles`: only super admins can write; users can read their own roles; org admins can read roles inside their org.
- `user_demo_settings`: super admins manage all; user can read own.
- `org_invitations`: super admin all; org admin manages invites in their org; invited email can read by token.

**Trigger**
- On `auth.users` insert → create `profiles` row from metadata (email, full_name, organization_id from invite).

## 2. Auth flow

- Email + password only (no Google, per request).
- Email confirmation **disabled** for now (faster onboarding).
- Public `/login` page (linked from landing footer). Email/password sign in only — no public signup form.
- Secret `/console` keeps its terminal UI; "log in" option leads to a console-styled login form. Same Supabase auth backend; after sign-in we additionally check `is_super_admin`. If not super admin, sign them out and show "access denied". (Domain restriction deferred per your note.)
- `/signup` only reachable via invite link: `/invite/:token` — pre-fills email, sets organization + role from invitation, creates user.

## 3. Roles & landing pages

After login, redirect by primary role:
- `super_admin`, `org_admin`, `dev`, `integrator` → `/dashboard`
- `engineer` → `/engineer`
- `procurement` → `/procurement`

All roles get full access for now (route guard just requires authenticated). Per-role permissions can be tightened later.

## 4. Demo mode

- Toggle on each non-super-admin user (managed in admin panel).
- On first successful login, if `demo_mode=true` and `first_login_at` is null → set it to `now()`.
- On every login, if demo and `now() - first_login_at > 48h` → sign out and route to `/demo-expired` page with a "Request extension" button (writes `extension_requested_at` and notifies super admin via a row super admins see in their dashboard).
- Super admin can toggle `demo_mode` off (or reset `first_login_at`) to restore access.

## 5. UI to build

- **Landing footer**: add "Log in" link → `/login`.
- **`/login`**: email + password, "Forgot password" → `/forgot-password` → `/reset-password`.
- **`/console` login option**: terminal-styled form, same Supabase signIn; super-admin enforcement.
- **`/invite/:token`**: accept invite, set password, create account.
- **`/demo-expired`**: locked screen with extension request button.
- **`/admin/users`** (super_admin only): list all users, change roles, assign org, toggle demo, reset demo timer, view extension requests.
- **`/admin/organizations`** (super_admin only): CRUD orgs.
- **`/org/team`** (org_admin): list org members, invite by email + role (engineer/procurement/org_admin), toggle demo per user, revoke invites.
- **Auth context / route guards**: `_authenticated` layout route + role-aware redirect on `/`.

## 6. Bootstrap

- After migration, you (the first user) sign up via a one-time bootstrap: we'll insert your email into `user_roles` as `super_admin` via an insert call once you give us the email to seed.

## Technical notes

- Use `onAuthStateChange` + `getSession` pattern; store session in Supabase client (already configured).
- Demo enforcement runs in `_authenticated` `beforeLoad` via a server function that checks `is_demo_active`.
- Invite tokens: random 32-byte url-safe; validated server-side; single-use.
- All role checks in RLS go through `has_role` security-definer to avoid recursion.

## Out of scope (for later)

- Per-role granular permissions (everyone gets full access now).
- @traceium.com domain restriction on `/console`.
- Email delivery for invites (we'll show the invite link in the UI for now; wire email later).
