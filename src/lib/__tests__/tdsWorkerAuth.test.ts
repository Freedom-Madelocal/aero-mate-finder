import { describe, it, expect } from "vitest";
import { constantTimeEquals, authorizeWorkerRequest } from "@/lib/tdsWorker.server";

function req(headers: Record<string, string>): Request {
  return new Request("http://x/api/public/tds-worker-tick", {
    method: "POST",
    headers,
  });
}

describe("constantTimeEquals", () => {
  it("matches equal strings", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("", "")).toBe(true);
  });
  it("rejects any difference including length", () => {
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
    expect(constantTimeEquals("abcd", "abc")).toBe(false);
  });
});

describe("authorizeWorkerRequest", () => {
  const ORIG = { ...process.env };
  const setEnv = (env: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const restore = () => {
    for (const k of ["TDS_WORKER_SECRET", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"]) {
      if (ORIG[k] === undefined) delete process.env[k];
      else process.env[k] = ORIG[k];
    }
  };

  it("fails closed when secret is not configured", () => {
    setEnv({ TDS_WORKER_SECRET: undefined });
    const r = authorizeWorkerRequest(req({ authorization: "Bearer whatever" }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_secret");
    restore();
  });

  it("rejects missing header", () => {
    setEnv({ TDS_WORKER_SECRET: "s3cr3t" });
    const r = authorizeWorkerRequest(req({}));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_header");
    restore();
  });

  it("rejects non-bearer scheme", () => {
    setEnv({ TDS_WORKER_SECRET: "s3cr3t" });
    const r = authorizeWorkerRequest(req({ authorization: "Basic s3cr3t" }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad_header");
    restore();
  });

  it("rejects anon/publishable key even when its value matches nothing else", () => {
    setEnv({
      TDS_WORKER_SECRET: "s3cr3t",
      SUPABASE_ANON_KEY: "anonymouskey",
      SUPABASE_PUBLISHABLE_KEY: "pubkey",
    });
    for (const k of ["anonymouskey", "pubkey"]) {
      const r = authorizeWorkerRequest(req({ authorization: `Bearer ${k}` }));
      expect(r.ok, `key=${k}`).toBe(false);
      expect(r.reason).toBe("anon_key_rejected");
    }
    restore();
  });

  it("accepts a matching bearer secret", () => {
    setEnv({ TDS_WORKER_SECRET: "s3cr3t" });
    const r = authorizeWorkerRequest(req({ authorization: "Bearer s3cr3t" }));
    expect(r.ok).toBe(true);
    restore();
  });

  it("rejects apikey-only requests (Supabase anon apikey header not accepted)", () => {
    setEnv({ TDS_WORKER_SECRET: "s3cr3t", SUPABASE_ANON_KEY: "anonymouskey" });
    const r = authorizeWorkerRequest(req({ apikey: "anonymouskey" }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_header");
    restore();
  });
});
