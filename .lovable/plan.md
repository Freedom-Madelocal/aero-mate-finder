# Hide /dashboard, default landing to /engineer

`/dashboard` is no longer the entry point for any role. The route file stays (so existing bookmarks still resolve), but no UI links to it, and post-login redirects skip it.

## Changes

**1. `src/hooks/useAuth.tsx` — `landingForRoles`**

New rule: procurement-only users land on `/procurement`. Everyone else (super_admin, org_admin, engineer, dev, integrator, or no role) lands on `/engineer`.

```ts
export function landingForRoles(roles: AppRole[]): "/engineer" | "/procurement" {
  // Procurement-only users keep their current landing
  if (roles.includes("procurement") && !roles.some(r => r !== "procurement")) {
    return "/procurement";
  }
  return "/engineer";
}
```

This automatically fixes the two callers (`src/pages/Login.tsx`, `src/pages/AcceptInvite.tsx`).

**2. `src/pages/ConsoleLogin.tsx` (line 38)**

Replace the hardcoded `navigate({ to: "/dashboard" })` with `navigate({ to: "/engineer" })`. (Console login is super-admin and should follow the same default.)

**3. `src/pages/Settings.tsx` (lines 36–37)**

Change the "Back to dashboard" link to point to `/engineer` and relabel it "Back to workspace" so nothing in the UI still says "dashboard".

**4. `src/components/DashboardLayout.tsx`**

Confirmed `/dashboard` is already absent from `baseNavItems`, so no nav change is needed.

## Out of scope

- Not deleting `src/routes/_app.dashboard.tsx` or `src/pages/Dashboard.tsx` — direct visits to `/dashboard` still work for anyone with a bookmark, it's just no longer surfaced or auto-routed-to.
- No changes to role permissions or RLS.
