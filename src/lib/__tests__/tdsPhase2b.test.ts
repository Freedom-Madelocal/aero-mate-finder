import { describe, it, expect } from "vitest";
import { preflightPdf } from "@/lib/tdsPreflight.server";
import { joinPagesForPrompt } from "@/lib/tdsFastRoute.server";

function bytesFrom(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("preflightPdf (Phase 2B)", () => {
  it("flags an encrypted PDF and refuses the fast route", () => {
    const raw = "%PDF-1.4\n/Encrypt 1 0 R\n/Type /Page\n";
    const p = preflightPdf(bytesFrom(raw));
    expect(p.encrypted).toBe(true);
    expect(p.suggestedRoute).toBe("vision_pro");
    expect(p.reason).toBe("encrypted");
  });

  it("routes a small text-heavy PDF to the fast text-layer route", () => {
    // 2 pages with 40 Tj operators each — well above threshold.
    const page = "/Type /Page\n" + Array.from({ length: 40 }, () => "(x) Tj\n").join("");
    const raw = "%PDF-1.4\n" + page + page;
    const p = preflightPdf(bytesFrom(raw));
    expect(p.pages).toBe(2);
    expect(p.encrypted).toBe(false);
    expect(p.suggestedRoute).toBe("text_layer_fast");
    expect(p.textCoverage).toBeGreaterThan(0.9);
  });

  it("routes a large PDF (>24 pages) to vision even when text-rich", () => {
    const page = "/Type /Page\n" + Array.from({ length: 40 }, () => "(x) Tj\n").join("");
    const raw = "%PDF-1.4\n" + page.repeat(30);
    const p = preflightPdf(bytesFrom(raw));
    expect(p.pages).toBe(30);
    expect(p.suggestedRoute).toBe("vision_pro");
    expect(p.reason).toMatch(/pages>24/);
  });

  it("routes a scanned/low-text PDF to vision", () => {
    // 5 pages with ~2 text operators each — well below threshold.
    const raw = "%PDF-1.4\n" + ("/Type /Page\n(x) Tj\n(x) Tj\n").repeat(5);
    const p = preflightPdf(bytesFrom(raw));
    expect(p.pages).toBe(5);
    expect(p.suggestedRoute).toBe("vision_pro");
  });

  it("counts /Type /Page but not /Type /Pages", () => {
    const raw = "%PDF-1.4\n/Type /Pages\n/Type /Page\n/Type /Page\n";
    const p = preflightPdf(bytesFrom(raw));
    expect(p.pages).toBe(2);
  });
});

describe("joinPagesForPrompt (Phase 2B)", () => {
  it("keeps every page under budget with page markers", () => {
    const chunks = [
      { page: 1, text: "alpha" },
      { page: 2, text: "beta" },
      { page: 3, text: "gamma" },
    ];
    const out = joinPagesForPrompt(chunks, 200);
    expect(out.truncated).toBe(false);
    expect(out.includedPages).toBe(3);
    expect(out.totalPages).toBe(3);
    expect(out.text).toContain("--- Page 1 ---");
    expect(out.text).toContain("--- Page 3 ---");
  });

  it("truncates and reports when the budget is exceeded (never mid-page silently)", () => {
    const chunks = [
      { page: 1, text: "a".repeat(80) },
      { page: 2, text: "b".repeat(80) },
      { page: 3, text: "c".repeat(80) },
    ];
    const out = joinPagesForPrompt(chunks, 120);
    expect(out.truncated).toBe(true);
    expect(out.includedPages).toBeLessThan(3);
    expect(out.totalPages).toBe(3);
    // The included pages remain intact (no partial-page corruption).
    if (out.includedPages >= 1) expect(out.text).toContain("a".repeat(80));
  });
});
