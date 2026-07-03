## Changes to `src/styles.css` (TDS glass badge only)

**Tone the blue down** — reduce saturation/opacity of every blue mix in `.tds-glass-badge`, its `:hover` state, and `.tds-glass-liquid`:
- Bottom-edge inner glow: `#144CCD 80%` → `~40%`, `#2365FF 35%` → `~20%`.
- Hover shadows: drop each blue mix by roughly half (e.g. `#2365FF 60%` → `30%`, `#6694FF 75%` → `40%`, outer glow `#2365FF 35%` → `18%`).
- Hover border: `#6694ff 55%` → `~30%`.
- Liquid ripple gradients: `#2365FF 55%` → `28%`, `#6694FF 45%` → `22%`.

**Slow the liquid-metal animation** — change `animation: tds-liquid-drift 3.2s ...` to `~6.5s` (about half speed). Keyframes unchanged.

No other files touched; component markup, layout, and behavior stay identical.
