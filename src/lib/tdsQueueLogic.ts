/**
 * Pure, in-memory simulation of the `claim_tds_items` RPC. Mirrors the SQL
 * so we can unit-test claim eligibility without a live database.
 *
 * Keep in sync with the migration that defines `public.claim_tds_items`.
 */

export type QueueItemStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "skipped_cache";

export type BatchStatus =
  | "running"
  | "paused"
  | "paused_cap"
  | "paused_admin"
  | "complete"
  | "completed"
  | "cancelled";

export interface QueueItem {
  id: string;
  batch_id: string;
  status: QueueItemStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: Date | null;
  lease_until: Date | null;
  created_at: Date;
}

export interface QueueBatch {
  id: string;
  status: BatchStatus;
}

export interface ClaimStore {
  batches: QueueBatch[];
  items: QueueItem[];
}

export function isItemClaimable(
  item: QueueItem,
  batch: QueueBatch | undefined,
  now: Date,
): boolean {
  if (!batch) return false;
  if (batch.status !== "running") return false;
  if (item.attempts >= item.max_attempts) return false;

  if (item.status === "pending") {
    return item.next_attempt_at === null || item.next_attempt_at <= now;
  }
  if (item.status === "processing") {
    return item.lease_until !== null && item.lease_until < now;
  }
  return false;
}

/**
 * Atomic claim simulation: picks up to `limit` claimable items, ordered by
 * next_attempt_at ASC NULLS FIRST (mirrors COALESCE(next_attempt_at,
 * created_at)), then marks them processing with a fresh lease and increments
 * attempts. Returns the claimed items (post-update snapshot).
 *
 * The `now` argument is required so tests can pin time.
 */
export function claimItems(
  store: ClaimStore,
  opts: { limit: number; leaseSeconds: number; now: Date },
): QueueItem[] {
  const { limit, leaseSeconds, now } = opts;
  const batchesById = new Map(store.batches.map((b) => [b.id, b]));

  const candidates = store.items
    .filter((i) => isItemClaimable(i, batchesById.get(i.batch_id), now))
    .sort((a, b) => {
      const ka = (a.next_attempt_at ?? a.created_at).getTime();
      const kb = (b.next_attempt_at ?? b.created_at).getTime();
      return ka - kb;
    })
    .slice(0, limit);

  const claimed: QueueItem[] = [];
  for (const c of candidates) {
    c.status = "processing";
    c.attempts += 1;
    c.lease_until = new Date(now.getTime() + leaseSeconds * 1000);
    c.next_attempt_at = null;
    claimed.push(c);
  }
  return claimed;
}
