import { describe, it, expect } from "vitest";
import type { BatchHealth } from "@/lib/specTdsAnalyze.functions";

/**
 * `classify()` is exported implicitly via the button; duplicate a copy
 * here so we can lock its behaviour without pulling the React module in.
 */
type UIState =
  | { kind: "idle" }
  | { kind: "queued"; batchId: string; label: string }
  | { kind: "processing"; batchId: string }
  | { kind: "retry_waiting"; batchId: string; nextRetryAt: string | null }
  | { kind: "paused"; batchId: string; reason: string | null }
  | { kind: "stalled"; batchId: string; ageSeconds: number }
  | { kind: "failed"; batchId: string; code: string | null; message: string }
  | { kind: "cancelled"; batchId: string }
  | { kind: "cache_hit"; batchId: string }
  | { kind: "done"; batchId: string; updated: number };

function classify(h: BatchHealth): UIState {
  if (!h.batch) return { kind: "idle" };
  const c = h.counts;
  const batchId = h.batch.id;
  const bs = h.batch.status;
  if (bs === "cancelled") return { kind: "cancelled", batchId };
  if (bs === "paused_admin" || bs === "paused_cap") {
    return { kind: "paused", batchId, reason: h.batch.paused_reason };
  }
  if ((c.processing ?? 0) > 0) return { kind: "processing", batchId };
  if ((c.pending ?? 0) > 0) {
    if (h.next_retry_at) return { kind: "retry_waiting", batchId, nextRetryAt: h.next_retry_at };
    if ((h.oldest_pending_seconds ?? 0) > 600) {
      return { kind: "stalled", batchId, ageSeconds: h.oldest_pending_seconds ?? 0 };
    }
    return { kind: "queued", batchId, label: h.batch.label ?? "Queued" };
  }
  if ((c.skipped_cache ?? 0) > 0 && (c.done ?? 0) === 0) return { kind: "cache_hit", batchId };
  if ((c.done ?? 0) > 0) return { kind: "done", batchId, updated: 0 };
  if ((c.failed ?? 0) > 0) {
    const [code, ...rest] = Object.keys(h.errors);
    return {
      kind: "failed",
      batchId,
      code: code ?? null,
      message: rest.length ? `${code} +${rest.length} more` : (code ?? "Unknown error"),
    };
  }
  return { kind: "queued", batchId, label: h.batch.label ?? "Queued" };
}

function makeHealth(partial: Partial<BatchHealth> & { counts?: Record<string, number>; status?: string }): BatchHealth {
  return {
    batch: {
      id: "b1",
      status: partial.status ?? "running",
      paused_reason: partial.batch?.paused_reason ?? null,
      paused_at: null,
      resumed_at: null,
      label: "test",
      total: 1,
      terminal_count: 0,
      created_at: "2026-07-16T00:00:00Z",
      updated_at: "2026-07-16T00:00:00Z",
    },
    counts: partial.counts ?? {},
    errors: partial.errors ?? {},
    attempts: {},
    oldest_pending_seconds: partial.oldest_pending_seconds ?? null,
    next_retry_at: partial.next_retry_at ?? null,
    worker_last_run_at: null,
    worker_heartbeat_at: null,
    cooldowns: {},
    latency_ms: { p50: 0, p95: 0 },
    cache_hits: 0,
    model_calls: 0,
    estimated_cost_usd: 0,
    throughput_per_sec: null,
    eta_seconds: null,
    as_of: "2026-07-16T00:00:00Z",
  };
}

describe("batch-health → UI state classifier", () => {
  it("maps no batch → idle", () => {
    const h = makeHealth({});
    h.batch = null;
    expect(classify(h).kind).toBe("idle");
  });

  it("cancelled batch status wins", () => {
    expect(classify(makeHealth({ status: "cancelled" })).kind).toBe("cancelled");
  });

  it("paused_admin → paused with reason", () => {
    const h = makeHealth({ status: "paused_admin" });
    h.batch!.paused_reason = "manual_pause";
    const s = classify(h);
    expect(s.kind).toBe("paused");
    if (s.kind === "paused") expect(s.reason).toBe("manual_pause");
  });

  it("processing count > 0 → processing", () => {
    expect(classify(makeHealth({ counts: { processing: 1 } })).kind).toBe("processing");
  });

  it("pending + next_retry_at → retry_waiting", () => {
    const s = classify(
      makeHealth({ counts: { pending: 1 }, next_retry_at: "2026-07-16T00:01:00Z" }),
    );
    expect(s.kind).toBe("retry_waiting");
  });

  it("pending very old and no next_retry → stalled", () => {
    const s = classify(makeHealth({ counts: { pending: 1 }, oldest_pending_seconds: 900 }));
    expect(s.kind).toBe("stalled");
  });

  it("pending fresh → queued", () => {
    const s = classify(makeHealth({ counts: { pending: 1 }, oldest_pending_seconds: 5 }));
    expect(s.kind).toBe("queued");
  });

  it("only skipped_cache → cache_hit", () => {
    expect(classify(makeHealth({ counts: { skipped_cache: 1 } })).kind).toBe("cache_hit");
  });

  it("done > 0 → done", () => {
    expect(classify(makeHealth({ counts: { done: 1 } })).kind).toBe("done");
  });

  it("failed only → failed with code from errors histogram", () => {
    const s = classify(
      makeHealth({ counts: { failed: 1 }, errors: { fetch_timeout: 1, model_error: 2 } }),
    );
    expect(s.kind).toBe("failed");
    if (s.kind === "failed") {
      expect(s.code).toBe("fetch_timeout");
      expect(s.message).toContain("+1 more");
    }
  });
});
