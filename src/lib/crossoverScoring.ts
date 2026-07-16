/*
 * Shared crossover scoring logic used by both the in-app Crossover page
 * and the embeddable white-label widget. Deterministic, no AI.
 */

export interface ScorableSpec {
  id: string;
  vendor: string;
  productName: string;
  productFamily: string | null;
  materialCategory: string | null;
  resinChemistry: string | null;
  productForm: string | null;
  cureTemperatureC: number | null;
  applications: string | null;
  profiles: string[] | null;
  crossoverProduct: string | null;
  keySpecs?: string[] | null;
}

export interface ScoredMatch<T extends ScorableSpec> {
  spec: T;
  score: number;
}

export function scoreCandidates<T extends ScorableSpec>(
  selected: T,
  catalog: T[],
  limit = 5,
): T[] {
  const sCat = normalizeCategory(selected.materialCategory);
  const sChem = normalizeChemistry(selected.resinChemistry);
  const sForm = normalizeForm(selected.productForm ?? selected.materialCategory);
  const sSegs = tokens(selected.applications, selected.profiles);

  return catalog
    .filter((s) => s.id !== selected.id && s.vendor !== selected.vendor)
    .map<ScoredMatch<T>>((s) => {
      let score = 0;
      if (sCat && normalizeCategory(s.materialCategory) === sCat) score += 5;
      if (sChem && normalizeChemistry(s.resinChemistry) === sChem) score += 4;
      if (
        selected.cureTemperatureC != null &&
        s.cureTemperatureC != null &&
        Math.abs(s.cureTemperatureC - selected.cureTemperatureC) <= 15
      )
        score += 2;
      const tForm = normalizeForm(s.productForm ?? s.materialCategory);
      if (sForm && tForm && sForm === tForm) score += 2;
      const tSegs = tokens(s.applications, s.profiles);
      if (sSegs.size && [...tSegs].some((t) => sSegs.has(t))) score += 1;
      if (
        (selected.crossoverProduct &&
          s.productName?.toLowerCase().includes(selected.crossoverProduct.toLowerCase())) ||
        (s.crossoverProduct &&
          selected.productName?.toLowerCase().includes(s.crossoverProduct.toLowerCase()))
      )
        score += 100;
      return { spec: s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.spec);
}

export function searchSuggestions<T extends ScorableSpec>(
  query: string,
  catalog: T[],
  limit = 6,
): T[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return catalog
    .filter((s) => {
      const hay = [
        s.productName,
        s.vendor,
        s.productFamily,
        ...((s.keySpecs ?? []) as string[]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit);
}

export function normalizeCategory(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.toLowerCase().split(/[—\-(]/)[0].trim();
  if (/film\s*adhesive|adhesive\s*film/.test(s)) return "film-adhesive";
  if (/paste\s*adhesive|liquid\s*adhesive/.test(s)) return "paste-adhesive";
  if (/sealant/.test(s)) return "sealant";
  if (/potting|encapsulant/.test(s)) return "potting";
  if (/primer/.test(s)) return "primer";
  if (/mold\s*release/.test(s)) return "mold-release";
  if (/emi|conductive/.test(s)) return "emi";
  if (/thermal/.test(s) && !/thermoset|thermoplastic/.test(s)) return "thermal";
  if (/rtm|infusion|liquid\s*resin/.test(s)) return "liquid-resin";
  if (/reinforcement|fabric|fiber|tow|weave/.test(s)) return "reinforcement";
  if (/tooling/.test(s)) return "tooling";
  if (/surfac|surface\s*film/.test(s)) return "surfacing-film";
  if (/honeycomb|core/.test(s)) return "core";
  if (/prepreg/.test(s)) return "prepreg";
  return s.replace(/\s+/g, "-");
}

export function normalizeChemistry(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (/bmi|bismaleimide/.test(s)) return "bmi";
  if (/cyanate/.test(s)) return "cyanate-ester";
  if (/phenolic/.test(s)) return "phenolic";
  if (/silicone/.test(s)) return "silicone";
  if (/polyurethane|urethane/.test(s)) return "polyurethane";
  if (/polysulfide/.test(s)) return "polysulfide";
  if (/acrylic/.test(s)) return "acrylic";
  if (/peek/.test(s)) return "peek";
  if (/paek/.test(s)) return "paek";
  if (/pps/.test(s)) return "pps";
  if (/pei/.test(s)) return "pei";
  if (/polyimide/.test(s)) return "polyimide";
  if (/epoxy/.test(s)) return "epoxy";
  return s.split(/[\s/]+/)[0] || null;
}

export function normalizeForm(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (/film/.test(s)) return "film";
  if (/paste/.test(s)) return "paste";
  if (/tape|ud/.test(s)) return "tape";
  if (/fabric|weave|woven/.test(s)) return "fabric";
  if (/tow|roving/.test(s)) return "tow";
  if (/liquid|resin/.test(s)) return "liquid";
  return null;
}

function tokens(applications: string | null, profiles: string[] | null): Set<string> {
  const out = new Set<string>();
  const add = (str: string) => {
    str
      .toLowerCase()
      .split(/[;,/]+|\s+and\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 3)
      .forEach((t) => out.add(t));
  };
  if (applications) add(applications);
  (profiles ?? []).forEach(add);
  return out;
}
