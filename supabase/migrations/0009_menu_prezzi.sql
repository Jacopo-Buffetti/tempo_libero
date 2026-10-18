create type public.menu_price_mode as enum ('per_piatto', 'fisso');

alter table public.events
  add column price_mode        public.menu_price_mode not null default 'per_piatto',
  add column fixed_price_cents integer check (fixed_price_cents >= 0),
  add column fixed_price_note  text;
