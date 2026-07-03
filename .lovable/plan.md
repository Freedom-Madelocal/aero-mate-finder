In `src/pages/Landing.tsx`, drop the `doubledSuppliers` duplication and iterate over `bannerSuppliers` directly in the marquee. The outer `[...Array(2)]` already renders the full list twice for the seamless loop, so no extra doubling is needed.

- Remove lines 31–33 (the `doubledSuppliers` definition and comment).
- Change `doubledSuppliers.map(...)` on line 176 to `bannerSuppliers.map(...)`, and update the `key` accordingly.

No other files or behavior touched.
