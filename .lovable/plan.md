## Goal
Auto-logout after 15 minutes of inactivity, with a warning modal at 14 minutes (1 minute before logout).

## Approach
Add a new `useIdleLogout` hook wired into `AuthProvider` (only active when a session exists). It tracks user activity, shows a warning dialog at 14 min, and signs the user out at 15 min if there's no response.

## Implementation

1. **New file: `src/hooks/useIdleTimer.ts`**
   - Listens to `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`, `visibilitychange` on `window` (passive, throttled to ~1/sec).
   - Uses timestamps + a single `setTimeout` chain (not per-event resets) to stay cheap.
   - Exposes `{ showWarning, secondsLeft, stayActive, logoutNow }`.
   - Constants: `IDLE_MS = 15 * 60 * 1000`, `WARN_MS = 14 * 60 * 1000`.

2. **New file: `src/components/IdleWarningDialog.tsx`**
   - shadcn `AlertDialog` with title "You're about to be signed out", live countdown ("Signing out in Ns"), and two actions: "Stay signed in" and "Sign out now".
   - Uses existing design tokens (no hardcoded colors).

3. **Edit `src/hooks/useAuth.tsx`**
   - Inside `AuthProvider`, when `session` exists, mount the idle timer + dialog.
   - On timeout: call `supabase.auth.signOut()` (existing `onAuthStateChange` handles cleanup + redirect via route guard).
   - "Stay signed in" also calls `supabase.auth.refreshSession()` so the token is fresh (this incidentally addresses the "profile picture becomes ?" symptom, which is a stale-session issue).

4. **Session freshness fix (root cause of the "?" avatar)**
   - Add a `visibilitychange` listener in `AuthProvider` that calls `supabase.auth.refreshSession()` when the tab becomes visible after being hidden > 5 min. This prevents the avatar/signed-URL from breaking when the access token silently expires while the tab is backgrounded.

## Files
- add `src/hooks/useIdleTimer.ts`
- add `src/components/IdleWarningDialog.tsx`
- edit `src/hooks/useAuth.tsx` (mount timer + dialog, add visibility refresh)

## Not doing
- No changes to backend, Supabase config, or route guards.
- No changes to unrelated UI.
