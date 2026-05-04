alter table public.gift_aid_claim_lines
  add column if not exists donor_title_snapshot text,
  add column if not exists donor_first_name_or_initial_snapshot text,
  add column if not exists donor_last_name_snapshot text,
  add column if not exists donor_house_name_or_number_snapshot text;

update public.gift_aid_claim_lines line
set
  donor_title_snapshot = coalesce(line.donor_title_snapshot, donor.title),
  donor_first_name_or_initial_snapshot = coalesce(
    line.donor_first_name_or_initial_snapshot,
    nullif(trim(donor.first_name), ''),
    nullif(split_part(trim(coalesce(donor.full_name, '')), ' ', 1), '')
  ),
  donor_last_name_snapshot = coalesce(
    line.donor_last_name_snapshot,
    nullif(trim(donor.last_name), ''),
    nullif(regexp_replace(trim(coalesce(donor.full_name, '')), '^.*\s', ''), '')
  ),
  donor_house_name_or_number_snapshot = coalesce(
    line.donor_house_name_or_number_snapshot,
    nullif(trim(donor.house_name_or_number), ''),
    nullif(trim(donor.address), '')
  )
from public.donors donor
where donor.id = line.donor_id;
