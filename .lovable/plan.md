## Goal
Add the 21st.dev "Infinite Grid" cursor-reveal component as the background layer of the hero section on `src/pages/Landing.tsx`, restyled to match the attached screenshot: dark background with faint grid, and the cell under the cursor lights up with our accent blue (`#2365FF` / `#144CCD`, the same blue used on the TDS badge) — bright glow at the bottom two corners of the hovered cell, softer blue outline around it, matching the reference.

The 21st.dev source requires auth to fetch, so I'll build a faithful equivalent from the public description ("Move your cursor to reveal the active grid layer. The pattern scrolls infinitely in the background.") — this is a small component and matches the behavior shown on their preview.

## Files

**New: `src/components/ui/the-infinite-grid.tsx`**
- Client component. Props: `className`, `cellSize` (default 96), `accent` (default our blue).
- Layer 1 (base): full-bleed faint grid drawn with `linear-gradient` (matches the current hero's grid look, kept subtle).
- Layer 2 (drift): a second identical grid with a slow `animation: grid-drift 40s linear infinite` translating by `cellSize` — gives the "infinite scroll" feel.
- Layer 3 (hover cell): tracks pointer via `onPointerMove`/`onPointerLeave` on the container; snaps `(x,y)` to the nearest `cellSize` and renders an absolutely positioned `motion.div` of size `cellSize × cellSize` with:
  - subtle blue border (`1px solid color-mix(in srgb, var(--accent) 45%, transparent)`)
  - two `radial-gradient` glows anchored at the bottom-left and bottom-right corners in the accent blue (mirrors the screenshot's bright corner lights)
  - `boxShadow` bloom outward for the ambient glow
  - `framer-motion` `animate={{ x, y }}` with a short spring so the highlight smoothly follows between cells
- Cursor tracking uses `getBoundingClientRect` so it works inside any container; `pointer-events: none` on all layers except the tracking wrapper.
- Respects `prefers-reduced-motion` (disables drift + spring transition).

**Edit: `src/pages/Landing.tsx` (hero section only, lines ~91–107)**
- Remove the two static overlay divs (radial-gradient wash + static 48px grid) and drop in `<TheInfiniteGrid className="absolute inset-0" />` behind the hero content.
- Keep the existing `<section>`, badge, heading, CTAs, and video exactly as they are. Content sits above via existing `relative z-*` on the inner container.
- Add the import at the top.

**Dependencies**
- `framer-motion` — check `package.json`; install with `bun add framer-motion` only if missing.

## Not doing
- No other sections touched.
- No global CSS token changes; the accent color is passed via prop using the existing blue used on the TDS badge.
- Not embedding the uploaded screenshot — it's reference only.
