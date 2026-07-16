import { describe, it, expect } from "vitest";
import { buildSafePatch, type ExtractedRow } from "@/lib/tdsExtract.server";
import {
  CORRECTION_86A,
  CORRECTION_KEY,
} from "@/lib/spec3MAdhesionPromoter86A.functions";

/**
 * Phase 2A tests. These validate the merge/schema decisions without touching
 * the network — no PDF, no gateway, no Supabase.
 */

function baseRow(overrides: Partial<ExtractedRow> = {}): ExtractedRow {
  return {
    provenance: [],
    ...overrides,
  };
}

describe("buildSafePatch — null preservation (Phase 2A)", () => {
  it("legacy 0 in cure_temperature_c/out_life_days/freezer_life_months is treated as missing", () => {
    const row = baseRow({
      cureTemperatureC: 121,
      outLifeDays: 30,
      freezerLifeMonths: 6,
      provenance: [
        { field: "cureTemperatureC", quote: "Cure at 121 °C", page: 2, confidence: "high" },
        { field: "outLifeDays", quote: "Out-life: 30 days", page: 3, confidence: "high" },
        { field: "freezerLifeMonths", quote: "Freezer life: 6 months", page: 3, confidence: "high" },
      ],
    });
    const spec = { cure_temperature_c: 0, out_life_days: 0, freezer_life_months: 0 };
    const { patch, updated } = buildSafePatch(row, spec);
    expect(patch.cure_temperature_c).toBe(121);
    expect(patch.out_life_days).toBe(30);
    expect(patch.freezer_life_months).toBe(6);
    expect(updated).toEqual(expect.arrayContaining(["cure_temperature_c", "out_life_days", "freezer_life_months"]));
  });

  it("legacy 0 in tml_pct / cvcm_pct is a real reading and is preserved (not overwritten)", () => {
    const row = baseRow({
      tmlPct: 0.5,
      provenance: [{ field: "tmlPct", quote: "TML: 0.5%", page: 4, confidence: "high" }],
    });
    const spec = { tml_pct: 0 };
    const { patch } = buildSafePatch(row, spec);
    expect(patch.tml_pct).toBeUndefined();
  });

  it("never overwrites a curated non-empty numeric value", () => {
    const row = baseRow({
      cureTemperatureC: 121,
      provenance: [{ field: "cureTemperatureC", quote: "121 °C", page: 1, confidence: "high" }],
    });
    const { patch } = buildSafePatch(row, { cure_temperature_c: 150 });
    expect(patch.cure_temperature_c).toBeUndefined();
  });

  it("never overwrites a curated non-empty text value", () => {
    const row = baseRow({ productForm: "liquid" });
    const { patch } = buildSafePatch(row, { product_form: "Prepreg" });
    expect(patch.product_form).toBeUndefined();
  });
});

describe("buildSafePatch — grouped standards (Phase 2A)", () => {
  it("writes qualifications / test_methods / contextual_standards into empty jsonb columns", () => {
    const row = baseRow({
      qualifications: [{ standard: "MIL-PRF-XYZ", evidence_quote: "conforms to MIL-PRF-XYZ" }],
      testMethods: [{ method: "ASTM D1000", evidence_quote: "tested per ASTM D1000" }],
      contextualStandards: [
        { standard: "MIL-PRF-85285 Type IV", role: "tested_substrate_coating" },
      ],
    });
    const { patch, updated } = buildSafePatch(row, {});
    expect(patch.qualifications).toHaveLength(1);
    expect(patch.test_methods).toHaveLength(1);
    expect(patch.contextual_standards).toHaveLength(1);
    expect(updated).toEqual(expect.arrayContaining(["qualifications", "test_methods", "contextual_standards"]));
  });

  it("does NOT overwrite an existing curated qualifications[] array", () => {
    const row = baseRow({
      qualifications: [{ standard: "MIL-PRF-XYZ" }],
    });
    const spec = { qualifications: [{ standard: "AIMS 05-04-000" }] };
    const { patch } = buildSafePatch(row, spec);
    expect(patch.qualifications).toBeUndefined();
  });

  it("populates legacy qualifications_standards text back-compat when only structured qualifications came through", () => {
    const row = baseRow({
      qualifications: [
        { standard: "MIL-PRF-A" },
        { standard: "MIL-PRF-B" },
      ],
    });
    const { patch } = buildSafePatch(row, {});
    expect(patch.qualifications_standards).toBe("MIL-PRF-A, MIL-PRF-B");
  });

  it("does NOT touch qualifications_standards when curator already filled it", () => {
    const row = baseRow({ qualifications: [{ standard: "MIL-PRF-A" }] });
    const { patch } = buildSafePatch(row, { qualifications_standards: "existing text" });
    expect(patch.qualifications_standards).toBeUndefined();
  });
});

describe("buildSafePatch — new canonical fields (Phase 2A)", () => {
  it("writes application_process / shelf_life_months / storage_temp_* / active_ingredient_or_resin when empty", () => {
    const row = baseRow({
      applicationProcess: "apply, dry 10 min, tape within 2 hours",
      activeIngredientOrResin: "polyamide",
      shelfLifeMonths: 24,
      storageTempMinC: 16,
      storageTempMaxC: 27,
      provenance: [
        { field: "shelfLifeMonths", quote: "Shelf life: 24 months", page: 1, confidence: "high" },
        { field: "storageTempMinC", quote: "Store 60–80 °F", page: 1, confidence: "high" },
        { field: "storageTempMaxC", quote: "Store 60–80 °F", page: 1, confidence: "high" },
      ],
    });
    const { patch } = buildSafePatch(row, {});
    expect(patch.application_process).toContain("dry 10 min");
    expect(patch.active_ingredient_or_resin).toBe("polyamide");
    expect(patch.shelf_life_months).toBe(24);
    expect(patch.storage_temp_min_c).toBe(16);
    expect(patch.storage_temp_max_c).toBe(27);
  });
});

describe("3M 86A correction constant (Phase 2A guard)", () => {
  it("has the stable audit key", () => {
    expect(CORRECTION_KEY).toBe("3m_adhesion_promoter_86a_v1");
  });
  it("does NOT include cure_time — the 10-minute drying step is application_process, not cure_time", () => {
    expect(CORRECTION_86A.cure_time).toBeNull();
    expect(String(CORRECTION_86A.application_process)).toContain("10 minutes");
  });
  it("moves ASTM D1000 to test_methods and MIL-PRF-85285 Type IV to contextual_standards, keeping qualifications empty", () => {
    expect(CORRECTION_86A.qualifications).toEqual([]);
    const methods = CORRECTION_86A.test_methods as Array<{ method: string }>;
    expect(methods.map((m) => m.method)).toEqual(["ASTM D1000"]);
    const ctx = CORRECTION_86A.contextual_standards as Array<{ standard: string; role: string }>;
    expect(ctx[0]).toMatchObject({ standard: "MIL-PRF-85285 Type IV", role: "tested_substrate_coating" });
  });
  it("preserves both NSN identifiers with applicability", () => {
    const ids = CORRECTION_86A.product_identifiers as Array<{ kind: string; value: string; applicability?: string }>;
    expect(ids.map((i) => i.value).sort()).toEqual(["8040-01-448-4791", "8040-01-450-9187"]);
    expect(ids.every((i) => i.kind === "nsn" && typeof i.applicability === "string")).toBe(true);
  });
  it("legacy zero fields are corrected to null (cure_temperature_c, out_life_days, freezer_life_months)", () => {
    expect(CORRECTION_86A.cure_temperature_c).toBeNull();
    expect(CORRECTION_86A.out_life_days).toBeNull();
    expect(CORRECTION_86A.freezer_life_months).toBeNull();
  });
  it("storage range is normalized to °C (16–27) with the audit note preserving the source °F range in the module", () => {
    expect(CORRECTION_86A.storage_temp_min_c).toBe(16);
    expect(CORRECTION_86A.storage_temp_max_c).toBe(27);
  });
});
