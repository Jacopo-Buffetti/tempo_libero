alter publication supabase_realtime drop table public.shopping_items;
drop trigger if exists items_sync_shopping on public.items;
drop function if exists public.sync_shopping_from_stock();
drop function if exists public.close_shopping_trip(uuid, text, date, public.payment_source, jsonb);
drop view if exists public.shopping_trip_totals;
drop table if exists public.trip_lines;
drop table if exists public.shopping_trips;
drop table if exists public.shopping_items;

create type public.list_status as enum ('aperta', 'chiusa');

create table public.shopping_lists (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  location     public.item_location not null,
  status       public.list_status not null default 'aperta',
  shop         text,
  closed_on    date,
  paid_by      public.payment_source,
  paid_by_user uuid references auth.users(id) on delete set null,
  reimbursed   boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);
create index shopping_lists_org_idx on public.shopping_lists(org_id, status, created_at desc);

create table public.shopping_list_items (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.shopping_lists(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  item_id     uuid references public.items(id) on delete set null,
  name        text not null check (length(trim(name)) > 0),
  qty         integer not null default 1 check (qty > 0),
  unit        text not null default 'pezzi',
  checked     boolean not null default false,
  checked_by  uuid references auth.users(id) on delete set null,
  checked_at  timestamptz,
  price_cents integer check (price_cents >= 0),
  created_at  timestamptz not null default now()
);
create unique index shopping_list_items_one_per_item
  on public.shopping_list_items(list_id, item_id) where item_id is not null;
create index shopping_list_items_list_idx
  on public.shopping_list_items(list_id, checked, created_at);

create or replace function public.guard_checked_qty()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.checked and new.qty <> old.qty then
    raise exception 'Togli la spunta per cambiare la quantità';
  end if;
  return new;
end;
$$;

create trigger shopping_list_items_guard_qty
  before update of qty on public.shopping_list_items
  for each row execute function public.guard_checked_qty();

create view public.shopping_list_summary
with (security_invoker = true) as
select
  l.id, l.org_id, l.name, l.location, l.status, l.shop, l.closed_on,
  l.paid_by, l.paid_by_user, l.reimbursed, l.created_at, l.closed_at,
  count(i.id)::int                                                     as items_count,
  (count(i.id) filter (where i.checked))::int                          as checked_count,
  coalesce(sum(i.price_cents) filter (where i.checked), 0)::int        as total_cents,
  (count(i.id) filter (where i.checked and i.price_cents is null))::int as missing_prices
from public.shopping_lists l
left join public.shopping_list_items i on i.list_id = l.id
group by l.id;

create or replace function public.list_open_in_org(p_list uuid, p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.shopping_lists
    where id = p_list and org_id = p_org and status = 'aperta'
  );
$$;

create or replace function public.create_shopping_list(
  p_org_id   uuid,
  p_name     text,
  p_location public.item_location,
  p_add_low  boolean default true
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_list uuid;
begin
  if not public.is_member(p_org_id) then
    raise exception 'Non autorizzato';
  end if;

  insert into public.shopping_lists (org_id, name, location, created_by)
  values (p_org_id, trim(p_name), p_location, (select auth.uid()))
  returning id into v_list;

  if p_add_low then
    insert into public.shopping_list_items (list_id, org_id, item_id, name, qty, unit)
    select v_list, p_org_id, i.id, i.name, i.min_qty - i.qty, i.unit
      from public.items i
     where i.org_id = p_org_id
       and i.location = p_location
       and i.kind = 'consumabile'
       and i.min_qty is not null
       and i.qty < i.min_qty;
  end if;

  return v_list;
end;
$$;

create or replace function public.set_list_item_checked(p_id uuid, p_checked boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v       public.shopping_list_items%rowtype;
  v_delta integer;
begin
  select * into v from public.shopping_list_items where id = p_id for update;
  if not found or not public.is_member(v.org_id) then
    raise exception 'Voce non trovata';
  end if;
  if not public.list_open_in_org(v.list_id, v.org_id) then
    raise exception 'La lista è già chiusa';
  end if;
  if v.checked = p_checked then
    return;
  end if;

  if v.item_id is not null then
    v_delta := case when p_checked then v.qty else -v.qty end;

    update public.items
       set qty = qty + v_delta, updated_at = now()
     where id = v.item_id
       and qty + v_delta >= broken_qty;
    if not found then
      raise exception 'In inventario non ce ne sono abbastanza per annullare';
    end if;

    insert into public.item_movements (item_id, org_id, delta, reason, user_id)
    values (v.item_id, v.org_id, v_delta, 'lista spesa', (select auth.uid()));
  end if;

  update public.shopping_list_items
     set checked    = p_checked,
         checked_by = case when p_checked then (select auth.uid()) end,
         checked_at = case when p_checked then now() end
   where id = p_id;
end;
$$;

create or replace function public.close_shopping_list(
  p_list_id    uuid,
  p_shop       text,
  p_closed_on  date,
  p_paid_by    public.payment_source,
  p_prices     jsonb,
  p_carry_over boolean default true
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_list public.shopping_lists%rowtype;
  v_new  uuid;
  v_p    jsonb;
begin
  select * into v_list from public.shopping_lists where id = p_list_id for update;
  if not found or not public.is_member(v_list.org_id) then
    raise exception 'Lista non trovata';
  end if;
  if v_list.status <> 'aperta' then
    raise exception 'La lista è già chiusa';
  end if;
  if not exists (select 1 from public.shopping_list_items where list_id = p_list_id and checked) then
    raise exception 'Spunta almeno un articolo prima di chiudere';
  end if;

  for v_p in select * from jsonb_array_elements(coalesce(p_prices, '[]'::jsonb)) loop
    update public.shopping_list_items
       set price_cents = (v_p->>'price_cents')::integer
     where id = (v_p->>'id')::uuid and list_id = p_list_id and checked;
  end loop;

  if exists (select 1 from public.shopping_list_items where list_id = p_list_id and not checked) then
    if p_carry_over then
      insert into public.shopping_lists (org_id, name, location, created_by)
      values (v_list.org_id, v_list.name || ' (da finire)', v_list.location, (select auth.uid()))
      returning id into v_new;
      update public.shopping_list_items
         set list_id = v_new
       where list_id = p_list_id and not checked;
    else
      delete from public.shopping_list_items where list_id = p_list_id and not checked;
    end if;
  end if;

  update public.shopping_lists
     set status       = 'chiusa',
         shop         = nullif(trim(p_shop), ''),
         closed_on    = coalesce(p_closed_on, current_date),
         paid_by      = p_paid_by,
         paid_by_user = case when p_paid_by = 'volontario' then (select auth.uid()) end,
         closed_at    = now()
   where id = p_list_id;

  return v_new;
end;
$$;

revoke execute on function public.list_open_in_org(uuid, uuid) from public, anon;
grant  execute on function public.list_open_in_org(uuid, uuid) to authenticated;
revoke execute on function public.create_shopping_list(uuid, text, public.item_location, boolean) from public, anon;
grant  execute on function public.create_shopping_list(uuid, text, public.item_location, boolean) to authenticated;
revoke execute on function public.set_list_item_checked(uuid, boolean) from public, anon;
grant  execute on function public.set_list_item_checked(uuid, boolean) to authenticated;
revoke execute on function public.close_shopping_list(uuid, text, date, public.payment_source, jsonb, boolean) from public, anon;
grant  execute on function public.close_shopping_list(uuid, text, date, public.payment_source, jsonb, boolean) to authenticated;

grant select, delete                on public.shopping_lists      to authenticated;
grant update (name, reimbursed)     on public.shopping_lists      to authenticated;
grant select, insert, delete        on public.shopping_list_items to authenticated;
grant update (qty, price_cents)     on public.shopping_list_items to authenticated;
grant select                        on public.shopping_list_summary to authenticated;

alter table public.shopping_lists      enable row level security;
alter table public.shopping_list_items enable row level security;

create policy "lists: lettura" on public.shopping_lists
  for select to authenticated using (public.is_member(org_id));
create policy "lists: modifica" on public.shopping_lists
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "lists: rimozione admin" on public.shopping_lists
  for delete to authenticated using (public.is_admin(org_id));

create policy "list items: lettura" on public.shopping_list_items
  for select to authenticated using (public.is_member(org_id));
create policy "list items: inserimento in lista aperta" on public.shopping_list_items
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.list_open_in_org(list_id, org_id)
    and not checked
    and price_cents is null
  );
create policy "list items: modifica" on public.shopping_list_items
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "list items: rimozione se non spuntata" on public.shopping_list_items
  for delete to authenticated using (public.is_member(org_id) and not checked);

alter publication supabase_realtime add table public.shopping_lists;
alter publication supabase_realtime add table public.shopping_list_items;
