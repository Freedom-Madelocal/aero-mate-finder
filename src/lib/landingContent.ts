// Editable copy for the landing page. Anything a super admin can change
// from /settings is stored here as a flat key->string map (jsonb in DB).

export type LandingContent = Record<string, string>;

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  // Hero
  hero_eyebrow: "Material intelligence for aerospace teams",
  hero_title_top: "Find qualified materials",
  hero_title_bottom: "and prove compliance in seconds.",
  hero_body:
    "Your engineers shouldn't lose a day to PDF archaeology. Your buyers shouldn't chase the same quotes every program. Your compliance team shouldn't dread the next audit. Traceium turns every spec, cert, lot, and vendor into one searchable system — so the answer takes seconds, not weeks.",
  hero_cta_primary: "Book a demo",
  hero_cta_secondary: "See how it works",
  hero_video_caption: "Live walkthrough — 200+ qualified specs narrowed to 3 in under 10 seconds.",

  // Problem
  problem_eyebrow: "Does this sound familiar?",
  problem_title: "Hours disappear. Deadlines don't.",
  problem_body:
    "Aerospace teams waste an estimated 6–10 hours every week hunting qualified materials and proof of compliance — across PDFs, network shares, vendor emails, and the one person who still remembers where things live. Engineers guess. Buyers chase. Compliance scrambles. Programs slip.",

  // Platform
  platform_eyebrow: "The solution",
  platform_title: "One searchable system for every material, cert, and vendor.",
  platform_body:
    "Traceium unifies vendor TDS, qualification reports, NASA outgassing data, COAs, lot history, and your live inventory into one queryable record per material. Engineers search by what matters. Procurement sees aggregated demand. Compliance pulls audit evidence in a click — no more inbox archaeology.",

  // Features (engineer)
  features_eyebrow: "For engineers",
  features_title: "Find the right material in seconds — not a Tuesday afternoon.",
  features_body:
    "Stop guessing whether something is already qualified. Filter 200+ aerospace materials by chemistry, form, cure window, Tg, outgassing, FR, and mechanical properties. Every result links to the full datasheet, qualification evidence, and current stock — without leaving the page.",

  // Procurement
  procurement_eyebrow: "For procurement & compliance",
  procurement_title: "Cut procurement cycles from weeks to hours — and prove compliance on demand.",
  procurement_body:
    "Every \"procure\" flag set by engineering flows into a shared queue, grouped by vendor with your saved contacts. One email per supplier, not three. Every cert, COA, and qualification record stays attached to the spec — so when an auditor asks, the answer is one click, not one week.",

  // Demo
  demo_eyebrow: "30-minute working demo",
  demo_title: "See Traceium against your real materials list.",
  demo_body:
    "Bring a parts list, a spec sheet, or just the problem you keep solving by hand. In 30 minutes we'll show you the hours your team could be getting back — and what audit-ready compliance actually feels like.",
};

export const LANDING_SECTIONS: Array<{
  label: string;
  fields: Array<{ key: keyof LandingContent | string; label: string; multiline?: boolean }>;
}> = [
  {
    label: "Hero",
    fields: [
      { key: "hero_eyebrow", label: "Eyebrow chip" },
      { key: "hero_title_top", label: "Title (line 1)" },
      { key: "hero_title_bottom", label: "Title (line 2)" },
      { key: "hero_body", label: "Body", multiline: true },
      { key: "hero_cta_primary", label: "Primary CTA" },
      { key: "hero_cta_secondary", label: "Secondary CTA" },
      { key: "hero_video_caption", label: "Video caption" },
    ],
  },
  {
    label: "Problem",
    fields: [
      { key: "problem_eyebrow", label: "Eyebrow" },
      { key: "problem_title", label: "Title" },
      { key: "problem_body", label: "Body", multiline: true },
    ],
  },
  {
    label: "Platform",
    fields: [
      { key: "platform_eyebrow", label: "Eyebrow" },
      { key: "platform_title", label: "Title" },
      { key: "platform_body", label: "Body", multiline: true },
    ],
  },
  {
    label: "Features (engineer)",
    fields: [
      { key: "features_eyebrow", label: "Eyebrow" },
      { key: "features_title", label: "Title" },
      { key: "features_body", label: "Body", multiline: true },
    ],
  },
  {
    label: "Procurement",
    fields: [
      { key: "procurement_eyebrow", label: "Eyebrow" },
      { key: "procurement_title", label: "Title" },
      { key: "procurement_body", label: "Body", multiline: true },
    ],
  },
  {
    label: "Demo form",
    fields: [
      { key: "demo_eyebrow", label: "Eyebrow" },
      { key: "demo_title", label: "Title" },
      { key: "demo_body", label: "Body", multiline: true },
    ],
  },
];
