
CREATE OR REPLACE FUNCTION private.worker_secret_len()
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = vault AS $$
  SELECT length(decrypted_secret) FROM vault.decrypted_secrets WHERE name='tds_worker_secret' LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION private.worker_secret_matches(_v text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = vault AS $$
  SELECT decrypted_secret = _v FROM vault.decrypted_secrets WHERE name='tds_worker_secret' LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION private.worker_secret_len() TO sandbox_exec;
GRANT EXECUTE ON FUNCTION private.worker_secret_matches(text) TO sandbox_exec;
