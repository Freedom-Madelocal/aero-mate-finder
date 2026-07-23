
-- 1) Review status on master_specs
ALTER TABLE public.master_specs
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

-- Constrain review_status to known values via trigger-free CHECK (immutable set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'master_specs_review_status_check'
  ) THEN
    ALTER TABLE public.master_specs
      ADD CONSTRAINT master_specs_review_status_check
      CHECK (review_status IN ('unreviewed','in_review','checked','flagged'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS master_specs_review_status_idx
  ON public.master_specs (review_status);

-- 2) Manual edit audit trail
CREATE TABLE IF NOT EXISTS public.spec_manual_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id uuid NOT NULL REFERENCES public.master_specs(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_by_email text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spec_manual_edits_spec_id_idx
  ON public.spec_manual_edits (spec_id, created_at DESC);
CREATE INDEX IF NOT EXISTS spec_manual_edits_editor_idx
  ON public.spec_manual_edits (edited_by, created_at DESC);

GRANT SELECT, INSERT ON public.spec_manual_edits TO authenticated;
GRANT ALL ON public.spec_manual_edits TO service_role;

ALTER TABLE public.spec_manual_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read spec manual edits" ON public.spec_manual_edits;
CREATE POLICY "Super admins read spec manual edits"
  ON public.spec_manual_edits
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Super admins insert spec manual edits" ON public.spec_manual_edits;
CREATE POLICY "Super admins insert spec manual edits"
  ON public.spec_manual_edits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    AND edited_by = auth.uid()
  );
