
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'tds-worker-tick' LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'tds-worker-tick',
  '* * * * *',
  $CRON$
  SELECT net.http_post(
    url := 'https://project--ca4abaac-23d6-4e8d-8183-d866b748d7da-dev.lovable.app/api/public/tds-worker-tick',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='tds_worker_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $CRON$
);
