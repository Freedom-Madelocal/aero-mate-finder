## Goal

Take the existing Traceum repo (`freedomnoble/traceum`) — a composites-native inventory OS with a "Material Intelligence" dark industrial design — and rebuild it on this Lovable TanStack Start template. Result: an identical-looking, fully working frontend running here, with the dev/server stack swapped out and Lovable Cloud enabled so we can replace mock seed data with a real backend in follow-up steps.

## What's in the source repo

- `client/` — Vite + React + wouter app. 11 pages: Dashboard, Inventory, MaterialDetail, Compliance, Documents, Suppliers, Orders, Engineer, Settings, Login, NotFound. Plus `DashboardLayout`, `ErrorBoundary`, `ManusDialog`, `Map`, `StatusTooltip`, `StockReportUpload`, full shadcn `ui/` set, contexts (`ThemeContext`), hooks, and a reactive in-memory store in `data/materials.ts` seeded from `data/mockSeed.ts` (~1300 lines of mock materials, lots, COA/COC, stock report).
- `server/index.ts` — minimal Express static server. Not needed here; TanStack Start handles SSR + serving.
- `shared/const.ts` — session cookie constants for an external OAuth portal (will be replaced by Lovable Cloud auth later).
- Design: Dark industrial minimalism, Geist + Geist Mono, charcoal `#111` / `#1C1C1C` / `#222` surfaces, status colors emerald/amber/red.

## Rebuild plan

### 1. Frontend port
- Copy `client/src/components/ui/*` (shadcn set) into `src/components/ui/`. Reconcile against the components already in this template — overwrite with source versions to keep design fidelity.
- Copy app components: `DashboardLayout`, `ErrorBoundary`, `ManusDialog`, `Map`, `StatusTooltip`, `StockReportUpload` into `src/components/`.
- Copy `contexts/`, `hooks/`, `lib/`, `data/materials.ts`, `data/mockSeed.ts`, `index.css` over. Merge `index.css` design tokens into `src/styles.css` (oklch tokens + Geist fonts + dark-industrial palette) so all Tailwind utilities resolve.
- Install missing deps: `wouter` is dropped; add anything else the source uses that isn't here (e.g. `cmdk`, `sonner`, `recharts`, `react-hook-form`, `zod`, `date-fns`, `lucide-react`, `axios`, etc. — verified against source `package.json`).

### 2. Routing migration (wouter → TanStack file-based)
Create one route file per page under `src/routes/`:

```text
src/routes/
  __root.tsx              (already exists — wrap with ThemeProvider, TooltipProvider, Toaster, ErrorBoundary, run seedMockData once)
  index.tsx               -> Dashboard
  inventory.tsx           -> Inventory
  material.$id.tsx        -> MaterialDetail (param: id)
  compliance.tsx
  documents.tsx
  suppliers.tsx
  orders.tsx
  engineer.tsx
  settings.tsx
  login.tsx
```

Each page gets a per-route `head()` with a unique title + meta description (SEO requirement of the template). Replace any `wouter` imports (`useLocation`, `Link`, `useRoute`) inside pages with the `@tanstack/react-router` equivalents (`useNavigate`, `Link`, `useParams`).

### 3. Shell + providers
Update `src/routes/__root.tsx` to:
- Mount `ThemeProvider` (default dark), `TooltipProvider`, `Toaster`, `ErrorBoundary`, and `QueryClientProvider` (already present).
- Call `seedMockData(...)` once on the client (guard for SSR with a `useEffect` in a client-only component) so the in-memory store still hydrates.

### 4. Drop the Express server
Delete `server/` and the static-serving logic — TanStack Start owns the dev server and SSR. Remove the `oauth-portal` based `getLoginUrl` in `const.ts`; the `Login` page will be rewired to Lovable Cloud auth in step 6.

### 5. Cleanup
- Remove `data-lovable-blank-page-placeholder` placeholder from `src/routes/index.tsx`.
- Verify no orphaned imports, no `wouter` references, no `process.env.VITE_*` usage that needs to become `import.meta.env`.
- Confirm `src/routeTree.gen.ts` regenerates cleanly.

### 6. Enable Lovable Cloud (foundation for backend work)
After the port builds, enable Lovable Cloud so the next iterations can:
- Replace `data/mockSeed.ts` + `useMaterialStore` with real Postgres tables (`materials`, `material_lots`, `coa_records`, `coc_records`, `stock_reports`, `suppliers`, `orders`).
- Add auth (email + Google) for engineers, sales, students/schools — with a `user_roles` table and RLS so distributors don't see each other's inventory.
- Move stock-report upload parsing to a server function and persist results.
- Add storage buckets for COA/COC PDFs.

These backend steps are out of scope for this turn — the deliverable here is a fully-running ported frontend on Cloud-ready infrastructure.

## Out of scope (next iterations)
- Schema design and migrations for materials/lots/COA/COC.
- Auth flows and role-based access (engineer vs. sales vs. student).
- Server functions for stock-report ingestion, supplier lead-time tracking, AI-assisted material search for the Engineer page.
- Replacing the `Map` component data source with real supplier coordinates.

## Technical notes
- Source uses `wouter`; target uses `@tanstack/react-router`. All `<Link href=>` become `<Link to=>`; `useLocation()[1]` becomes `useNavigate()`.
- Source `index.css` defines HSL tokens; this template requires `oklch` in `src/styles.css`. Convert the dark-industrial palette to oklch equivalents (charcoal `#111` ≈ `oklch(0.18 0 0)`, etc.) while keeping the same visual result.
- `seedMockData` writes to a module-level store; must run only on the client to avoid SSR hydration mismatches.
- Don't import `.server.ts` files from route files. No server functions are added in this turn.
