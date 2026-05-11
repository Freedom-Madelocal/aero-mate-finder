-- Direct messages table
CREATE TABLE public.direct_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_direct_messages_pair ON public.direct_messages (organization_id, sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_direct_messages_recipient ON public.direct_messages (recipient_id, read_at);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Read: sender or recipient
CREATE POLICY "participants read messages"
ON public.direct_messages
FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Insert: must be self, recipient must be in same org
CREATE POLICY "users send as self within org"
ON public.direct_messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND organization_id = public.get_user_org(auth.uid())
  AND public.get_user_org(recipient_id) = public.get_user_org(auth.uid())
  AND sender_id <> recipient_id
);

-- Update: only recipient, only to mark read
CREATE POLICY "recipient marks read"
ON public.direct_messages
FOR UPDATE
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;