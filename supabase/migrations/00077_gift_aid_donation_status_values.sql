-- 00077_gift_aid_donation_status_values.sql
-- Add the production Gift Aid donation lifecycle statuses. This migration only
-- adds enum values; code/backfill that uses them runs in 00078 because Postgres
-- forbids using new enum values in the same transaction as ADD VALUE.

do $$
begin
  begin
    alter type public.gift_aid_donation_status add value 'not_assessed';
  exception
    when duplicate_object then null;
  end;

  begin
    alter type public.gift_aid_donation_status add value 'missing_declaration';
  exception
    when duplicate_object then null;
  end;

  begin
    alter type public.gift_aid_donation_status add value 'invalid_donor_details';
  exception
    when duplicate_object then null;
  end;

  begin
    alter type public.gift_aid_donation_status add value 'already_claimed';
  exception
    when duplicate_object then null;
  end;

  begin
    alter type public.gift_aid_donation_status add value 'included_in_draft_claim';
  exception
    when duplicate_object then null;
  end;

  begin
    alter type public.gift_aid_donation_status add value 'exported';
  exception
    when duplicate_object then null;
  end;

  begin
    alter type public.gift_aid_donation_status add value 'paid';
  exception
    when duplicate_object then null;
  end;

  begin
    alter type public.gift_aid_donation_status add value 'rejected';
  exception
    when duplicate_object then null;
  end;
end $$;
