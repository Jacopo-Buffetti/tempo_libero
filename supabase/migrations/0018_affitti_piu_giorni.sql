alter table public.rentals add column end_date date;

update public.rentals set end_date = rent_date where end_date is null;

alter table public.rentals
  alter column end_date set not null,
  add constraint rentals_end_after_start check (end_date >= rent_date);

drop index if exists public.rentals_org_date_idx;
create index rentals_org_period_idx on public.rentals(org_id, rent_date, end_date);
