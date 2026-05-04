-- 00075_transactions_feature.sql
-- Manual transactions: pre-ledger records that can be matched to imported
-- bank lines and posted exactly once to journals.
--
-- Product specs may say workspace_id; this codebase uses organisation_id.

-- ---------------------------------------------------------------------------
-- 1. Manual transaction headers
-- ---------------------------------------------------------------------------

create table if not exists public.manual_transactions (
  id                         uuid primary key default gen_random_uuid(),
  organisation_id            uuid not null references public.organisations(id) on delete cascade,
  type                       text not null,
  transaction_date           date not null,
  amount_pence               bigint not null,
  description                text not null,
  payee_payer_name           text,
  reference                  text,
  payment_method             text,
  expected_bank_account_id   uuid references public.bank_accounts(id) on delete set null,
  status                     text not null default 'draft',
  approval_status            text,
  requires_bank_match        boolean not null default true,
  matched_bank_transaction_id uuid references public.bank_lines(id) on delete set null,
  posted_journal_id          uuid references public.journals(id) on delete set null,
  created_by                 uuid references public.profiles(id) on delete set null,
  approved_by                uuid references public.profiles(id) on delete set null,
  approved_at                timestamptz,
  reconciled_at              timestamptz,
  posted_at                  timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  voided_at                  timestamptz,
  void_reason                text,
  duplicate_override_reason  text,

  constraint manual_transactions_type_check
    check (type in ('income', 'expense', 'transfer', 'adjustment')),
  constraint manual_transactions_status_check
    check (status in (
      'draft',
      'submitted',
      'approved',
      'awaiting_bank_match',
      'matched',
      'reconciled',
      'posted',
      'rejected',
      'voided'
    )),
  constraint manual_transactions_approval_status_check
    check (approval_status is null or approval_status in ('pending', 'approved', 'rejected')),
  constraint manual_transactions_amount_positive
    check (amount_pence > 0),
  constraint manual_transactions_description_not_blank
    check (length(trim(description)) > 0)
);

comment on table public.manual_transactions is
  'Manual pre-ledger transactions. They do not affect reports until posted_journal_id is set.';

comment on column public.manual_transactions.organisation_id is
  'Tenant key. Product workspace_id maps to organisation_id in this codebase.';

comment on column public.manual_transactions.matched_bank_transaction_id is
  'References public.bank_lines(id); bank_lines are the imported bank transaction records.';

create index if not exists idx_manual_transactions_org_status_date
  on public.manual_transactions (organisation_id, status, transaction_date desc);

create index if not exists idx_manual_transactions_org_type_date
  on public.manual_transactions (organisation_id, type, transaction_date desc);

create index if not exists idx_manual_transactions_expected_bank
  on public.manual_transactions (expected_bank_account_id)
  where expected_bank_account_id is not null;

create index if not exists idx_manual_transactions_matched_bank
  on public.manual_transactions (matched_bank_transaction_id)
  where matched_bank_transaction_id is not null;

create unique index if not exists idx_manual_transactions_posted_journal_unique
  on public.manual_transactions (posted_journal_id)
  where posted_journal_id is not null;

create unique index if not exists idx_journals_manual_transaction_source_unique
  on public.journals (source_id)
  where source_type = 'manual_transaction' and source_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Split transaction lines
-- ---------------------------------------------------------------------------

create table if not exists public.manual_transaction_lines (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  manual_transaction_id uuid not null references public.manual_transactions(id) on delete cascade,
  fund_id               uuid references public.funds(id) on delete restrict,
  account_id            uuid not null references public.accounts(id) on delete restrict,
  income_stream_id      uuid references public.income_streams(id) on delete set null,
  description           text,
  amount_pence          bigint not null,
  direction             text not null,
  line_order            integer not null default 1,
  created_at            timestamptz not null default now(),

  constraint manual_transaction_lines_amount_positive
    check (amount_pence > 0),
  constraint manual_transaction_lines_direction_check
    check (direction in ('in', 'out')),
  constraint manual_transaction_lines_order_positive
    check (line_order > 0)
);

create index if not exists idx_manual_transaction_lines_transaction
  on public.manual_transaction_lines (manual_transaction_id, line_order);

create index if not exists idx_manual_transaction_lines_org_account
  on public.manual_transaction_lines (organisation_id, account_id);

create index if not exists idx_manual_transaction_lines_org_fund
  on public.manual_transaction_lines (organisation_id, fund_id)
  where fund_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Attachment metadata
-- ---------------------------------------------------------------------------

create table if not exists public.transaction_attachments (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  manual_transaction_id uuid not null references public.manual_transactions(id) on delete cascade,
  file_name             text not null,
  file_path             text not null,
  file_type             text,
  file_size             bigint not null,
  file_hash             text,
  uploaded_by           uuid references public.profiles(id) on delete set null,
  uploaded_at           timestamptz not null default now(),

  constraint transaction_attachments_file_size_positive
    check (file_size > 0),
  constraint transaction_attachments_file_path_unique
    unique (file_path)
);

create index if not exists idx_transaction_attachments_transaction
  on public.transaction_attachments (manual_transaction_id, uploaded_at desc);

create index if not exists idx_transaction_attachments_hash
  on public.transaction_attachments (organisation_id, file_hash)
  where file_hash is not null;

-- ---------------------------------------------------------------------------
-- 4. Manual transaction ↔ bank line matches
-- ---------------------------------------------------------------------------

create table if not exists public.transaction_matches (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  bank_line_id          uuid not null references public.bank_lines(id) on delete cascade,
  manual_transaction_id uuid not null references public.manual_transactions(id) on delete cascade,
  match_status          text not null default 'suggested',
  confidence_score      numeric(5,4) not null default 0,
  confidence_label      text not null default 'low',
  match_reason          text,
  confirmed_by          uuid references public.profiles(id) on delete set null,
  confirmed_at          timestamptz,
  created_at            timestamptz not null default now(),

  constraint transaction_matches_status_check
    check (match_status in ('suggested', 'confirmed', 'rejected')),
  constraint transaction_matches_confidence_range
    check (confidence_score >= 0 and confidence_score <= 1),
  constraint transaction_matches_confidence_label_check
    check (confidence_label in ('high', 'medium', 'low')),
  constraint transaction_matches_pair_unique
    unique (bank_line_id, manual_transaction_id)
);

comment on column public.transaction_matches.bank_line_id is
  'References public.bank_lines(id). This is the existing bank transaction table.';

create unique index if not exists idx_transaction_matches_confirmed_bank_line
  on public.transaction_matches (bank_line_id)
  where match_status = 'confirmed';

create unique index if not exists idx_transaction_matches_confirmed_manual_tx
  on public.transaction_matches (manual_transaction_id)
  where match_status = 'confirmed';

create index if not exists idx_transaction_matches_org_status
  on public.transaction_matches (organisation_id, match_status, created_at desc);

create index if not exists idx_transaction_matches_manual_tx
  on public.transaction_matches (manual_transaction_id);

-- ---------------------------------------------------------------------------
-- 5. updated_at trigger
-- ---------------------------------------------------------------------------

drop trigger if exists trg_manual_transactions_touch_updated_at on public.manual_transactions;

create trigger trg_manual_transactions_touch_updated_at
  before update on public.manual_transactions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

alter table public.manual_transactions enable row level security;
alter table public.manual_transaction_lines enable row level security;
alter table public.transaction_attachments enable row level security;
alter table public.transaction_matches enable row level security;

create policy manual_transactions_select_member on public.manual_transactions
  for select using (public.is_org_member(organisation_id));

create policy manual_transactions_insert_finance on public.manual_transactions
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy manual_transactions_update_finance on public.manual_transactions
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy manual_transactions_delete_finance on public.manual_transactions
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

create policy manual_transaction_lines_select_member on public.manual_transaction_lines
  for select using (public.is_org_member(organisation_id));

create policy manual_transaction_lines_insert_finance on public.manual_transaction_lines
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy manual_transaction_lines_update_finance on public.manual_transaction_lines
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy manual_transaction_lines_delete_finance on public.manual_transaction_lines
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

create policy transaction_attachments_select_member on public.transaction_attachments
  for select using (public.is_org_member(organisation_id));

create policy transaction_attachments_insert_finance on public.transaction_attachments
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy transaction_attachments_update_finance on public.transaction_attachments
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy transaction_attachments_delete_finance on public.transaction_attachments
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

create policy transaction_matches_select_member on public.transaction_matches
  for select using (public.is_org_member(organisation_id));

create policy transaction_matches_insert_finance on public.transaction_matches
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

create policy transaction_matches_update_finance on public.transaction_matches
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

create policy transaction_matches_delete_finance on public.transaction_matches
  for delete using (public.is_org_treasurer_or_admin(organisation_id));
