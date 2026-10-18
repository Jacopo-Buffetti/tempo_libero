create table public.shopping_receipts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  list_id      uuid not null references public.shopping_lists(id) on delete cascade,
  path         text not null,
  total_cents  integer check (total_cents >= 0),
  shop         text,
  receipt_date date,
  status       text not null default 'da_leggere' check (status in ('da_leggere', 'letto', 'manuale', 'illeggibile')),
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index shopping_receipts_list_idx on public.shopping_receipts(list_id, created_at);

grant select, insert, update, delete on public.shopping_receipts to authenticated;
alter table public.shopping_receipts enable row level security;

create policy "receipts: lettura" on public.shopping_receipts
  for select to authenticated using (public.is_member(org_id));
create policy "receipts: inserimento" on public.shopping_receipts
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and exists (select 1 from public.shopping_lists l where l.id = list_id and l.org_id = shopping_receipts.org_id)
  );
create policy "receipts: modifica" on public.shopping_receipts
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "receipts: rimozione" on public.shopping_receipts
  for delete to authenticated using (public.is_member(org_id));

create or replace view public.shopping_list_summary
with (security_invoker = true) as
select
  l.id, l.org_id, l.name, l.location, l.status, l.shop, l.closed_on,
  l.paid_by, l.paid_by_user, l.reimbursed, l.created_at, l.closed_at,
  count(i.id)::int                                                     as items_count,
  (count(i.id) filter (where i.checked))::int                          as checked_count,
  coalesce(sum(i.price_cents) filter (where i.checked), 0)::int        as total_cents,
  (count(i.id) filter (where i.checked and i.price_cents is null))::int as missing_prices,
  l.event_id,
  (select count(*) from public.shopping_receipts r where r.list_id = l.id)::int                          as receipts_count,
  (select coalesce(sum(r.total_cents), 0) from public.shopping_receipts r where r.list_id = l.id)::int   as receipts_cents,
  (select count(*) from public.shopping_receipts r where r.list_id = l.id and r.total_cents is null)::int as receipts_missing
from public.shopping_lists l
left join public.shopping_list_items i on i.list_id = l.id
group by l.id;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scontrini', 'scontrini', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "scontrini: lettura membri" on storage.objects
  for select to authenticated
  using (bucket_id = 'scontrini' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "scontrini: caricamento membri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'scontrini' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "scontrini: rimozione membri" on storage.objects
  for delete to authenticated
  using (bucket_id = 'scontrini' and public.is_member(((storage.foldername(name))[1])::uuid));
