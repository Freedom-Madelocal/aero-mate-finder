
# Mobile & Responsive Pass

Goal: make the entire app usable on phones and refined on tablets, while keeping the desktop view (≥1024px) pixel-identical.

Breakpoints (Tailwind defaults):
- Mobile: `<768px` — major changes
- Tablet: `768–1023px` — light tweaks
- Desktop: `≥1024px` — unchanged

## 1. App shell (`DashboardLayout.tsx`)

- Replace the always-visible sidebar with a responsive shell:
  - Desktop (`lg:`): current sidebar + top bar, unchanged.
  - Tablet: sidebar stays in icon-collapsed mode by default (existing `sidebarExpanded` toggle still works).
  - Mobile: sidebar hidden; hamburger button in the top bar opens it as a slide-in drawer (using shadcn `Sheet`). Drawer contains the same nav items + Settings link.
- Top bar on mobile: hamburger (left) → small Traceium icon → bell + avatar (right). Search input moves into the drawer (or hidden behind a search icon — minor; will go with hidden on mobile).
- Body padding: `p-6` → `p-4 md:p-6`.
- "All systems nominal" pill hidden on mobile (icon dot only).

## 2. Landing page (`Landing.tsx`)

- Hero: stacks vertically under `md`. Video moves below copy. CTAs become full-width buttons.
- Section grids (Problem / Platform / Engineer / Procurement): `md:grid-cols-2` → single column on mobile with reduced gap.
- Typography scales down: `text-6xl` → `text-4xl sm:text-5xl lg:text-6xl`.
- Header nav: condense to logo + "Book a demo" CTA only on mobile.
- Demo form: full-width inputs, single column.

## 3. Auth + simple pages

`Login.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `Invite.tsx`, `DemoExpired.tsx`, `NotFound.tsx`:
- Card containers get `w-full max-w-md mx-auto px-4`.
- Inputs full-width, larger tap targets (`h-11` on mobile).

## 4. Data-table pages — hybrid (cards on mobile, table on tablet+)

Affected: `Inventory.tsx`, `Procurement.tsx`, `Engineer.tsx`, `Orders.tsx`, `Suppliers.tsx`, `MasterSpecs.tsx`, `Documents.tsx`, `admin/Users.tsx`, `admin/Organizations.tsx`, `OrgTeam.tsx`.

Pattern per page:
- Wrap existing `<table>` in `<div className="hidden md:block overflow-x-auto">` so it stays a table on tablet+ with horizontal scroll if needed.
- Add a `<div className="md:hidden space-y-3">` that renders each row as a `Card` with key fields stacked label/value, and the same row actions (checkbox, buttons, status badges) on the right.
- Filter/search bars above tables: stack vertically on mobile, full-width controls.

## 5. Detail / form pages

- `MaterialDetail.tsx`: multi-column spec grid → single column on mobile; sticky action bar becomes a bottom sheet.
- `Settings.tsx`: tabs already responsive in shadcn; ensure tab list scrolls horizontally on narrow screens; form fields full-width.
- `LandingEditor.tsx`: textareas full-width; section accordion already works.
- `Dashboard.tsx`, `Compliance.tsx`, `Console.tsx`: KPI cards `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.

## 6. Dialogs

`ManusDialog`, `VendorContactsDialog`, `SpecSheetUpload`, `StockReportUpload`:
- Add `max-h-[90vh] overflow-y-auto` and `w-[95vw] sm:max-w-lg` so they fit on phone screens.

## 7. Shared utilities

- Add a small `useIsMobile` consolidation (already two duplicate files exist — `use-mobile.tsx` + `useMobile.tsx`); will keep both untouched to avoid rename risk and just import from `useMobile.tsx` where needed.

## What stays identical on desktop

Every `lg:` and unprefixed class above keeps the current desktop look. No changes to colors, fonts, spacing tokens, sidebar widths, table column counts, or any layout at ≥1024px.

## Out of scope

- No business logic changes.
- No new routes, no DB changes.
- No redesign of components — just responsive behavior.

## Risks / things I'll flag if encountered

- If a table has truly too many columns to scroll comfortably even on tablet, I'll note it and may hide low-priority columns under `lg:`.
- Master Specs has a wide filter sidebar; on mobile it will become a collapsible "Filters" sheet — confirming this counts as a structural change worth noting.
