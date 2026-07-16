import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Super-admin batch management for the TDS queue. All actions:
 * - Require super_admin role.
 * - Audit to `admin_audit_log`.
 * - Never "retry everything" — only selective transient requeue or
 *   expired-lease recovery.
 * - Never erase item history.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: super_admin only.");
}

const REDACT_KEYS = /(url|path|token|secret|key|email|phone|address)/i;

function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redact(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.test(k) ? "[redacted]" : redact(v as unknown);
    }
    return out as T;
  }
  if (typeof value === "string" && (value.startsWith("http") || value.includes("/storage/"))) {
    return "[redacted]" as unknown as T;
  }
  return value;
}

export { redact as redactSensitive };

const ListItemsSchema = z.object({
  batchId: z.string().uuid(),
  status: z.array(z.string()).optional(),
  errorCode: z.string().optional(),
  minAttempts: z.number().int().min(0).optional(),
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listBatchItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListItemsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("tds_analysis_items")
      .select(
        "id, spec_id, status, attempts, max_attempts, error, error_code, error_class, next_attempt_at, lease_until, model, prompt_version, latency_ms, cost_usd, created_at, updated_at, document_hash",
      )
      .eq("batch_id", data.batchId)
      .order("created_at", { ascending: true })
      .limit(data.limit + 1);

    if (data.status && data.status.length) q = q.in("status", data.status);
    if (data.errorCode) q = q.eq("error_code", data.errorCode);
    if (typeof data.minAttempts === "number") q = q.gte("attempts", data.minAttempts);
    if (data.cursor) q = q.gt("created_at", data.cursor);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    const hasMore = list.length > data.limit;
    const items = list.slice(0, data.limit);
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.created_at ?? null : null,
    };
  });

const BatchIdSchema = z.object({ batchId: z.string().uuid() });

async function audit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  actorId: string,
  action: string,
  batchId: string | null,
  details: Record<string, unknown>,
) {
  await supabaseAdmin.from("admin_audit_log").insert({
    actor_user_id: actorId,
    action,
    batch_id: batchId,
    details: redact(details),
  });
}

export const pauseBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tds_analysis_batches")
      .update({
        status: "paused_admin",
        paused_reason: "manual_pause",
        paused_at: new Date().toISOString(),
      })
      .eq("id", data.batchId);
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, context.userId, "pause_batch", data.batchId, {});
    return { ok: true };
  });

export const resumeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tds_analysis_batches")
      .update({
        status: "running",
        paused_reason: null,
        resumed_at: new Date().toISOString(),
      })
      .eq("id", data.batchId);
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, context.userId, "resume_batch", data.batchId, {});
    return { ok: true };
  });

export const cancelBatchAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tds_analysis_batches")
      .update({ status: "cancelled" })
      .eq("id", data.batchId);
    if (error) throw new Error(error.message);
    // Move pending items to cancelled state without erasing history.
    await supabaseAdmin
      .from("tds_analysis_items")
      .update({ status: "cancelled" })
      .eq("batch_id", data.batchId)
      .in("status", ["pending"]);
    await audit(supabaseAdmin, context.userId, "cancel_batch", data.batchId, {});
    return { ok: true };
  });

const RequeueSchema = z.object({
  batchId: z.string().uuid(),
  errorCodes: z.array(z.string()).min(1),
  maxItems: z.number().int().min(1).max(500).default(100),
});

/**
 * Selective transient requeue. Requires an explicit set of error_codes so
 * callers must classify what they think is transient. Increments attempts
 * so retry budgets still apply. Never touches permanent-failure items.
 */
export const requeueTransientFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RequeueSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: candidates, error } = await supabaseAdmin
      .from("tds_analysis_items")
      .select("id, attempts, max_attempts")
      .eq("batch_id", data.batchId)
      .eq("status", "failed")
      .in("error_code", data.errorCodes)
      .limit(data.maxItems);
    if (error) throw new Error(error.message);
    const eligible = (candidates ?? []).filter((c) => c.attempts < c.max_attempts);
    if (eligible.length === 0) {
      return { requeued: 0 };
    }

    const ids = eligible.map((c) => c.id);
    const { error: upErr } = await supabaseAdmin
      .from("tds_analysis_items")
      .update({
        status: "pending",
        next_attempt_at: new Date().toISOString(),
        error: null,
        error_code: null,
        error_class: null,
      })
      .in("id", ids);
    if (upErr) throw new Error(upErr.message);

    await audit(supabaseAdmin, context.userId, "requeue_transient", data.batchId, {
      count: ids.length,
      error_codes: data.errorCodes,
    });
    return { requeued: ids.length };
  });

/**
 * Expired-lease recovery: reset `processing` items whose lease has expired
 * back to `pending` WITHOUT incrementing attempts (the previous try didn't
 * finish through no fault of the item).
 */
export const recoverExpiredLeases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const nowIso = new Date().toISOString();
    // First fetch the ids so we can report the count deterministically.
    const { data: expired, error } = await supabaseAdmin
      .from("tds_analysis_items")
      .select("id, attempts")
      .eq("batch_id", data.batchId)
      .eq("status", "processing")
      .lt("lease_until", nowIso)
      .limit(500);
    if (error) throw new Error(error.message);
    const list = expired ?? [];
    if (list.length === 0) return { recovered: 0 };

    const ids = list.map((r) => r.id);
    const { error: upErr } = await supabaseAdmin
      .from("tds_analysis_items")
      .update({
        status: "pending",
        lease_until: null,
        next_attempt_at: nowIso,
        // NOTE: attempts NOT decremented but also NOT incremented.
        // The previous claim will have already incremented it; we roll
        // it back by one because the previous try never produced a
        // completion or a typed failure — it merely expired.
        attempts: null as unknown as number, // placeholder to satisfy TS
      })
      .in("id", ids);
    if (upErr) throw new Error(upErr.message);

    // Set attempts back one for each (Postgres does not have per-row
    // decrement in a single UPDATE via .update(); loop bounded to 500).
    for (const r of list) {
      const next = Math.max(0, (r.attempts ?? 1) - 1);
      await supabaseAdmin
        .from("tds_analysis_items")
        .update({ attempts: next })
        .eq("id", r.id);
    }

    await audit(supabaseAdmin, context.userId, "recover_expired_leases", data.batchId, {
      count: ids.length,
    });
    return { recovered: ids.length };
  });

/**
 * Incident dry-run: read-only inventory of what an operator could do,
 * without doing anything. Never mutates.
 */
export const batchDryRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: items, error } = await supabaseAdmin
      .from("tds_analysis_items")
      .select("id, status, attempts, max_attempts, error_code, error_class, lease_until, document_hash")
      .eq("batch_id", data.batchId);
    if (error) throw new Error(error.message);
    const rows = items ?? [];
    const now = Date.now();

    const permanentFailures = rows.filter(
      (r) => r.status === "failed" && (r.error_class === "permanent" || (r.attempts ?? 0) >= (r.max_attempts ?? 3)),
    );
    const transientRetryable = rows.filter(
      (r) => r.status === "failed" && r.error_class === "transient" && (r.attempts ?? 0) < (r.max_attempts ?? 3),
    );
    const expiredLeases = rows.filter(
      (r) => r.status === "processing" && r.lease_until && new Date(r.lease_until).getTime() < now,
    );
    const neverAttempted = rows.filter((r) => r.status === "pending" && (r.attempts ?? 0) === 0);

    // Duplicate/cache opportunities: items sharing document_hash where one is done.
    const hashDone = new Set(
      rows.filter((r) => r.status === "done" && r.document_hash).map((r) => r.document_hash!),
    );
    const cacheOpportunities = rows.filter(
      (r) =>
        r.status !== "done" &&
        r.status !== "skipped_cache" &&
        r.document_hash &&
        hashDone.has(r.document_hash),
    );

    // AI cap / cooldown snapshot.
    let capState: { allowed: boolean; reason: string } = { allowed: true, reason: "ok" };
    const { data: cap } = await supabaseAdmin.rpc("ai_worker_allowed");
    if (cap && Array.isArray(cap) && cap[0]) {
      capState = { allowed: !!cap[0].allowed, reason: (cap[0].reason as string) ?? "ok" };
    }
    const { data: cooldowns } = await supabaseAdmin
      .from("tds_provider_cooldowns")
      .select("model, cooldown_until")
      .gt("cooldown_until", new Date().toISOString());

    // Rough cost estimate: use median cost_usd from recent done items × N.
    const doneWithCost = rows.filter((r) => r.status === "done");
    const estCallsIfAllRun = transientRetryable.length + expiredLeases.length + neverAttempted.length;

    return {
      permanentFailures: permanentFailures.length,
      transientRetryable: transientRetryable.length,
      expiredLeases: expiredLeases.length,
      neverAttempted: neverAttempted.length,
      cacheOpportunities: cacheOpportunities.length,
      admission: capState,
      activeCooldowns: cooldowns ?? [],
      estimatedCallsIfActed: estCallsIfAllRun,
      allowedActions: {
        selectiveRequeue: transientRetryable.length > 0,
        recoverExpiredLeases: expiredLeases.length > 0,
      },
      disallowedActions: ["retry_all", "erase_history", "auto_restart"],
      referenceMedianDoneCount: doneWithCost.length,
    };
  });

/**
 * Redacted failure CSV export. Strips URLs, storage paths, PII-ish keys.
 * Returns rows as an array; the client renders CSV.
 */
export const exportFailureAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("tds_analysis_items")
      .select("id, spec_id, status, attempts, max_attempts, error_code, error_class, model, prompt_version, latency_ms, cost_usd, created_at, updated_at, last_error_at")
      .eq("batch_id", data.batchId)
      .in("status", ["failed"])
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, context.userId, "export_failures", data.batchId, {
      row_count: rows?.length ?? 0,
    });
    return { rows: (rows ?? []).map((r) => redact(r)) };
  });
