// Editable copy for the landing page. Anything a super admin can change
// from /settings is stored here as a flat key->string map (jsonb in DB).

export type LandingContent = Record<string, string>;

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  // Hero
  hero_eyebrow: "Built for aerospace engineers & procurement",
  hero_title_top: "Trace the data.",
  hero_title_bottom: "Build the future.",
  hero_body:
    "Aerospace is the most complex supply chain on Earth. Today your team sees a sea of data through a straw. Traceium ingests every spec, cert, lot, and inventory record — and turns it into the answer an engineer or buyer actually needed.",
  hero_cta_primary: "Book a demo",
  hero_cta_secondary: "See the platform",
  hero_video_caption: "Live walkthrough — engineers narrowing 200+ specs to 3 in seconds.",

  // Problem
  problem_eyebrow: "The problem",
  problem_title: "You're drinking the ocean through a straw.",
  problem_body:
    "An aerospace program touches thousands of qualified materials, each with a TDS, an SDS, a NASA outgassing report, a Tg curve, an out-life clock, an MOQ, a dozen vendor crossovers, and a lot history that lives in a binder, an inbox, and three different ERPs. Engineers guess. Buyers chase. Programs slip.",

  // Platform
  platform_eyebrow: "The platform",
  platform_title: "One source of truth for every material in your program.",
  platform_body:
    "Traceium ingests vendor TDS, internal qualification reports, NASA outgassing data, COAs, and your live inventory — and unifies them into a single, queryable model. Engineers search by what matters (cure temp, Tg, TML, chemistry, qualification). Procurement sees the aggregated demand and one-click reorders by vendor.",

  // Features (engineer)
  features_eyebrow: "For engineers",
  features_title: "Find the right material in seconds, not days.",
  features_body:
    "Traceium's engineer workspace is built around the questions you actually ask: what's qualified for a 350°F autoclave cure with CVCM < 0.1? Filter by chemistry, form, cure window, Tg, outgassing, mechanical properties, and process compatibility. Click any result for the full datasheet, qualification evidence, and current stock — without leaving the page.",

  // Procurement
  procurement_eyebrow: "For procurement",
  procurement_title: "Stop chasing emails. Aggregate demand, then send.",
  procurement_body:
    "Every \"procure\" flag set by an engineer flows into a shared queue. Traceium groups items by vendor, looks up your saved contacts, and drafts a single email per supplier — so Henkel gets one message with three parts, not three messages from three engineers. Frequent reorders are starred and surface automatically.",

  // Demo
  demo_eyebrow: "30-minute working demo",
  demo_title: "See Traceium against your own materials list.",
  demo_body:
    "Bring a parts list, a spec sheet, or just a problem you keep solving by hand. We'll load it live and show you what an engineer-first material system feels like.",
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
