/**
 * Shared worker logic for the TDS extraction queue. Kept in a *.server.ts
 * module so it can never leak into the client bundle. The HTTP tick route
 * is a thin adapter that authenticates, holds a mutex lease, and calls
 * `runWorkerTick()`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  runExtractionForSpec,
  MODEL,
  PROMPT_VERSION,
  TdsExtractError,
  ERROR_CODES,
  isPauseCode,
  providerCooldownSeconds,
  maxAttemptsFor,
  backoffSecondsFor,
  type TdsErrorClass,
  type TdsErrorCode,
} from "@/lib/tdsExtract.server";

export const WORKER_CONCURRENCY = 3;
export const LEASE_SECONDS = 180;
export const TICK_LOCK_KEY = "tds_worker_tick";
export const TICK_LOCK_TTL_SEC = 55; // one cron tick

export type ItemOutcome =
  | { kind: "success"; itemId: string; specId: string; latencyMs: number }
  | {
      kind: "retryable";
      itemId: string;
      specId: string;
      code: TdsErrorCode;
      nextAttemptAt: string;
    }
  | { kind: "permanent"; itemId: string; specId: string; code: TdsErrorCode }
  | { kind: "paused"; itemId: string; specId: string; code: TdsErrorCode };

/**
 * Constant-time comparison of two secrets. Both are converted to UTF-8 and
 * padded to equal length so timing does not leak input length.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Authorize a worker HTTP call. Only accepts `Authorization: Bearer <TDS_WORKER_SECRET>`
 * with a constant-time compare. Explicitly rejects the Supabase anon/publishable
 * key so an accidentally leaked anon key cannot drive the worker.
 */
export function authorizeWorkerRequest(request: Request): {
  ok: boolean;
  reason?: "missing_secret" | "no_header" | "bad_header" | "anon_key_rejected" | "mismatch";
} {
  const secret = process.env.TDS_WORKER_SECRET;
  if (!secret) return { ok: false, reason: "missing_secret" };

  const auth = request.headers.get("authorization");
  if (!auth) return { ok: false, reason: "no_header" };

  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return { ok: false, reason: "bad_header" };
  }
  const provided = parts[1];

  // Never allow the Supabase anon/publishable keys to authenticate the worker.
  const anon = process.env.SUPABASE_ANON_KEY;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  if ((anon && provided === anon) || (publishable && provided === publishable)) {
    return { ok: false, reason: "anon_key_rejected" };
  }
  if (!constantTimeEquals(provided, secret)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}

/** Structured, secret-redacting logger. */
type LogFields = Record<string, unknown>;
const REDACT_KEYS = new Set([
  "authorization",
  "apikey",
  "api_key",
  "lovable-api-key",
  "signed_url",
  "url",
  "pdf",
  "pdf_bytes",
  "file_data",
  "extracted",
  "raw",
  "body",
]);
function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
    } else if (typeof v === "string" && v.length > 300) {
      out[k] = `${v.slice(0, 200)}…[+${v.length - 200}]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}
export function log(event: string, fields: LogFields = {}) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...redact(fields) }));
}

async function settleSuccess(itemId: string, res: {
  cacheHit: boolean;
  documentHash: string;
  updatedCount: number;
  latencyMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
}) {
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("tds_analysis_items")
    .update({
      status: res.cacheHit ? "skipped_cache" : "done",
      document_hash: res.documentHash,
      latency_ms: res.latencyMs,
      updated_fields: res.updatedCount,
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      input_tokens: res.usage.inputTokens,
      output_tokens: res.usage.outputTokens,
      cost_usd: res.usage.costUsd,
      // Clear any old error metadata so a healed item does not show stale failures.
      error: null,
      error_class: null,
      error_code: null,
      last_error_at: null,
      next_attempt_at: null,
      lease_until: null,
      completed_at: nowIso,
    })
    .eq("id", itemId);
}

async function settleRetryable(
  itemId: string,
  errClass: TdsErrorClass,
  code: TdsErrorCode,
  message: string,
  retryAfter: number | undefined,
): Promise<string> {
  const { data: item } = await supabaseAdmin
    .from("tds_analysis_items")
    .select("attempts, max_attempts")
    .eq("id", itemId)
    .maybeSingle();
  const desiredMax = maxAttemptsFor(errClass);
  const effectiveMax = Math.min(item?.max_attempts ?? desiredMax, desiredMax);
  const attempts = item?.attempts ?? effectiveMax;

  if (attempts >= effectiveMax) {
    // Exhausted retries → convert to permanent failure with same code.
    await settlePermanent(itemId, code, message);
    return new Date().toISOString();
  }

  const deferSec = backoffSecondsFor(errClass, attempts, retryAfter);
  const nextAt = new Date(Date.now() + deferSec * 1000).toISOString();
  await supabaseAdmin
    .from("tds_analysis_items")
    .update({
      status: "pending",
      next_attempt_at: nextAt,
      lease_until: null,
      error: message.slice(0, 500),
      error_class: errClass,
      error_code: code,
      last_error_at: new Date().toISOString(),
      max_attempts: effectiveMax,
    })
    .eq("id", itemId);
  return nextAt;
}

async function settlePermanent(itemId: string, code: TdsErrorCode, message: string) {
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("tds_analysis_items")
    .update({
      status: "failed",
      error: message.slice(0, 500),
      error_class: "permanent",
      error_code: code,
      last_error_at: nowIso,
      completed_at: nowIso,
      lease_until: null,
      next_attempt_at: null,
      max_attempts: 1,
    })
    .eq("id", itemId);
}

/**
 * Return a claimed item to pending without consuming an attempt. Used when
 * admission is denied mid-tick, so the item is not penalised for a global
 * pause condition.
 */
async function requeueForPause(itemId: string, code: TdsErrorCode) {
  const { data: item } = await supabaseAdmin
    .from("tds_analysis_items")
    .select("attempts")
    .eq("id", itemId)
    .maybeSingle();
  const attempts = Math.max(0, (item?.attempts ?? 1) - 1); // refund the attempt claim_tds_items pre-increments
  await supabaseAdmin
    .from("tds_analysis_items")
    .update({
      status: "pending",
      attempts,
      lease_until: null,
      next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
      error_code: code,
      error_class: "paused",
      last_error_at: new Date().toISOString(),
    })
    .eq("id", itemId);
}

async function processOne(itemId: string, specId: string): Promise<ItemOutcome> {
  const t0 = Date.now();
  try {
    const res = await runExtractionForSpec(specId);
    await settleSuccess(itemId, res);
    return { kind: "success", itemId, specId, latencyMs: Date.now() - t0 };
  } catch (err) {
    const classified = err instanceof TdsExtractError ? err : null;
    const code = (classified?.errorCode ?? ERROR_CODES.NETWORK_ERROR) as TdsErrorCode;
    const cls: TdsErrorClass = classified?.errorClass ?? "transient";
    const message = err instanceof Error ? err.message : String(err);

    if (cls === "paused" || isPauseCode(code)) {
      await requeueForPause(itemId, code);
      return { kind: "paused", itemId, specId, code };
    }
    if (cls === "permanent" || cls === "missing_pdf" || cls === "plausibility") {
      await settlePermanent(itemId, code, message);
      return { kind: "permanent", itemId, specId, code };
    }
    // Retryable (transient / rate_limited)
    const cooldownSec = providerCooldownSeconds(code);
    if (cooldownSec > 0) {
      try {
        await supabaseAdmin.rpc("set_provider_cooldown", {
          _model: MODEL,
          _seconds: cooldownSec,
          _reason: code,
        });
      } catch (e) {
        log("cooldown_set_failed", { code, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const nextAt = await settleRetryable(itemId, cls, code, message, classified?.retryAfterSec);
    return { kind: "retryable", itemId, specId, code, nextAttemptAt: nextAt };
  }
}

export type TickResult =
  | { skipped: "locked" }
  | { skipped: "cooldown"; cooldownUntil: string }
  | { skipped: "paused"; reason: string; pausedBatches: number }
  | {
      processed: number;
      success: number;
      retryable: number;
      permanent: number;
      paused: number;
    };

async function isProviderInCooldown(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("tds_provider_cooldowns")
    .select("cooldown_until")
    .eq("model", MODEL)
    .maybeSingle();
  if (!data?.cooldown_until) return null;
  const until = new Date(data.cooldown_until as string);
  return until.getTime() > Date.now() ? until.toISOString() : null;
}

/**
 * Run one worker tick. Idempotent under overlap because of the DB-backed lease.
 * Callers must hold `TICK_LOCK_KEY` before calling — the HTTP adapter does this.
 */
export async function runWorkerTick(holder: string): Promise<TickResult> {
  const runInsert = await supabaseAdmin
    .from("tds_worker_runs")
    .insert({ holder })
    .select("id")
    .single();
  const runId = runInsert.data?.id ?? null;

  const finalize = async (fields: Record<string, unknown>) => {
    if (!runId) return;
    await supabaseAdmin
      .from("tds_worker_runs")
      .update({ ...fields, ended_at: new Date().toISOString() })
      .eq("id", runId);
  };

  // Reconcile batch state at start
  try {
    await supabaseAdmin.rpc("finalize_stuck_batches");
  } catch (e) {
    log("finalize_start_failed", { error: e instanceof Error ? e.message : String(e) });
  }

  // Admission check → paused
  const { data: allowedRows } = await supabaseAdmin.rpc("ai_worker_allowed");
  const allowed = Array.isArray(allowedRows) ? allowedRows[0] : allowedRows;
  if (!allowed?.allowed) {
    const reason: string = allowed?.reason ?? "paused";
    let pausedBatches = 0;
    try {
      const { data: n } = await supabaseAdmin.rpc("pause_running_batches_cap", { _reason: reason });
      pausedBatches = typeof n === "number" ? n : 0;
    } catch (e) {
      log("pause_batches_failed", { error: e instanceof Error ? e.message : String(e) });
    }
    log("tick_paused", { reason, pausedBatches });
    await finalize({ paused: true, pause_reason: reason });
    return { skipped: "paused", reason, pausedBatches };
  }

  // Provider cooldown short-circuit
  const cooldownUntil = await isProviderInCooldown();
  if (cooldownUntil) {
    log("tick_provider_cooldown", { cooldownUntil });
    await finalize({ paused: true, pause_reason: "provider_cooldown" });
    return { skipped: "cooldown", cooldownUntil };
  }

  const { data: claimed, error: claimErr } = await supabaseAdmin.rpc("claim_tds_items", {
    _limit: WORKER_CONCURRENCY,
    _lease_seconds: LEASE_SECONDS,
  });
  if (claimErr) {
    log("claim_error", { error: claimErr.message });
    await finalize({ error: claimErr.message });
    throw new Error(claimErr.message);
  }
  const items = (claimed ?? []) as Array<{ id: string; spec_id: string }>;
  if (items.length === 0) {
    try {
      await supabaseAdmin.rpc("finalize_stuck_batches");
    } catch {
      /* noop */
    }
    await finalize({ claimed: 0 });
    return { processed: 0, success: 0, retryable: 0, permanent: 0, paused: 0 };
  }

  log("tick_claimed", { count: items.length });
  const outcomes = await Promise.all(items.map((i) => processOne(i.id, i.spec_id)));

  const counts = { success: 0, retryable: 0, permanent: 0, paused: 0 };
  for (const o of outcomes) counts[o.kind] += 1;

  // If any item hit a pause-code, atomically pause running batches so the
  // whole queue backs off — do not silently accumulate failures.
  const anyPause = outcomes.find((o) => o.kind === "paused");
  if (anyPause) {
    try {
      await supabaseAdmin.rpc("pause_running_batches_cap", { _reason: anyPause.code });
    } catch (e) {
      log("pause_batches_failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  try {
    await supabaseAdmin.rpc("finalize_stuck_batches");
  } catch {
    /* noop */
  }

  await finalize({
    claimed: items.length,
    success: counts.success,
    retryable: counts.retryable,
    permanent: counts.permanent,
    paused: counts.paused,
  });
  log("tick_done", { processed: items.length, ...counts });
  return { processed: items.length, ...counts };
}
