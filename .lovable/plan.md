Two fixes: (1) apply the user's saved theme before the first paint so the default never flashes; (2) when a signed-in session goes stale (idle timeout, expired token, or failed refresh), sign the user out and route them to `/login` the moment they try to interact.

## 1. Theme: no flash of the default

**Problem**
- `src/routes/__root.tsx` `RootShell` hardcodes `<html className="dark">` and its inline bootstrap only restores `data-ui-theme="royal"`. The light/dark choice from `ThemeProvider` is applied in a `useEffect`, so on first paint every page appears in the wired-in dark theme, then swaps to the saved theme after hydration.
- `ThemeProvider` only reads `localStorage.theme` when `switchable: true`, so pages that pass a `defaultTheme` still stomp the saved value on mount.

**Fix**
- Extend the pre-hydration bootstrap in `RootShell` to also read `localStorage.theme` and add/remove the `.dark` class synchronously (falling back to `defaultTheme` only when nothing is stored). Remove the hardcoded `className="dark"` from `<html>` so the script owns the class.
- Update `src/contexts/ThemeContext.tsx` so the `useState` initializer always consults `localStorage.theme` first, regardless of `switchable`. Keep write-back gated on `switchable` so non-switchable pages don't overwrite the user's saved choice.
- Keep the existing `ui-theme-royal` branch of the bootstrap intact so the royal theme continues to survive the same way.

Net effect: the very first painted frame already carries the correct `.dark` class and `data-ui-theme` attribute — no default-theme flash.

## 2. Stale auth: auto-logout and force login on interaction

**Problem**
- `useIdleTimer` calls `supabase.auth.signOut()` after 15 min idle but never navigates, so the user stays on the protected page in a broken state (avatar becomes `?`, requests 401).
- There is no check for a *stale but not idle* session — e.g. laptop closed for hours, refresh token rotated out — so the first click after wake-up hits a protected route with an expired bearer.

**Fix**
- Add a `useSessionSentinel` hook (wired inside `AuthProvider`) that runs while `session` exists:
  - On `document` `visibilitychange → visible`, `window` `focus`, and any `click`/`keydown` bubbled to `document`, compare `session.expires_at` to `Date.now()`. If it's within a 30-second grace window of expiry, call `supabase.auth.refreshSession()`; if the refresh returns an error or no session, treat as stale.
  - Treat "stale" as: signOut → `queryClient.clear()` (via a small ref passed in from `__root.tsx`) → `router.navigate({ to: "/login", search: { redirect: current path }, replace: true })` and surface a single toast: "Your session expired. Please sign in again."
- Change the existing idle-timeout path in `useAuth.tsx` so the timeout callback and the dialog's "Sign out now" button both flow through a shared `forceSignOut()` that does the same signOut → clear cache → navigate to `/login` sequence. The `IdleWarningDialog` copy stays the same.
- Add a lightweight global click interceptor (capture-phase `pointerdown` on `document`) that, if a signOut is already in flight or the session is known-stale, `preventDefault`s the click and pushes `/login`. This guarantees the "if they become active, force them to the login screen if they try to click something" behaviour even during the async signOut round-trip.

**Files touched**
- `src/routes/__root.tsx` — extend bootstrap script, drop hardcoded `.dark` on `<html>`.
- `src/contexts/ThemeContext.tsx` — always seed from `localStorage.theme`.
- `src/hooks/useAuth.tsx` — introduce `forceSignOut`, wire router navigation, mount session sentinel, share it with the idle timer and dialog.
- `src/hooks/useSessionSentinel.ts` (new) — visibility/focus/interaction expiry check + refresh-or-logout logic.
- `src/hooks/useIdleTimer.ts` — no behaviour change; just call the new `forceSignOut` from `useAuth` instead of `supabase.auth.signOut()` directly.

**Not changed**
- Idle timeout duration (15 min) and warning window (1 min) stay as they are.
- Login page markup, theme tokens, and feature-flag driven `royal` styling are untouched.

**Verification**
- Load `/engineer` in a fresh tab with dark theme saved: no light-theme frame before hydration (visual check + Playwright screenshot on first paint).
- Load `/login` with light theme saved: no dark flash.
- Sign in, wait past idle → dialog appears, count-down completes → land on `/login?redirect=/engineer` with cache cleared.
- Sign in, manually set `session.expires_at` in devtools to a past value, click any nav link → intercepted, sent to `/login` with toast.
