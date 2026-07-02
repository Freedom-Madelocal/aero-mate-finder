# New UI Theme: "Royal Charcoal" (Neumorphic + Glass)

Gated behind existing `new_ui_theme` feature flag. When ON, the app switches to a dark neumorphism base with selective glassmorphism accents. When OFF, the current theme is untouched.

## Design tokens

Palette
- Base surface: `#1e1f22` (Royal Charcoal)
- Elevated surface: `#292D32` (neumorphic shape color)
- Deep shadow: `#141E30` (Navy Mirage dark)
- Highlight shadow: `#35577D` (Navy Mirage light) — used tinted, low opacity
- Accent: `#35577D` for interactive/active states
- Text primary: `rgba(245,245,245,1)`
- Text secondary: `rgba(245,245,245,0.72)`
- Text over glass headers: `rgba(255,255,255,0.9)`

Typography
- Headings: **Clash Display** (Fontshare) — 500/600, tracking `0.02em`; UPPERCASE labels/nav use `0.05em`
- Body: **Satoshi** (Fontshare) — 400 default, 500 on glass panels
- Loaded via `<link>` in `src/routes/__root.tsx` head
- New CSS vars `--font-display`, `--font-body`

Neumorphism utilities (in `src/styles.css` under `@utility`)
- `.neu-raised` — dual box-shadow (`-8px -8px 20px #383B40 / 38%`, `8px 8px 20px #101316 / 100%`) on `#292D32`
- `.neu-inset` — inner shadow variant for pressed/inputs
- `.neu-emboss-text` — text-shadow pair (`1px 1px 1px rgba(255,255,255,0.04)`, `-1px -1px 2px rgba(0,0,0,0.6)`) matching surface color, for counts + nav labels (Clash Display embossed effect)

Glass utilities
- `.glass-panel` — `background: rgba(53,87,125,0.14)`, `backdrop-filter: blur(20px) saturate(140%)`, `border: 1px solid rgba(255,255,255,0.08)`, subtle inner highlight
- `.glass-button` — pill/round variant with brighter border + specular highlight gradient
- Reserved for: primary CTAs, active nav pill, key modals/drawers, top-of-card action buttons

## Wiring

1. **Theme runtime** — new `src/contexts/UiThemeContext.tsx` reads `useFeatureFlag("new_ui_theme", false)` and toggles `data-ui-theme="royal"` on `<html>`. `ThemeProvider` continues to manage light/dark class.
2. **Scoped CSS** — all new tokens/utilities live under `:root[data-ui-theme="royal"] { … }` and `[data-ui-theme="royal"] .neu-*` so default theme is unaffected. shadcn semantic tokens (`--background`, `--card`, `--primary`, `--border`, `--input`, `--muted`, `--accent`, `--ring`, `--sidebar-*`) get remapped inside that scope so existing components automatically pick up the palette without touching component files.
3. **Font load** — Clash Display + Satoshi `<link>` added to root head unconditionally (needed as soon as flag flips; cheap). `body { font-family: var(--font-body); }` and `h1–h6 { font-family: var(--font-display); letter-spacing: 0.02em; }` scoped under `[data-ui-theme="royal"]`.
4. **Targeted component polish** (only where semantic tokens aren't enough):
   - `DashboardLayout` header/sidebar → `.glass-panel` when royal theme active
   - Nav item pills → `.neu-raised` default, `.glass-button` on active; label uses `.neu-emboss-text` uppercase tracking
   - Engineer material cards → `.neu-raised` container; primary action buttons → `.glass-button`
   - Count badges (compare count, unread, TID pills) → `.neu-emboss-text`
   - Inputs / search → `.neu-inset`
   - Dialogs/drawers → `.glass-panel`
5. **Feature-flag seed** — `new_ui_theme` row already exists; no migration needed.

## Verification

- Toggle flag off → screenshots of `/engineer`, `/master-specs`, `/compare`, `/admin/feature-flags` match current build (no visual diff).
- Toggle flag on → same routes render in royal charcoal, Clash/Satoshi loaded, neumorphic cards, glass header + primary buttons, embossed nav labels.
- Light-mode toggle path continues to work when flag is off; when flag is on, force dark (royal theme is dark-only for now).

## Files touched

- `src/styles.css` — add scoped tokens + `@utility neu-raised / neu-inset / neu-emboss-text / glass-panel / glass-button`
- `src/routes/__root.tsx` — Fontshare `<link>` tags; wrap tree in `UiThemeProvider`
- `src/contexts/UiThemeContext.tsx` — new, sets `data-ui-theme` attr from flag
- `src/components/DashboardLayout.tsx` — conditional class hooks for header/sidebar/nav
- `src/pages/Engineer.tsx` — card + primary button class hooks
- `src/pages/Compare.tsx`, `src/pages/MasterSpecs.tsx` — drawer/panel class hooks
- No changes to shadcn primitives, business logic, or data layer.
