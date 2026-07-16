
-- Seed vault + schedule pg_cron for the TDS worker tick.
-- The worker secret is stored in Supabase Vault (not in this file) and referenced
-- at runtime by the cron job. A SECURITY DEFINER helper lets a follow-up call
-- upsert the vault entry without exposing the vault schema.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.upsert_worker_secret(_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'tds_worker_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(_value, 'tds_worker_secret', 'TDS worker bearer token');
  ELSE
    PERFORM vault.update_secret(v_id, _value, 'tds_worker_secret', 'TDS worker bearer token');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.upsert_worker_secret(text) FROM PUBLIC;

-- Replace any prior schedule with one that reads the secret from Vault at run time.
DO $$
DECLARE
  r record;
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
    url := 'https://project--ca4abaac-23d6-4e8d-8183-d866b748d7da.lovable.app/api/public/tds-worker-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'tds_worker_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $CRON$
);
