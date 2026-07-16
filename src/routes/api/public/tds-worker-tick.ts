import { createFileRoute } from "@tanstack/react-router";
import {
  authorizeWorkerRequest,
  runWorkerTick,
  TICK_LOCK_KEY,
  TICK_LOCK_TTL_SEC,
  log,
} from "@/lib/tdsWorker.server";

/**
 * Worker tick — invoked every minute by `pg_cron` calling this endpoint
 * with `Authorization: Bearer $TDS_WORKER_SECRET`.
 *
 * Security:
 * - Requires TDS_WORKER_SECRET; constant-time compared.
 * - Rejects Supabase anon/publishable keys explicitly.
 * - Never accepts a query-string secret.
 * - Returns 401 with an opaque body on any auth failure.
 *
 * Overlap prevention: acquires a DB-backed tick lease (TTL 55s) via
 * `try_acquire_worker_lease`. Overlapping invocations get 200 with `locked:true`.
 */

export const Route = createFileRoute("/api/public/tds-worker-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = authorizeWorkerRequest(request);
        if (!auth.ok) {
          log("worker_auth_denied", { reason: auth.reason });
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const holder = `tick-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;

        // Overlap prevention: DB-backed lease
        const { data: won, error: leaseErr } = await supabaseAdmin.rpc(
          "try_acquire_worker_lease",
          {
            _key: TICK_LOCK_KEY,
            _holder: holder,
            _ttl_seconds: TICK_LOCK_TTL_SEC,
          },
        );
        if (leaseErr) {
          log("lease_error", { error: leaseErr.message });
          return Response.json({ error: "lease_failed" }, { status: 500 });
        }
        if (!won) {
          log("tick_skipped_locked");
          return Response.json({ locked: true });
        }

        try {
          const result = await runWorkerTick(holder);
          return Response.json(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log("tick_fatal", { error: msg });
          return Response.json({ error: msg }, { status: 500 });
        } finally {
          try {
            await supabaseAdmin.rpc("release_worker_lease", {
              _key: TICK_LOCK_KEY,
              _holder: holder,
            });
          } catch { /* noop */ }
        }
      },
    },
  },
});
