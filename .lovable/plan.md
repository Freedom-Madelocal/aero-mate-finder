## What's happening

The "An unexpected error occurred" card with a stack trace + Reload Page button comes from the global `ErrorBoundary` in `src/components/ErrorBoundary.tsx` that wraps the whole app in `__root.tsx`. Once it catches an error it stays caught — it doesn't recover on its own. So either:

1. Something throws on the **first render** of `/master-specs` or `/engineer` (a null field, an undefined relation, a hydration mismatch), and reload clears it because state is different the second time, **or**
2. SSR on those routes throws, and the client retry succeeds.

Without the actual stack we'd be guessing — and the most likely guesses (auth not ready, a `null` field on a freshly-ingested row) are both plausible after the recent ingestion.

## Plan

**Step 1 — Make the error self-reporting.** Patch `ErrorBoundary` so it:
- `console.error`s the full `Error` (with stack) on `componentDidCatch` so it shows up in the preview console logs (which I can read directly).
- Adds a "Copy error" button next to "Reload Page" so you can paste it back to me in one click.
- Also logs `componentStack` (which React component threw).

**Step 2 — Once the stack is visible**, fix the actual culprit. Two strong suspects, in order:

- **Auth race on `/master-specs`.** `MasterSpecs.tsx` reads `useAuth().loading` and redirects non-super-admins, but other code on the page may run before `loading` flips. If you hit `/master-specs` directly, the page renders once with `isSuperAdmin=false` and `loading=true`, then again. Any non-null assertion in between throws.
- **A null field in a freshly-ingested row.** The 415-row ingest left some columns null (e.g. `vendor`, `product_name`, array fields). `rowToSpec` already guards arrays, but downstream code in `Engineer.tsx` (e.g. `s.vendor.toLowerCase()` in fuzzy match, `canon(s.materialCategory)`) may not. We'd add the missing guards.

**Step 3 — Verify** by hard-refreshing `/master-specs` and `/engineer` in the preview and confirming the error doesn't appear (and that the console is clean).

## Out of scope

- Redesigning the ErrorBoundary visually.
- Changing data ingestion or schema.
- Any UI work other than the boundary's logging + copy button.

## Why I'm asking before coding

If I patch suspected bugs without the stack, I'll likely guard the wrong field and you'll keep seeing the flash. The 5-line ErrorBoundary change above is the fastest way to get a real diagnosis. Once you hard-refresh once more after I ship Step 1, the stack will appear in console logs that I can read on your next message — no manual paste needed.

Approve and I'll do Step 1 immediately, then Step 2 in the same loop if the stack is already in the logs.