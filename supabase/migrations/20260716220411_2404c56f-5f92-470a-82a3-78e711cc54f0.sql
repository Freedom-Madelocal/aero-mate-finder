
CREATE OR REPLACE FUNCTION private.trigger_worker(_url text)
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = vault, net AS $$
  SELECT net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='tds_worker_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
$$;
GRANT EXECUTE ON FUNCTION private.trigger_worker(text) TO sandbox_exec;
