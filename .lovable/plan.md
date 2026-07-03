## Goal
Let the user resize the TDS PDF drawer by dragging a small grab handle on its right edge.

## Changes
- **`src/components/TdsPdfViewer.tsx`**
  - Replace the fixed responsive width classes on `<SheetContent side="left">` with a controlled inline `width` (in `vw`), starting at ~60vw (clamped 30–95vw), persisted to `localStorage` (`tds-drawer-width`) so it survives close/reopen.
  - Add a thin (4px) vertical grab handle absolutely positioned on the drawer's right edge:
    - Cursor `col-resize`, subtle divider color, a small centered "grip" dot pattern that brightens on hover/drag.
    - `onPointerDown` starts a drag; `pointermove` updates width from `e.clientX` (as `vw`); `pointerup` ends it. Uses pointer capture so drags outside the handle keep working.
    - Double-click resets to the default width.
    - `aria-label="Resize PDF drawer"`, `role="separator"`, `aria-orientation="vertical"`, keyboard support: Left/Right arrows nudge ±2vw, Shift+Arrow ±8vw.
  - While dragging: disable text selection (`user-select: none` on body) and add `pointer-events-none` to the iframe so the drag isn't swallowed by the PDF viewer.

## Notes
- No changes to call sites, storage, or the PDF fetching logic.
- No new dependencies — plain pointer events.

Approve to implement.