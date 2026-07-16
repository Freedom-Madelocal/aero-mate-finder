import { describe, it, expect } from "vitest";
import {
  maxAttemptsFor,
  backoffSecondsFor,
  computeDocumentHash,
  buildSafePatch,
  TdsExtractError,
  ERROR_CODES,
  classifyGatewayStatus,
  providerCooldownSeconds,
  isPauseCode,
  type ExtractedRow,
} from "@/lib/tdsExtract.server";

describe("maxAttemptsFor", () => {
  it("caps permanent-class errors at a single attempt", () => {
    expect(maxAttemptsFor("permanent")).toBe(1);
    expect(maxAttemptsFor("plausibility")).toBe(1);
    expect(maxAttemptsFor("missing_pdf")).toBe(1);
  });
  it("allows more attempts for transient/rate-limited errors", () => {
    expect(maxAttemptsFor("transient")).toBeGreaterThanOrEqual(3);
    expect(maxAttemptsFor("rate_limited")).toBeGreaterThanOrEqual(
      maxAttemptsFor("transient"),
    );
  });
});

describe("backoffSecondsFor", () => {
  it("honors Retry-After for rate-limited errors", () => {
    const s = backoffSecondsFor("rate_limited", 1, 42);
    expect(s).toBe(42);
  });
  it("caps Retry-After at 10 minutes", () => {
    expect(backoffSecondsFor("rate_limited", 1, 99_999)).toBe(600);
  });
  it("grows roughly exponentially with attempts", () => {
    const a1 = backoffSecondsFor("transient", 1);
    const a3 = backoffSecondsFor("transient", 3);
    expect(a3).toBeGreaterThan(a1);
  });
  it("caps exponential base at 480s + jitter (<15s)", () => {
    for (let i = 0; i < 20; i++) {
      expect(backoffSecondsFor("transient", 20)).toBeLessThan(480 + 15);
      expect(backoffSecondsFor("transient", 20)).toBeGreaterThanOrEqual(480);
    }
  });
});

describe("TdsExtractError", () => {
  it("carries error class, code, and retryAfter", () => {
    const err = new TdsExtractError("boom", "rate_limited", ERROR_CODES.RATE_LIMITED, 30);
    expect(err.errorClass).toBe("rate_limited");
    expect(err.errorCode).toBe(ERROR_CODES.RATE_LIMITED);
    expect(err.retryAfterSec).toBe(30);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("classifyGatewayStatus", () => {
  it("maps 429 to rate_limited with Retry-After honored", () => {
    const e = classifyGatewayStatus(429, "slow down", "42");
    expect(e.errorClass).toBe("rate_limited");
    expect(e.errorCode).toBe(ERROR_CODES.RATE_LIMITED);
    expect(e.retryAfterSec).toBe(42);
  });
  it("maps 402 to paused/credits_exhausted (never fails item)", () => {
    const e = classifyGatewayStatus(402, "", null);
    expect(e.errorClass).toBe("paused");
    expect(e.errorCode).toBe(ERROR_CODES.CREDITS_EXHAUSTED);
    expect(isPauseCode(e.errorCode)).toBe(true);
  });
  it("maps 401/403 to paused/ai_config_error", () => {
    for (const s of [401, 403]) {
      const e = classifyGatewayStatus(s, "nope", null);
      expect(e.errorClass, `status ${s}`).toBe("paused");
      expect(e.errorCode).toBe(ERROR_CODES.AI_CONFIG_ERROR);
    }
  });
  it("maps 5xx to transient/provider_5xx", () => {
    const e = classifyGatewayStatus(503, "boom", null);
    expect(e.errorClass).toBe("transient");
    expect(e.errorCode).toBe(ERROR_CODES.PROVIDER_5XX);
  });
  it("maps other 4xx to permanent/unsupported_document", () => {
    const e = classifyGatewayStatus(422, "bad input", null);
    expect(e.errorClass).toBe("permanent");
    expect(e.errorCode).toBe(ERROR_CODES.UNSUPPORTED_DOCUMENT);
  });
});

describe("providerCooldownSeconds", () => {
  it("returns a positive cooldown only for 429/5xx/timeout", () => {
    expect(providerCooldownSeconds(ERROR_CODES.RATE_LIMITED)).toBeGreaterThan(0);
    expect(providerCooldownSeconds(ERROR_CODES.PROVIDER_5XX)).toBeGreaterThan(0);
    expect(providerCooldownSeconds(ERROR_CODES.MODEL_TIMEOUT)).toBeGreaterThan(0);
    expect(providerCooldownSeconds(ERROR_CODES.NETWORK_ERROR)).toBe(0);
    expect(providerCooldownSeconds(ERROR_CODES.MALFORMED_STRUCTURED_OUTPUT)).toBe(0);
  });
});

describe("maxAttemptsFor for paused class", () => {
  it("does not count paused as consuming attempts", () => {
    expect(maxAttemptsFor("paused")).toBeGreaterThanOrEqual(50);
  });
});

describe("computeDocumentHash", () => {
  it("is deterministic sha256 hex", () => {
    const h1 = computeDocumentHash(new Uint8Array([1, 2, 3, 4]));
    const h2 = computeDocumentHash(new Uint8Array([1, 2, 3, 4]));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
  it("differs for different inputs", () => {
    const a = computeDocumentHash(new Uint8Array([1]));
    const b = computeDocumentHash(new Uint8Array([2]));
    expect(a).not.toBe(b);
  });
});

describe("buildSafePatch", () => {
  const baseRow: ExtractedRow = {
    cureTemperatureC: 121,
    dryTgOnsetC: 180,
    productFamily: "AF 163-2",
    toughened: true,
    provenance: [
      { field: "cureTemperatureC", page: 2, quote: "Cure at 121°C for 60 min", confidence: "high" },
      { field: "dryTgOnsetC", page: 3, quote: "Dry Tg onset: 180°C", confidence: "medium" },
      { field: "productFamily", page: 1, quote: "Product: AF 163-2", confidence: "high" },
      { field: "toughened", page: 1, quote: "toughened epoxy film adhesive", confidence: "medium" },
    ],
  };

  it("fills empty fields and records provenance", () => {
    const spec: Record<string, unknown> = {
      cure_temperature_c: null,
      dry_tg_onset_c: null,
      product_family: null,
      toughened: null,
    };
    const { patch, updated, provenanceRows } = buildSafePatch(baseRow, spec);
    expect(patch.cure_temperature_c).toBe(121);
    expect(patch.dry_tg_onset_c).toBe(180);
    expect(patch.product_family).toBe("AF 163-2");
    expect(patch.toughened).toBe(true);
    expect(updated).toEqual(
      expect.arrayContaining([
        "cure_temperature_c",
        "dry_tg_onset_c",
        "product_family",
        "toughened",
      ]),
    );
    expect(provenanceRows.length).toBeGreaterThanOrEqual(4);
  });

  it("never overwrites an existing non-empty value", () => {
    const spec: Record<string, unknown> = {
      cure_temperature_c: 177,
      product_family: "Existing",
      toughened: true,
    };
    const { patch, updated } = buildSafePatch(baseRow, spec);
    expect(patch.cure_temperature_c).toBeUndefined();
    expect(patch.product_family).toBeUndefined();
    expect(patch.toughened).toBeUndefined();
    expect(updated).not.toContain("cure_temperature_c");
    expect(updated).not.toContain("product_family");
  });

  it("drops numeric values without a provenance quote", () => {
    const row: ExtractedRow = {
      cureTemperatureC: 121,
      provenance: [],
    };
    const { patch, updated } = buildSafePatch(row, { cure_temperature_c: null });
    expect(patch.cure_temperature_c).toBeUndefined();
    expect(updated).not.toContain("cure_temperature_c");
  });

  it("drops numeric values that fail the plausibility range", () => {
    const row: ExtractedRow = {
      cureTemperatureC: 9999,
      provenance: [
        { field: "cureTemperatureC", page: 1, quote: "cure 9999", confidence: "high" },
      ],
    };
    const { patch } = buildSafePatch(row, { cure_temperature_c: null });
    expect(patch.cure_temperature_c).toBeUndefined();
  });

  it("merges profiles and customers without duplicates", () => {
    const row: ExtractedRow = {
      profiles: ["OoA", "Autoclave"],
      customers: ["Boeing"],
    };
    const spec: Record<string, unknown> = {
      profiles: ["Autoclave"],
      customers: ["Boeing", "Airbus"],
    };
    const { patch, updated } = buildSafePatch(row, spec);
    expect(patch.profiles).toEqual(expect.arrayContaining(["OoA", "Autoclave"]));
    expect((patch.profiles as string[]).length).toBe(2);
    expect(patch.customers).toBeUndefined();
    expect(updated).toContain("profiles");
    expect(updated).not.toContain("customers");
  });
});
