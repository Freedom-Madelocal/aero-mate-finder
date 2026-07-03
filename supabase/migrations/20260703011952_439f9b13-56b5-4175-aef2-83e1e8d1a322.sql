GRANT SELECT ON public.feature_flags TO anon;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='feature_flags' AND policyname='Public can read feature flags') THEN
    CREATE POLICY "Public can read feature flags" ON public.feature_flags FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;