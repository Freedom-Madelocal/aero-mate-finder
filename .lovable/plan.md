
# Profile drawer from the avatar

Click the avatar in the top-right of the dashboard header → a sheet slides in from the right with: profile photo, full name, email (read-only), and a logout button.

## What changes

### 1. Database
- Add `avatar_url TEXT` column to `profiles`.
- Create a public `avatars` storage bucket.
- RLS on `storage.objects` for the `avatars` bucket:
  - Anyone can read (public bucket).
  - Authenticated users can insert/update/delete only files inside a folder named after their own user id (`{user_id}/...`).

### 2. Frontend
- New `ProfileDrawer.tsx` component using shadcn `Sheet` (`side="right"`).
  - Avatar preview (large, circular). Click to upload.
  - File input accepts images; compressed client-side to ~512×512 max, JPEG quality 0.85, before upload (using a canvas — no extra dependency).
  - On upload: write to `avatars/{user_id}/avatar-{timestamp}.jpg`, get public URL, save to `profiles.avatar_url`.
  - "Full name" text input with Save button → `profiles.update({ full_name })`.
  - Email shown read-only.
  - Role badge(s) read-only.
  - Logout button at the bottom calls `signOut()` and redirects to `/login`.
- `useAuth` already exposes `profile`/`refresh`/`signOut`. Extend `Profile` type with `avatar_url: string | null` (already loaded via `select("*")`).
- `DashboardLayout`:
  - Replace the static "OP" circle in the header with a button that opens `ProfileDrawer`.
  - Show the user's avatar image if `profile.avatar_url` exists, otherwise show initials derived from `full_name` or email.
  - Works on both desktop and mobile (already responsive header).

### 3. Image compression details
Pure browser, no library:
1. Read file → `<img>` via `URL.createObjectURL`.
2. Draw onto canvas, scaling longest edge to 512px.
3. `canvas.toBlob(..., "image/jpeg", 0.85)` → upload Blob.
Keeps avatars under ~50 KB and storage costs minimal.

## Out of scope
- Cropping UI (just center-fits the uploaded image).
- Changing email or password (those stay in `/settings`).
- Removing avatar (can be added later; for now just re-upload to replace).

## Files touched
- `supabase/migrations/<new>.sql` — add column, bucket, policies.
- `src/integrations/supabase/types.ts` — auto-regenerated.
- `src/hooks/useAuth.tsx` — add `avatar_url` to `Profile` interface.
- `src/components/ProfileDrawer.tsx` — new.
- `src/components/DashboardLayout.tsx` — wire the avatar button.
