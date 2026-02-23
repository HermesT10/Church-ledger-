-- =====================================================================
-- 00047_workflows.sql
-- Internal Finance Workflows: Messaging, Invoice Submissions,
-- Expense Requests, Approval Queue
-- =====================================================================

-- ============================================================
-- 1. Conversations + Messaging
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  subject         text,
  created_by      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content         text        NOT NULL,
  attachment_url  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.message_reads (
  conversation_id uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (conversation_id, user_id)
);

-- ============================================================
-- 2. Invoice Submissions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoice_submissions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  submitted_by    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  supplier_name   text        NOT NULL,
  supplier_id     uuid        REFERENCES public.suppliers(id) ON DELETE SET NULL,
  invoice_number  text,
  invoice_date    date        NOT NULL,
  amount_pence    bigint      NOT NULL CHECK (amount_pence > 0),
  fund_id         uuid        REFERENCES public.funds(id) ON DELETE SET NULL,
  account_id      uuid        REFERENCES public.accounts(id) ON DELETE SET NULL,
  description     text,
  attachment_url  text,
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'converted')),
  reviewed_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  review_note     text,
  bill_id         uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Expense Requests
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expense_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  submitted_by    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  spend_date      date        NOT NULL,
  amount_pence    bigint      NOT NULL CHECK (amount_pence > 0),
  fund_id         uuid        REFERENCES public.funds(id) ON DELETE SET NULL,
  account_id      uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  description     text        NOT NULL,
  receipt_url     text,
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'converted')),
  reviewed_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  review_note     text,
  cash_spend_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. RLS — Conversations
-- ============================================================

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- Conversations: user is participant OR org admin
CREATE POLICY conversations_select ON public.conversations
  FOR SELECT USING (
    public.is_org_admin(organisation_id)
    OR EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = id AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY conversations_insert ON public.conversations
  FOR INSERT WITH CHECK (
    public.is_org_member(organisation_id)
  );

-- Participants: see own + admin sees all
CREATE POLICY participants_select ON public.conversation_participants
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND public.is_org_admin(c.organisation_id)
    )
  );

CREATE POLICY participants_insert ON public.conversation_participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND public.is_org_member(c.organisation_id)
    )
  );

-- Messages: participant of conversation or admin
CREATE POLICY messages_select ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND public.is_org_admin(c.organisation_id)
    )
  );

CREATE POLICY messages_insert ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND public.is_org_admin(c.organisation_id)
    )
  );

-- Message reads: own rows only
CREATE POLICY reads_select ON public.message_reads
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY reads_upsert ON public.message_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY reads_update ON public.message_reads
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- 5. RLS — Invoice Submissions
-- ============================================================

ALTER TABLE public.invoice_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_sub_select ON public.invoice_submissions
  FOR SELECT USING (
    submitted_by = auth.uid()
    OR public.is_org_treasurer_or_admin(organisation_id)
  );

CREATE POLICY inv_sub_insert ON public.invoice_submissions
  FOR INSERT WITH CHECK (
    public.is_org_member(organisation_id)
  );

CREATE POLICY inv_sub_update ON public.invoice_submissions
  FOR UPDATE USING (
    submitted_by = auth.uid()
    OR public.is_org_treasurer_or_admin(organisation_id)
  );

-- ============================================================
-- 6. RLS — Expense Requests
-- ============================================================

ALTER TABLE public.expense_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY exp_req_select ON public.expense_requests
  FOR SELECT USING (
    submitted_by = auth.uid()
    OR public.is_org_treasurer_or_admin(organisation_id)
  );

CREATE POLICY exp_req_insert ON public.expense_requests
  FOR INSERT WITH CHECK (
    public.is_org_member(organisation_id)
  );

CREATE POLICY exp_req_update ON public.expense_requests
  FOR UPDATE USING (
    submitted_by = auth.uid()
    OR public.is_org_treasurer_or_admin(organisation_id)
  );

-- ============================================================
-- 7. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_inv_sub_org_status
  ON public.invoice_submissions (organisation_id, status);

CREATE INDEX IF NOT EXISTS idx_exp_req_org_status
  ON public.expense_requests (organisation_id, status);

CREATE INDEX IF NOT EXISTS idx_conv_participants_user
  ON public.conversation_participants (user_id);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON public.messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_message_reads_user
  ON public.message_reads (user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_org
  ON public.conversations (organisation_id);

-- ============================================================
-- 8. Storage Buckets
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('invoice-submissions', 'invoice-submissions', false),
  ('expense-receipts', 'expense-receipts', false),
  ('internal-messages', 'internal-messages', false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. Settings Extension
-- ============================================================

ALTER TABLE public.organisation_settings
  ADD COLUMN IF NOT EXISTS receipt_compliance_days int NOT NULL DEFAULT 7;
