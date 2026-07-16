# Embeddable White-Label Crossover Widget

Keep `/crossover` in the platform exactly as it is today. Add a parallel, standalone embeddable version that customers drop into their own website. Each customer gets their own branding, their own API key, and their own subscription record — all managed from the admin console.

## Deliverables

1. `/crossover` in-app: unchanged behavior; refactor extracts scoring into a shared module so the widget can't drift from it.
2. Public widget route `/embed/crossover?key=…` — no app chrome, no auth, brand-swapped per customer.
3. Two embed options for customers:
   - `<iframe>` snippet (primary, easiest)
   - `<script>` loader that injects the iframe and auto-resizes it
4. Admin console section **Widget Clients** with:
   - List of clients + subscription status
   - Create / edit client (brand name, logo, accent color)
   - Generate / rotate / revoke API key
   - Copy-ready iframe + script snippets
   - Basic activity: created, last used, requests-this-month (best-effort counter, no hard limit yet)

Out of scope, callable later without a rewrite: usage metering with hard caps, domain lockdown, Stripe billing automation, `widget.customer.com` custom domain, hiding the "Powered by Traceium" footer.

## Customer-facing embed

```html
<!-- Option A: iframe -->
<iframe
  src="https://traceium.io/embed/crossover?key=tw_live_abc123"
  style="width:100%;height:720px;border:0" loading="lazy"
  title="Material Crossover"></iframe>

<!-- Option B: script loader (auto-resizes) -->
<div id="traceium-crossover"></div>
<script src="https://traceium.io/widget.js"
  data-key="tw_live_abc123" data-target="#traceium-crossover" async></script>
```

## Widget UX

- Same search + candidates + differences panel as `/crossover` today.
- Header shows customer's logo + brand name (not Traceium).
- Accent color drives the search-bar border, arrow, "Plausible Match" pill, and highlights via CSS variables scoped to the widget root.
- Clicking a candidate opens an in-widget detail panel (no external navigation).
- Small "Powered by Traceium" footer (flag we can hide later per tier).
- If the key is missing, revoked, or the subscription is not active → render a neutral "This tool is currently unavailable" card. Never leak why.

## Admin console: Widget Clients

New tab **Widget Clients** in `AdminShell` (super-admin only, added to `TABS`).

Page `src/pages/admin/WidgetClients.tsx` shows a table of clients:

| Client | Status | Key prefix | Last used | Requests (30d) | Actions |

Row actions:
- **Edit branding** — drawer with brand name, logo upload (Supabase storage bucket `widget-logos`, public read), accent color picker (hex).
- **Rotate key** — generates a new key, invalidates the old, shows the full key once.
- **Revoke / restore** — flips `active`.
- **Subscription** — dropdown of `trial | active | past_due | cancelled`, plus a monthly price field and a start/renew date. This is a **record of truth for you**, not a billing integration; Stripe wiring is a later phase.
- **Copy snippets** — modal with both the iframe and script tags pre-filled with the client's key.
- **Create client** button → same edit drawer, then shows the generated key once.

## Technical Details

### Routing (no `_app` prefix → inherits no chrome/auth)

- `src/routes/embed.crossover.tsx` — reads `?key=` and renders `EmbedCrossover`. Sets `head()` `robots: noindex`.
- `src/routes/api/public/widget/config.ts` — GET `?key=` returns `{ brandName, logoUrl, accentColor, poweredBy: true }` after verifying the key + active subscription. 401 otherwise.
- `src/routes/api/public/widget/catalog.ts` — GET `?key=` returns the trimmed spec list Crossover needs. Same verification.
- `src/routes/api/public/widget-loader.ts` — GET returns the ~50-line `widget.js` (vanilla JS) with `Content-Type: application/javascript` and permissive CORS. Creates the iframe, listens for `postMessage({type:'traceium:height'})` and resizes.

All three public handlers set `Access-Control-Allow-Origin: *` and implement `OPTIONS`. `/embed/*` intentionally does NOT set `X-Frame-Options: DENY`.

### Key handling

- Format: `tw_live_` + 32 random URL-safe chars. Shown to admin once at creation/rotation, stored only as `sha256(key)`.
- Verification helper `verifyWidgetKey(key)` in `src/lib/widget.server.ts` — timing-safe hash compare against `widget_clients`, checks `active = true` and `subscription_status in ('trial','active')`. Returns the client row or null. Updates `last_used_at` (throttled to 1/min via a `last_used_at < now() - 1 minute` guard) and increments a monthly counter (`widget_usage_monthly (client_id, month, request_count)` upsert).
- No PII crosses the boundary — catalog only. Same data an authenticated Crossover user already sees.

### Shared scoring

Extract `normalizeCategory`, `normalizeChemistry`, `normalizeForm`, `tokens`, and the `equivalents` scoring memo from `src/pages/Crossover.tsx` into `src/lib/crossoverScoring.ts`. `Crossover.tsx` (in-app) and `EmbedCrossover.tsx` (widget) both import from there — one source of truth.

### Widget page

`src/pages/EmbedCrossover.tsx`:
- Fetches `/api/public/widget/config` and `/api/public/widget/catalog` on mount with the URL key.
- Applies branding via CSS vars on a widget root: `--accent-blue`, `--accent-blue-border` derived from `accentColor`.
- Renders logo + brand name header, search + results using the shared scoring lib, and the in-widget detail card.
- `ResizeObserver` on the widget root posts `{type:'traceium:height', height}` to `window.parent` for the script loader.
- Failure card when config/catalog returns 401.

### Database (one migration)

```sql
CREATE TABLE public.widget_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                        -- internal label
  brand_name text NOT NULL,                  -- shown in widget header
  logo_url text,
  accent_color text NOT NULL DEFAULT '#3B82F6',
  api_key_prefix text NOT NULL,              -- e.g. 'tw_live_abc1' (last 4 for display)
  api_key_hash text NOT NULL UNIQUE,         -- sha256 of full key
  active boolean NOT NULL DEFAULT true,
  subscription_status text NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial','active','past_due','cancelled')),
  monthly_price_usd numeric,
  subscription_started_at timestamptz,
  subscription_renews_at timestamptz,
  last_used_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.widget_usage_monthly (
  client_id uuid NOT NULL REFERENCES public.widget_clients(id) ON DELETE CASCADE,
  month date NOT NULL,                       -- first day of month
  request_count bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.widget_clients TO authenticated;
GRANT ALL ON public.widget_clients TO service_role;
GRANT SELECT ON public.widget_usage_monthly TO authenticated;
GRANT ALL ON public.widget_usage_monthly TO service_role;

ALTER TABLE public.widget_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_usage_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages widget_clients" ON public.widget_clients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "super_admin reads widget_usage" ON public.widget_usage_monthly
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_widget_clients_updated_at
  BEFORE UPDATE ON public.widget_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

Plus storage bucket `widget-logos` (public read) via `supabase--storage_create_bucket`.

The widget catalog read runs through `supabaseAdmin` inside the verified handler — the data is the same catalog signed-in Crossover already shows; RLS bypass is safe because we've verified the caller's key first.

### Server functions (super-admin only)

`src/lib/widgetClients.functions.ts` with `requireSupabaseAuth`, each verifying `has_role('super_admin')` via `context.supabase`:
- `listWidgetClients` — clients + current month request count
- `createWidgetClient(data)` — returns `{ client, apiKey }` once
- `updateWidgetClient(id, data)` — branding + subscription fields
- `rotateWidgetClientKey(id)` — returns new `apiKey` once
- `setWidgetClientActive(id, active)`
- `deleteWidgetClient(id)`

### Files

New:
- `supabase/migrations/<ts>_widget_clients.sql`
- `src/lib/crossoverScoring.ts`
- `src/lib/widget.server.ts` (key verify + usage counter)
- `src/lib/widgetClients.functions.ts`
- `src/pages/EmbedCrossover.tsx`
- `src/pages/admin/WidgetClients.tsx`
- `src/routes/embed.crossover.tsx`
- `src/routes/admin.widget-clients.tsx`
- `src/routes/api/public/widget/config.ts`
- `src/routes/api/public/widget/catalog.ts`
- `src/routes/api/public/widget-loader.ts`

Modified:
- `src/pages/Crossover.tsx` — import scoring from shared lib; UI unchanged.
- `src/components/AdminShell.tsx` — add `Widget Clients` tab.
- `src/pages/admin/AdminHome.tsx` — add nav card.

## Verification

- `/crossover` in-app renders and ranks identically after the scoring extraction (visual + spot-check two searches).
- Create a test client in admin, copy the iframe snippet into a local `test.html`, open it → widget renders with the test brand + accent color, search works, differences panel shows.
- Same test with the script snippet → iframe auto-sizes.
- `curl` catalog endpoint with bad key → 401; with good but revoked key → 401; with active key → JSON.
- Rotate key → old key returns 401, new key works.
- Set `subscription_status = 'cancelled'` → widget shows the neutral unavailable card.
- Admin table shows request count incremented after test loads.