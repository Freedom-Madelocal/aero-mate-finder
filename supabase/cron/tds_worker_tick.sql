-- =============================================================================
-- Scheduler for the TDS worker tick.
--
-- Runs every minute against the stable published URL. Authenticates with
-- TDS_WORKER_SECRET (Authorization: Bearer). The Supabase anon/publishable
-- key is REJECTED by the endpoint.
--
-- USAGE (run once as project owner, replacing <TDS_WORKER_SECRET> with the
-- value stored under Project Settings → Secrets → TDS_WORKER_SECRET):
--
--   SELECT cron.unschedule('tds-worker-tick');
--   \set worker_secret '<TDS_WORKER_SECRET>'
--   -- then run the block below with the same value inlined.
-- =============================================================================

SELECT cron.schedule(
  'tds-worker-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--ca4abaac-23d6-4e8d-8183-d866b748d7da.lovable.app/api/public/tds-worker-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || '<REPLACE_WITH_TDS_WORKER_SECRET>'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
