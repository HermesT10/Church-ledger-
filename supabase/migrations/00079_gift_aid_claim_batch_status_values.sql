-- 00079_gift_aid_claim_batch_status_values.sql
-- Add review/approval/payment exception statuses only. Follow-up migration
-- uses these enum values after Postgres commits them.

do $$
begin
  begin
    alter type public.gift_aid_batch_status add value 'review';
  exception
    when duplicate_object then null;
  end;

  begin
    alter type public.gift_aid_batch_status add value 'approved';
  exception
    when duplicate_object then null;
  end;

  begin
    alter type public.gift_aid_batch_status add value 'paid';
  exception
    when duplicate_object then null;
  end;

  begin
    alter type public.gift_aid_batch_status add value 'rejected';
  exception
    when duplicate_object then null;
  end;
end $$;
