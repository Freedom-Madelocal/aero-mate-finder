## Easter egg: π → "The Net" sequence → Admin terminal

A tiny π glyph in the bottom corner of `/` triggers a cinematic fullscreen image flicker (à la *The Net*), then lands on a Midjourney-style terminal/console page with Log In and Sign In options for an admin console.

### 1. Trigger on Landing page
- Add a small, low-contrast `π` button fixed to the bottom-right of `/` (Landing.tsx). No label, ~12px, muted opacity, hover brightens.
- onClick navigates to a new route `/π` (encoded `/%CF%80`) — keeps it secret, shareable.

### 2. The Net sequence (`src/routes/π.tsx` → `src/pages/NetSequence.tsx`)
- Fullscreen black overlay that rapidly cycles through ~10–14 random fullscreen images for ~3–4 seconds total:
  - Mix of glitchy/cinematic stills: code rain, satellite map, blueprint, radar sweep, schematic, redacted document, fingerprint, CRT static, hex dump, retina scan, server racks.
  - Sourced as generated images saved under `src/assets/net/*.jpg` (generate ~10 with imagegen, fast tier).
- Each frame shows ~150–250ms with cuts between black flashes; subtle scanline + chromatic aberration via CSS filters; soft VHS noise overlay.
- Skippable with any key/click.
- Auto-advances to `/console` when sequence ends (or on skip).

### 3. Admin console page (`src/routes/console.tsx` → `src/pages/Console.tsx`)
Midjourney-landing-style terminal:
- Pure black background, monospace (Geist Mono), centered narrow column.
- ASCII / minimal logo at top.
- Boot lines stream in with a typewriter effect:
  ```
  traceium :: secure shell v0.1
  authenticating session… ok
  > select operation
  ```
- Two prompt options rendered as terminal commands:
  - `> login` — routes to existing `/login`
  - `> signin` — routes to existing `/login` (signup tab placeholder; reuse Login until a separate signup exists)
- Keyboard support: arrow keys to move a `▌` caret cursor, Enter to select; clicking also works.
- Blinking cursor, subtle CRT vignette, no chrome/sidebar.

### 4. Routes & wiring
- Create `src/routes/π.tsx` and `src/routes/console.tsx` (TanStack file routes, public, with `head()` meta = `noindex`).
- Both routes render outside DashboardLayout (full-bleed, like Landing).
- Add the π button to `src/pages/Landing.tsx`.

### Technical notes
- Images: 10 fast-tier 1280×720 JPGs in `src/assets/net/`, imported and shuffled at runtime.
- Animation: pure CSS keyframes + `setTimeout` chain in a `useEffect`; cleanup on unmount.
- Accessibility: `prefers-reduced-motion` shortens to 1 frame + fade; ESC skips.
- No backend changes. No auth logic changes — Console just links to `/login`.
