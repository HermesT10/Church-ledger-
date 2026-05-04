-- Bank account card appearance.
-- Stores safe, user-selectable card themes without allowing arbitrary CSS.

alter table public.bank_accounts
  add column if not exists card_colour text,
  add column if not exists card_gradient text,
  add column if not exists card_theme text not null default 'purple';

update public.bank_accounts
   set card_theme = 'purple'
 where card_theme is null;

do $$ begin
  alter table public.bank_accounts
    add constraint bank_accounts_card_theme_check
    check (card_theme in ('purple', 'blue', 'green', 'teal', 'orange', 'pink', 'slate', 'black'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.bank_accounts
    add constraint bank_accounts_card_colour_hex_check
    check (card_colour is null or card_colour ~* '^#[0-9a-f]{6}$');
exception when duplicate_object then null;
end $$;
