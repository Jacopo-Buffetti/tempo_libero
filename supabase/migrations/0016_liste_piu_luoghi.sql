alter table public.shopping_lists
  add column locations public.item_location[] not null default '{}';

update public.shopping_lists set locations = array[location] where cardinality(locations) = 0;

grant update (name, locations, reimbursed) on public.shopping_lists to authenticated;

create or replace function public.sync_list_locations()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  select coalesce(array_agg(l order by ord), '{}') into new.locations
    from (
      select distinct on (l) l, ord
        from unnest(new.locations) with ordinality as t(l, ord)
       order by l, ord
    ) unique_locations;
  if cardinality(new.locations) = 0 then
    new.locations := array[new.location];
  end if;
  if not (new.location = any (new.locations)) then
    new.location := new.locations[1];
  end if;
  return new;
end;
$$;

create trigger shopping_lists_sync_locations
  before insert or update of location, locations on public.shopping_lists
  for each row execute function public.sync_list_locations();

create or replace function public.guard_list_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'aperta' and new.status = 'aperta' and (
       new.shop      is distinct from old.shop
    or new.closed_on is distinct from old.closed_on
    or new.paid_by   is distinct from old.paid_by
  ) then
    raise exception 'Negozio, data e pagamento si impostano quando registri la spesa';
  end if;

  if new.paid_by is distinct from old.paid_by then
    new.paid_by_user := case when new.paid_by = 'volontario' then (select auth.uid()) end;
    new.reimbursed := false;
  end if;

  return new;
end;
$$;

drop function if exists public.create_shopping_list(uuid, text, public.item_location, boolean);

create or replace function public.create_shopping_list(
  p_org_id    uuid,
  p_name      text,
  p_locations public.item_location[],
  p_add_low   boolean default true
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_list uuid;
  v_item record;
begin
  if not public.is_member(p_org_id) then
    raise exception 'Non autorizzato';
  end if;
  if coalesce(cardinality(p_locations), 0) = 0 then
    raise exception 'Scegli almeno un luogo';
  end if;

  insert into public.shopping_lists (org_id, name, location, locations, created_by)
  values (p_org_id, trim(p_name), p_locations[1], p_locations, (select auth.uid()))
  returning id into v_list;

  if p_add_low then
    for v_item in
      select i.id, i.name, i.unit, i.min_qty - i.qty as missing
        from public.items i
       where i.org_id = p_org_id
         and i.location = any (p_locations)
         and i.kind = 'consumabile'
         and i.min_qty is not null
         and i.qty < i.min_qty
       order by i.location, i.name
    loop
      perform public.add_list_item(v_list, v_item.name, v_item.missing, v_item.unit, null, v_item.id, null);
    end loop;
  end if;

  return v_list;
end;
$$;

revoke execute on function public.create_shopping_list(uuid, text, public.item_location[], boolean) from public, anon;
grant  execute on function public.create_shopping_list(uuid, text, public.item_location[], boolean) to authenticated;

create or replace function public.add_list_item(
  p_list_id uuid,
  p_name    text,
  p_qty     numeric,
  p_unit    text,
  p_note    text default null,
  p_item_id uuid default null,
  p_dish_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_list public.shopping_lists%rowtype;
  v_line public.shopping_list_items%rowtype;
  v_id   uuid;
  v_qty  numeric;
  v_note text := nullif(trim(p_note), '');
  v_loc  public.item_location;
begin
  select * into v_list from public.shopping_lists where id = p_list_id;
  if not found or not public.is_member(v_list.org_id) then
    raise exception 'Lista non trovata';
  end if;
  if v_list.status <> 'aperta' then
    raise exception 'La lista è già chiusa';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'La quantità deve essere maggiore di zero';
  end if;

  if p_item_id is not null then
    select location into v_loc from public.items where id = p_item_id and org_id = v_list.org_id;
    if v_loc is not null and not (v_loc = any (v_list.locations)) then
      update public.shopping_lists set locations = array_append(locations, v_loc) where id = p_list_id;
    end if;
  end if;

  select * into v_line
    from public.shopping_list_items
   where list_id = p_list_id
     and not checked
     and public.unit_family(unit) = public.unit_family(p_unit)
     and (lower(trim(name)) = lower(trim(p_name)) or (p_item_id is not null and item_id = p_item_id))
   order by created_at
   limit 1
   for update;

  if found then
    v_qty := round(p_qty * public.unit_factor(p_unit) / public.unit_factor(v_line.unit), 3);
    update public.shopping_list_items
       set qty     = qty + v_qty,
           item_id = coalesce(item_id, p_item_id),
           note    = case
                       when v_note is null then note
                       when note is null then v_note
                       when position(lower(v_note) in lower(note)) > 0 then note
                       else note || ' · ' || v_note
                     end
     where id = v_line.id;
    v_id := v_line.id;
  else
    insert into public.shopping_list_items (list_id, org_id, item_id, name, qty, unit, note)
    values (p_list_id, v_list.org_id, p_item_id, trim(p_name), p_qty, p_unit, v_note)
    returning id into v_id;
    v_qty := p_qty;
  end if;

  if p_dish_id is not null then
    insert into public.dish_ingredients (org_id, dish_id, list_item_id, qty)
    values (v_list.org_id, p_dish_id, v_id, v_qty)
    on conflict (dish_id, list_item_id)
      do update set qty = public.dish_ingredients.qty + excluded.qty;
  end if;

  return v_id;
end;
$$;

create or replace function public.ensure_event_list(p_event_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_list  uuid;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found or not public.is_member(v_event.org_id) then
    raise exception 'Evento non trovato';
  end if;

  select id into v_list
    from public.shopping_lists
   where event_id = p_event_id and status = 'aperta'
   limit 1;

  if v_list is null then
    insert into public.shopping_lists (org_id, name, location, locations, event_id, created_by)
    values (v_event.org_id, 'Spesa ' || v_event.name, 'cucina', array['cucina', 'bar']::public.item_location[],
            p_event_id, (select auth.uid()))
    returning id into v_list;
  end if;

  return v_list;
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
  v_last public.shopping_runs%rowtype;
  v_new  uuid;
begin
  select * into v_list from public.shopping_lists where id = p_list_id for update;
  if not found or not public.is_member(v_list.org_id) then
    raise exception 'Lista non trovata';
  end if;
  if v_list.status <> 'aperta' then
    raise exception 'La lista è già chiusa';
  end if;

  if exists (select 1 from public.shopping_list_items where list_id = p_list_id and checked and run_id is null)
     or exists (select 1 from public.shopping_receipts where list_id = p_list_id and run_id is null) then
    perform public.register_shopping_run(p_list_id, p_shop, p_closed_on, p_paid_by, p_prices);
  end if;

  select * into v_last from public.shopping_runs
   where list_id = p_list_id order by run_date desc, created_at desc limit 1;
  if not found then
    raise exception 'Niente da chiudere: spunta almeno un articolo';
  end if;

  if exists (select 1 from public.shopping_list_items where list_id = p_list_id and not checked) then
    if p_carry_over then
      insert into public.shopping_lists (org_id, name, location, locations, created_by)
      values (v_list.org_id, v_list.name || ' (da finire)', v_list.location, v_list.locations, (select auth.uid()))
      returning id into v_new;
      update public.shopping_list_items set list_id = v_new
       where list_id = p_list_id and not checked;
    else
      delete from public.shopping_list_items where list_id = p_list_id and not checked;
    end if;
  end if;

  update public.shopping_lists
     set status       = 'chiusa',
         shop         = v_last.shop,
         closed_on    = v_last.run_date,
         paid_by      = v_last.paid_by,
         paid_by_user = v_last.paid_by_user,
         closed_at    = now()
   where id = p_list_id;

  return v_new;
end;
$$;

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
  (select count(*) from public.shopping_receipts r where r.list_id = l.id and r.total_cents is null)::int as receipts_missing,
  (select count(*) from public.shopping_runs sr where sr.list_id = l.id)::int                            as runs_count,
  (select coalesce(sum(public.run_total(sr.id)), 0) from public.shopping_runs sr where sr.list_id = l.id)::int as spent_cents,
  (select coalesce(sum(public.run_total(sr.id)), 0) from public.shopping_runs sr
    where sr.list_id = l.id and sr.paid_by = 'volontario' and not sr.reimbursed)::int                   as refund_cents,
  (count(i.id) filter (where i.checked and i.run_id is null))::int                                      as unregistered_count,
  l.locations
from public.shopping_lists l
left join public.shopping_list_items i on i.list_id = l.id
group by l.id;
