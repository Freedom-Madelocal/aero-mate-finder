## Goal

Hide the admin tooling (Users, Organizations, CRM, Master Specs) from the regular platform UI and put it behind a dedicated admin console that only super admins can reach. Access is via the existing gear icon in the header, which becomes a dropdown menu.

## Changes

### 1. `src/components/DashboardLayout.tsx` — remove admin tabs + gear dropdown
- Delete the `superAdminNavItems` array entirely (Master Specs, Users, Orgs, CRM no longer appear as top-nav tabs for anyone, including super admins).
- Replace the gear `<Link to="/settings">` with a `DropdownMenu`:
  - Trigger: same gear icon.
  - For non-super-admins: dropdown shows a single item → **Settings** (`/settings`). (Or we can keep it a direct link; using a dropdown uniformly is simpler.)
  - For super admins: dropdown shows **Settings** (`/settings`) and **Admin Console** (`/admin`).
- Mirror this in the mobile sheet nav: remove admin items from the mobile list; add an "Admin Console" link below "Settings" when `isSuperAdmin`.

### 2. New admin console shell — `src/pages/admin/AdminConsole.tsx` + `src/routes/admin.tsx`
- New route `/admin` rendered with its own minimal layout (no `DashboardLayout`, no customer-facing chrome — visually distinct so it's clear you're in the console).
- Layout: dark header strip with "Traceium Admin Console" + a small sub-nav of tabs: **Users**, **Organizations**, **CRM**, **Master Specs**, plus a "Back to platform" link.
- `<Outlet />` renders the selected page.
- Client-side guard: `useAuth()` → if `!loading && !isSuperAdmin`, `navigate({ to: "/" })`. Same pattern already used in `Users.tsx`/`Organizations.tsx`.

### 3. Re-home the four pages under `/admin/*`
Create new route files that mount the existing page components under the admin layout:
- `src/routes/admin.index.tsx` → redirects to `/admin/users` (or shows a small landing).
- `src/routes/admin.users.tsx` → already exists, repoint to render inside the admin layout.
- `src/routes/admin.organizations.tsx` → same.
- `src/routes/admin.crm.tsx` → same.
- `src/routes/admin.master-specs.tsx` → new, renders existing `MasterSpecs` page component.
- Remove the top-level `src/routes/master-specs.tsx` route (or keep it as a redirect to `/admin/master-specs` for super admins / 404 for everyone else — recommend hard remove so customers cannot guess the URL).

The page components themselves (`pages/admin/Users.tsx`, `pages/admin/Organizations.tsx`, `pages/admin/Crm.tsx`, `pages/MasterSpecs.tsx`) keep their logic; only the surrounding chrome changes. Their existing "Back to dashboard" links get repointed to "Back to console" / `/admin`.

### 4. Route guards
All `/admin/*` routes:
- Add `meta: [{ name: "robots", content: "noindex,nofollow" }]` (already present on existing admin routes).
- Component-level guard via the admin layout's `useAuth()` check redirecting non-super-admins to `/`. Server data is already protected by RLS / server-fn role checks (e.g. `adminUsers.functions.ts` enforces `super_admin`), so no security regression.

### 5. Cleanup
- Remove `import` of admin nav items from `DashboardLayout`.
- Remove `MasterSpecs` preload from the workspace preloader (move it inside the admin layout, or drop it — customers don't need it).
- Leave `useMasterSpecStore` usage for the "X products · Y suppliers" badge intact (data is still loaded once via existing preloads on first super-admin visit to `/admin`).

## Out of scope
- No backend changes. RLS and the `super_admin` checks inside server functions already exist.
- No new auth flow — same `useAuth` + role check pattern.
- No changes to the `/console` terminal login flow.

## Verification
1. As a non-super-admin: header shows no Users/Orgs/CRM/Master Specs tabs; gear icon → dropdown with only "Settings"; visiting `/admin` directly redirects to `/`.
2. As super admin: header shows only the base tabs (Find materials, Crossover, Compare, Learn, Inventory, Procurement); gear icon → dropdown with "Settings" and "Admin Console"; `/admin` loads the console with its own header and the four sub-tabs all functional.
3. Mobile sheet mirrors the same behavior.
