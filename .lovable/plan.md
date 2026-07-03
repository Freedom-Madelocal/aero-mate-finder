Two changes, both in landing surface files.

## 1. Seamless supplier marquee (`src/pages/Landing.tsx`)
Current: two halves of the list, animated `translateX(0 → -50%)`. On wide viewports one half is narrower than the screen, so a gap appears at the tail and the reset back to `0%` reads as a jump.

Fix:
- Inside each of the two halves, repeat `bannerSuppliers` 6× (so each half is comfortably wider than any realistic viewport). The two halves stay identical, keeping the `-50%` reset seamless.
- Remove `pr-20` on the trailing edge of each half and use `gap-20` only, so spacing between the last item of one half and the first item of the next matches the intra-half spacing exactly.
- Key: `` `${copyIndex}-${repeatIndex}-${supplier}` ``.

Keyframes in `src/styles.css` stay unchanged (`0% → -50%`).

## 2. Replace infinite grid with the 21st.dev version (`src/components/ui/the-infinite-grid.tsx`)
The pasted code was stripped of most of its JSX by the chat renderer, but the essential algorithm is intact and public:
- `mouseX` / `mouseY` motion values, updated on `onMouseMove` via `getBoundingClientRect`.
- Two motion values `gridOffsetX` / `gridOffsetY` driven by `useAnimationFrame`, incremented `0.5px` per frame modulo `40` (grid cell size 40px).
- Radial mask via `useMotionTemplate`: `radial-gradient(300px circle at ${mouseX}px ${mouseY}px, black, transparent)`.

Rewrite the component to match, dropping the accent-blue/corner-glow customization:
- Container: `relative overflow-hidden bg-background` with `onMouseMove` handler; sizes to parent (`className` passthrough).
- Layer 1 (base, always visible): drifting 40×40 grid drawn via two `linear-gradient` backgrounds using a subtle line color (`oklch(1 0 0 / 0.06)`), with `motion.div`'s `style={{ backgroundPosition: useMotionTemplate\`${gridOffsetX}px ${gridOffsetY}px\` }}` for the infinite scroll.
- Layer 2 (revealed on hover): same drifting grid at higher opacity/brightness (`oklch(1 0 0 / 0.35)`), with `style={{ maskImage, WebkitMaskImage: maskImage }}` so only the 300px circle under the cursor is visible.
- Remove props `accent`, `lineColor`, `cellSize`, corner-glow highlight cell, and framer-motion spring — no per-cell snap, no border, no boxShadow.
- Keep the file exporting `TheInfiniteGrid` (named + default) so `src/pages/Landing.tsx` keeps working without an import change.

## Not doing
- No other content edits.
- Not embedding the pasted demo's `<button>`, heading, or "Interact (N)" counter — the component is a background layer inside the existing hero, not a standalone demo.
