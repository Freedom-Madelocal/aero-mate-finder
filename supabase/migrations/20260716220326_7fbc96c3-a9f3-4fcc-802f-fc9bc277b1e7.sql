
CREATE OR REPLACE FUNCTION private.list_cron_jobs()
RETURNS TABLE(jobid bigint, jobname text, schedule text, command text, active boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = cron AS $$
  SELECT jobid, jobname, schedule, command, active FROM cron.job;
$$;
GRANT EXECUTE ON FUNCTION private.list_cron_jobs() TO sandbox_exec;
