
# Crossover — diagnosis and fix

## What I found

**The page is not broken. The matching logic is too strict for the catalog you have.**

Your `master_specs` table has 828 products across 5 main vendors (3M 178, Henkel 152, Hexcel 209, Syensqo 69, Toray 211). 812 have both `material_category` and `resin_chemistry` populated, so the data is there.

But `Crossover.tsx` requires an **exact string match on BOTH `materialCategory` AND `resinChemistry`** between two different vendors. Run against the live data, exactly **one** category+chemistry pair matches across vendors (`Thermoset Prepreg — Epoxy` + `Epoxy`, 2 vendors). That's why nearly every search returns "No equivalents."

Why: the categories in the data are vendor-phrased and ultra-granular, e.g.:
- `Prepreg — Epoxy (Self-Adhesive, FR)` (Hexcel)
- `Thermoset Prepreg — Toughened Epoxy` (Syensqo)
- `Film Adhesive — Metal & Honeycomb` (Henkel)
- `Structural Adhesive Film` (3M)

These are functionally equivalent but never string-equal. Same for chemistry (`Epoxy` vs `Epoxy Film` vs `Toughened Epoxy` vs `Toughened Epoxy OOA`).

The uploaded spreadsheet (`Traceium_Master_Crossover-2-2.xlsx`) is the **same source data** already in the DB (401 products, same columns). It does **not** contain explicit crossover mappings — there's no "equivalent to" column. So crossovers have to be derived, not imported.

## Recommended fix (no schema changes, no re-upload)

Replace the strict equality match in `src/pages/Crossover.tsx` with a normalized, scored match.

1. **Normalize** category + chemistry into canonical buckets before comparing:
   - Category → strip everything after `—`/`(`, lowercase, map synonyms:
     - "structural adhesive film", "film adhesive*" → `film-adhesive`
     - "prepreg*", "thermoset prepreg*" → `prepreg`
     - "paste adhesive*" → `paste-adhesive`
     - "sealant*" → `sealant`
     - "potting*" → `potting`
     - "rtm resin*", "infusion resin*" → `liquid-resin`
     - "reinforcement*", "fabric*", "fiber*" → `reinforcement`
   - Chemistry → first token, lowercase: `epoxy`, `bmi`, `cyanate`, `phenolic`, `silicone`, `polyurethane`, `acrylic`, `polysulfide`, `peek`, `paek`, etc. "Toughened Epoxy OOA" → `epoxy`.

2. **Score** candidates instead of binary-filtering. Sort by score, take top 5:
   - +5 same normalized category
   - +4 same normalized chemistry
   - +2 cure temp within ±15 °C
   - +2 same product form (film/paste/tape/fabric)
   - +1 overlapping aerospace segment / application keyword
   - −∞ same vendor (exclude)
   - Keep the existing `crossoverProduct` pointer match as an automatic top hit.

3. **Always show something**: drop the strict filter; if score > 0, show it (mark "Best match" only when score ≥ 9).

This is a ~60-line change to one file, no DB migration, no re-upload, and will surface real equivalents across all 5 vendors immediately.

## Optional follow-ups (later)

- Add an "Equivalence confidence" badge (High / Likely / Possible) based on score.
- Persist canonical buckets as derived columns (`category_bucket`, `chemistry_bucket`) via a migration so other pages (Compare, search) benefit too.
- If you want curated/expert crossovers, add a `crossovers` table (source_id, target_id, confidence, note) and a small admin UI — the spreadsheet would need a new column for this.

## Scope of the implementation step

Single file: `src/pages/Crossover.tsx` — replace the `equivalents` useMemo and add a `score()` helper plus the two normalizer maps. No other files, no backend, no schema changes.
