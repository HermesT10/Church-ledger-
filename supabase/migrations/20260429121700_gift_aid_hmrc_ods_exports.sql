alter table if exists public.gift_aid_exports
  drop constraint if exists gift_aid_exports_export_format_check;

alter table if exists public.gift_aid_exports
  add constraint gift_aid_exports_export_format_check
  check (export_format in ('hmrc_csv', 'hmrc_xlsx', 'hmrc_ods', 'pdf_review', 'csv', 'json'));
