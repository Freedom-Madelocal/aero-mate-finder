import { describe, it, expect } from "vitest";
import {
  claimItems,
  isItemClaimable,
  type ClaimStore,
  type QueueItem,
  type QueueBatch,
} from "@/lib/tdsQueueLogic";

const NOW = new Date("2026-07-16T12:00:00Z");
const secs = (n: number) => new Date(NOW.getTime() + n * 1000);

function makeStore(overrides?: {
  batchStatus?: QueueBatch["status"];
  items?: Partial<QueueItem>[];
}): ClaimStore {
  const batch: QueueBatch = { id: "b1", status: overrides?.batchStatus ?? "running" };
  const items: QueueItem[] = (overrides?.items ?? []).map((o, i) => ({
    id: o.id ?? `i${i}`,
    batch_id: o.batch_id ?? "b1",
    status: o.status ?? "pending",
    attempts: o.attempts ?? 0,
    max_attempts: o.max_attempts ?? 5,
    next_attempt_at: o.next_attempt_at ?? null,
    lease_until: o.lease_until ?? null,
    created_at: o.created_at ?? NOW,
  }));
  return { batches: [batch], items };
}

describe("claim_tds_items semantics", () => {
  it("does not claim a pending item scheduled in the future", () => {
    const store = makeStore({
      items: [{ next_attempt_at: secs(60) }],
    });
    const claimed = claimItems(store, { limit: 5, leaseSeconds: 180, now: NOW });
    expect(claimed).toHaveLength(0);
    expect(store.items[0].status).toBe("pending");
    expect(store.items[0].attempts).toBe(0);
  });

  it("claims a due pending item exactly once and increments attempts", () => {
    const store = makeStore({
      items: [{ next_attempt_at: secs(-1) }],
    });
    const first = claimItems(store, { limit: 5, leaseSeconds: 180, now: NOW });
    expect(first).toHaveLength(1);
    expect(store.items[0].status).toBe("processing");
    expect(store.items[0].attempts).toBe(1);
    expect(store.items[0].next_attempt_at).toBeNull();
    expect(store.items[0].lease_until).not.toBeNull();

    // Second claim at the same moment sees an active lease → skipped.
    const second = claimItems(store, { limit: 5, leaseSeconds: 180, now: NOW });
    expect(second).toHaveLength(0);
    expect(store.items[0].attempts).toBe(1);
  });

  it("two concurrent claimers cannot both claim the same item", () => {
    // Simulate concurrency: build two independent stores over the same row,
    // then apply both claims sequentially — the second must find the row
    // already leased (SKIP LOCKED equivalent).
    const shared: QueueItem = {
      id: "i1",
      batch_id: "b1",
      status: "pending",
      attempts: 0,
      max_attempts: 5,
      next_attempt_at: null,
      lease_until: null,
      created_at: NOW,
    };
    const store: ClaimStore = {
      batches: [{ id: "b1", status: "running" }],
      items: [shared],
    };
    const a = claimItems(store, { limit: 1, leaseSeconds: 180, now: NOW });
    const b = claimItems(store, { limit: 1, leaseSeconds: 180, now: NOW });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
    expect(shared.attempts).toBe(1);
  });

  it("does not reclaim a processing item whose lease is still active", () => {
    const store = makeStore({
      items: [
        { status: "processing", attempts: 1, lease_until: secs(120) },
      ],
    });
    const claimed = claimItems(store, { limit: 5, leaseSeconds: 180, now: NOW });
    expect(claimed).toHaveLength(0);
    expect(store.items[0].attempts).toBe(1);
  });

  it("reclaims a processing item whose lease has expired", () => {
    const store = makeStore({
      items: [
        { status: "processing", attempts: 1, lease_until: secs(-5) },
      ],
    });
    const claimed = claimItems(store, { limit: 5, leaseSeconds: 180, now: NOW });
    expect(claimed).toHaveLength(1);
    expect(store.items[0].status).toBe("processing");
    expect(store.items[0].attempts).toBe(2);
  });

  it("yields no claims when the batch is paused or cancelled", () => {
    for (const status of ["paused_admin", "paused_cap", "cancelled", "completed"] as const) {
      const store = makeStore({
        batchStatus: status,
        items: [{ next_attempt_at: null }],
      });
      const claimed = claimItems(store, { limit: 5, leaseSeconds: 180, now: NOW });
      expect(claimed, `status=${status}`).toHaveLength(0);
    }
  });

  it("treats existing rows without next_attempt_at as immediately due (backward compat)", () => {
    // Existing production rows have next_attempt_at NULL. They must remain
    // valid and eligible under the new RPC.
    const store = makeStore({
      items: [
        { id: "legacy", status: "pending", next_attempt_at: null, lease_until: null },
      ],
    });
    expect(
      isItemClaimable(store.items[0], store.batches[0], NOW),
    ).toBe(true);
    const claimed = claimItems(store, { limit: 1, leaseSeconds: 180, now: NOW });
    expect(claimed).toHaveLength(1);
  });

  it("does not claim items that have exhausted max_attempts", () => {
    const store = makeStore({
      items: [{ attempts: 5, max_attempts: 5 }],
    });
    const claimed = claimItems(store, { limit: 5, leaseSeconds: 180, now: NOW });
    expect(claimed).toHaveLength(0);
  });
});
