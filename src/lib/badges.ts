// Shared badge color mapping for the mockup-style cards.
// Colors come from semantic tokens defined in src/styles.css.

export type BadgeColor = { bg: string; color: string; border: string };

const make = (token: string, color = token): BadgeColor => ({
  bg: `color-mix(in srgb, ${token} 12%, transparent)`,
  color,
  border: `color-mix(in srgb, ${token} 40%, transparent)`,
});

const SUPPLIER_TOKENS: Record<string, string> = {
  hexcel: "var(--supplier-hexcel)",
  toray: "var(--supplier-toray)",
  syensqo: "var(--supplier-syensqo)",
  "solvay": "var(--supplier-syensqo)",
  "3m": "var(--supplier-3m)",
  henkel: "var(--supplier-henkel)",
};

export function supplierBadge(vendor: string | null | undefined): BadgeColor {
  if (!vendor) return make("var(--accent-blue)");
  const key = vendor.trim().toLowerCase();
  for (const [k, v] of Object.entries(SUPPLIER_TOKENS)) {
    if (key.includes(k)) return make(v);
  }
  return make("var(--accent-blue)");
}

const CHEM_TOKENS: Record<string, string> = {
  epoxy: "var(--accent-blue)",
  bmi: "var(--warn-amber)",
  bismaleimide: "var(--warn-amber)",
  cyanate: "var(--chemistry-purple)",
  peek: "var(--ok-green)",
  pekk: "var(--ok-green)",
  lmpaek: "var(--ok-green)",
  phenolic: "var(--chemistry-red)",
  polyimide: "var(--warn-amber)",
};

export function chemistryBadge(chem: string | null | undefined): BadgeColor {
  if (!chem) return make("var(--muted-foreground)", "var(--muted-foreground)");
  const key = chem.trim().toLowerCase();
  for (const [k, v] of Object.entries(CHEM_TOKENS)) {
    if (key.includes(k)) return make(v);
  }
  return make("var(--accent-blue)");
}

export const okBadge: BadgeColor = {
  bg: "var(--ok-green-soft)",
  color: "var(--ok-green)",
  border: "var(--ok-green-border)",
};

export const warnBadge: BadgeColor = {
  bg: "var(--warn-amber-soft)",
  color: "var(--warn-amber)",
  border: "var(--warn-amber-border)",
};
