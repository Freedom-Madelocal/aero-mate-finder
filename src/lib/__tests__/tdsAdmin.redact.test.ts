import { describe, it, expect } from "vitest";
import { redactSensitive } from "@/lib/tdsAdmin.functions";

describe("redactSensitive", () => {
  it("redacts keys matching url/path/token/secret/key/email/phone/address", () => {
    const input = {
      spec_id: "abc",
      tds_url: "https://foo.example/pdf",
      storage_path: "/some/bucket/x.pdf",
      api_key: "sk_live_...",
      auth_token: "xxx",
      email: "a@b.co",
      phone: "555",
      street_address: "1 way",
      nested: { access_key: "z", ok: "kept" },
    };
    const out = redactSensitive(input);
    expect(out.tds_url).toBe("[redacted]");
    expect(out.storage_path).toBe("[redacted]");
    expect(out.api_key).toBe("[redacted]");
    expect(out.auth_token).toBe("[redacted]");
    expect(out.email).toBe("[redacted]");
    expect(out.phone).toBe("[redacted]");
    expect(out.street_address).toBe("[redacted]");
    expect(out.nested.access_key).toBe("[redacted]");
    expect(out.nested.ok).toBe("kept");
    expect(out.spec_id).toBe("abc");
  });

  it("redacts URL-looking string values even under safe keys", () => {
    const out = redactSensitive({ note: "see https://example.com/file" });
    expect(out.note).toBe("[redacted]");
  });

  it("redacts storage-path-looking string values under safe keys", () => {
    const out = redactSensitive({ note: "grab /storage/v1/object/foo.pdf" });
    expect(out.note).toBe("[redacted]");
  });

  it("keeps arrays and primitives intact", () => {
    const out = redactSensitive({
      counts: [1, 2, 3],
      labels: ["a", "b"],
      flag: true,
      nullable: null,
    });
    expect(out.counts).toEqual([1, 2, 3]);
    expect(out.labels).toEqual(["a", "b"]);
    expect(out.flag).toBe(true);
    expect(out.nullable).toBeNull();
  });
});
