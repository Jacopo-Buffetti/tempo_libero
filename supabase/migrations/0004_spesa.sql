create type public.payment_source as enum ('cassa', 'volontario');

create table public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  item_id    uuid references public.items(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  qty        integer not null default 1 check (qty > 0),
  unit       text not null default 'pezzi',
  checked    boolean not null default false,
  auto       boolean not null default false,
  added_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index shopping_items_one_per_item
  on public.shopping_items(item_id) where item_id is not null;
create index shopping_items_org_idx on public.shopping_items(org_id, created_at);

create table public.shopping_trips (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  shop         text not null,
  trip_date    date not null default current_date,
  paid_by      public.payment_source not null default 'cassa',
  paid_by_user uuid references auth.users(id) on delete set null,
  reimbursed   boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index shopping_trips_org_idx on public.shopping_trips(org_id, trip_date desc);

create table public.trip_lines (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.shopping_trips(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  item_id     uuid references public.items(id) on delete set null,
  name        text not null,
  qty         integer not null check (qty > 0),
  unit        text not null,
  price_cents integer check (price_cents >= 0)
);
create index trip_lines_trip_idx on public.trip_lines(trip_id);

create view public.shopping_trip_totals
with (security_invoker = true) as
select
  t.id, t.org_id, t.shop, t.trip_date, t.paid_by, t.paid_by_user, t.reimbursed, t.created_at,
  count(l.id)::int                                           as lines_count,
  coalesce(sum(l.price_cents), 0)::int                       as total_cents,
  (count(l.id) filter (where l.price_cents is null))::int    as missing_prices
from public.shopping_trips t
left join public.trip_lines l on l.trip_id = t.id
group by t.id;

create or replace function public.sync_shopping_from_stock()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'consumabile' and new.min_qty is not null and new.qty < new.min_qty then
    insert into public.shopping_items (org_id, item_id, name, qty, unit, auto, added_by)
    values (new.org_id, new.id, new.name, new.min_qty - new.qty, new.unit, true, null)
    on conflict (item_id) where item_id is not null do nothing;
  else
    delete from public.shopping_items
     where item_id = new.id and auto and not checked;
  end if;
  return new;
end;
$$;

create trigger items_sync_shopping
  after insert or update of qty, min_qty, kind on public.items
  for each row execute function public.sync_shopping_from_stock();

create or replace function public.close_shopping_trip(
  p_org_id    uuid,
  p_shop      text,
  p_trip_date date,
  p_paid_by   public.payment_source,
  p_lines     jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_trip  uuid;
  v_line  jsonb;
  v_si    public.shopping_items%rowtype;
  v_count integer := 0;
begin
  if not public.is_member(p_org_id) then
    raise exception 'Non autorizzato';
  end if;
  if coalesce(jsonb_array_length(p_lines), 0) = 0 then
    raise exception 'Nessun articolo nella spesa';
  end if;

  insert into public.shopping_trips (org_id, shop, trip_date, paid_by, paid_by_user, created_by)
  values (
    p_org_id,
    coalesce(nullif(trim(p_shop), ''), 'Spesa'),
    coalesce(p_trip_date, current_date),
    p_paid_by,
    case when p_paid_by = 'volontario' then (select auth.uid()) end,
    (select auth.uid())
  )
  returning id into v_trip;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_si
      from public.shopping_items
     where id = (v_line->>'shopping_item_id')::uuid and org_id = p_org_id
       for update;
    if not found then
      continue;
    end if;

    insert into public.trip_lines (trip_id, org_id, item_id, name, qty, unit, price_cents)
    values (v_trip, p_org_id, v_si.item_id, v_si.name, v_si.qty, v_si.unit,
            (v_line->>'price_cents')::integer);

    delete from public.shopping_items where id = v_si.id;

    if v_si.item_id is not null then
      update public.items
         set qty = qty + v_si.qty, updated_at = now()
       where id = v_si.item_id;
      insert into public.item_movements (item_id, org_id, delta, reason, user_id)
      values (v_si.item_id, p_org_id, v_si.qty, 'spesa', (select auth.uid()));
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Gli articoli non sono più in lista';
  end if;

  return v_trip;
end;
$$;

revoke execute on function public.close_shopping_trip(uuid, text, date, public.payment_source, jsonb) from public, anon;
grant  execute on function public.close_shopping_trip(uuid, text, date, public.payment_source, jsonb) to authenticated;

grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, update, delete         on public.shopping_trips to authenticated;
grant select, update                 on public.trip_lines     to authenticated;
grant select                         on public.shopping_trip_totals to authenticated;

alter table public.shopping_items enable row level security;
alter table public.shopping_trips enable row level security;
alter table public.trip_lines     enable row level security;

create policy "shopping: lettura" on public.shopping_items
  for select to authenticated using (public.is_member(org_id));
create policy "shopping: inserimento" on public.shopping_items
  for insert to authenticated with check (public.is_member(org_id));
create policy "shopping: modifica" on public.shopping_items
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "shopping: rimozione" on public.shopping_items
  for delete to authenticated using (public.is_member(org_id));

create policy "trips: lettura" on public.shopping_trips
  for select to authenticated using (public.is_member(org_id));
create policy "trips: modifica" on public.shopping_trips
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "trips: rimozione admin" on public.shopping_trips
  for delete to authenticated using (public.is_admin(org_id));

create policy "lines: lettura" on public.trip_lines
  for select to authenticated using (public.is_member(org_id));
create policy "lines: modifica prezzi" on public.trip_lines
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));

alter publication supabase_realtime add table public.shopping_items;

update public.items set qty = qty
 where kind = 'consumabile' and min_qty is not null and qty < min_qty;
