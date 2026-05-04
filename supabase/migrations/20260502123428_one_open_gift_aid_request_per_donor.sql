-- Enforce one open Gift Aid declaration request per donor/workspace.
--
-- Older reconciliation requests were unique per donation, which allowed the
-- same donor to accumulate multiple open follow-ups. Keep the newest open
-- request and dismiss older duplicates before adding the donor-level index.

with ranked_open_requests as (
  select
    id,
    row_number() over (
      partition by workspace_id, donor_id
      order by
        case status
          when 'link_generated' then 1
          when 'sent' then 2
          else 3
        end,
        created_at desc,
        id desc
    ) as request_rank
  from public.gift_aid_declaration_requests
  where status in ('needed', 'link_generated', 'sent')
)
update public.gift_aid_declaration_requests request
set status = 'dismissed',
    dismissed_at = coalesce(request.dismissed_at, now()),
    request_reason = case
      when request.request_reason ilike '%superseded by newer open request%' then request.request_reason
      else request.request_reason || ' (superseded by newer open request)'
    end
from ranked_open_requests ranked
where request.id = ranked.id
  and ranked.request_rank > 1;

create unique index if not exists uq_gift_aid_declaration_requests_open_donor
  on public.gift_aid_declaration_requests (workspace_id, donor_id)
  where status in ('needed', 'link_generated', 'sent');
