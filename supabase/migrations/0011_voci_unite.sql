create or replace function public.unit_family(p_unit text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_unit in ('kg', 'g') then 'peso'
    when p_unit in ('litri', 'ml') then 'volume'
    else p_unit
  end;
$$;

create or replace function public.unit_factor(p_unit text)
returns numeric
language sql immutable set search_path = ''
as $$
  select case when p_unit in ('g', 'ml') then 0.001 else 1 end::numeric;
$$;

create table public.dish_ingredients (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  dish_id      uuid not null references public.menu_dishes(id) on delete cascade,
  list_item_id uuid not null references public.shopping_list_items(id) on delete cascade,
  qty          numeric(12,3) not null check (qty > 0),
  unique (dish_id, list_item_id)
);
create index dish_ingredients_item_idx on public.dish_ingredients(list_item_id);

insert into public.dish_ingredients (org_id, dish_id, list_item_id, qty)
select org_id, dish_id, id, qty
  from public.shopping_list_items
 where dish_id is not null;

do $$
declare
  g    record;
  keep public.shopping_list_items%rowtype;
begin
  for g in
    select list_id, array_agg(id order by created_at) as ids
      from public.shopping_list_items
     where not checked
     group by list_id, lower(trim(name)), public.unit_family(unit)
    having count(*) > 1
  loop
    select * into keep from public.shopping_list_items where id = g.ids[1];

    update public.shopping_list_items k
       set qty = k.qty + (
             select coalesce(sum(o.qty * public.unit_factor(o.unit) / public.unit_factor(k.unit)), 0)
               from public.shopping_list_items o
              where o.id = any (g.ids[2:])),
           item_id = coalesce(k.item_id, (
             select o.item_id from public.shopping_list_items o
              where o.id = any (g.ids[2:]) and o.item_id is not null limit 1))
     where k.id = keep.id;

    insert into public.dish_ingredients (org_id, dish_id, list_item_id, qty)
    select di.org_id, di.dish_id, keep.id,
           sum(di.qty * public.unit_factor(o.unit) / public.unit_factor(keep.unit))
      from public.dish_ingredients di
      join public.shopping_list_items o on o.id = di.list_item_id
     where di.list_item_id = any (g.ids[2:])
     group by di.org_id, di.dish_id
    on conflict (dish_id, list_item_id)
      do update set qty = public.dish_ingredients.qty + excluded.qty;

    delete from public.shopping_list_items where id = any (g.ids[2:]);
  end loop;
end;
$$;

alter table public.shopping_list_items drop column dish_id;

create unique index shopping_list_items_one_open_per_name
  on public.shopping_list_items (list_id, lower(trim(name)), public.unit_family(unit))
  where not checked;

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

create or replace function public.set_dish_ingredient_qty(p_id uuid, p_qty numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_di   public.dish_ingredients%rowtype;
  v_line public.shopping_list_items%rowtype;
  v_diff numeric;
begin
  select * into v_di from public.dish_ingredients where id = p_id for update;
  if not found or not public.is_member(v_di.org_id) then
    raise exception 'Ingrediente non trovato';
  end if;
  select * into v_line from public.shopping_list_items where id = v_di.list_item_id for update;
  if v_line.checked then
    raise exception 'È già stato comprato: togli prima la spunta dalla lista';
  end if;

  v_diff := coalesce(p_qty, 0) - v_di.qty;

  if coalesce(p_qty, 0) <= 0 then
    delete from public.dish_ingredients where id = p_id;
  else
    update public.dish_ingredients set qty = p_qty where id = p_id;
  end if;

  if v_line.qty + v_diff <= 0.0005 then
    delete from public.shopping_list_items where id = v_line.id;
  else
    update public.shopping_list_items set qty = round(qty + v_diff, 3) where id = v_line.id;
  end if;
end;
$$;

create or replace function public.delete_dish(p_dish_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  di    record;
begin
  select org_id into v_org from public.menu_dishes where id = p_dish_id;
  if v_org is null or not public.is_member(v_org) then
    raise exception 'Piatto non trovato';
  end if;

  for di in
    select d.id, d.qty, i.id as item, i.qty as item_qty
      from public.dish_ingredients d
      join public.shopping_list_items i on i.id = d.list_item_id
     where d.dish_id = p_dish_id and not i.checked
  loop
    if di.item_qty - di.qty <= 0.0005 then
      delete from public.shopping_list_items where id = di.item;
    else
      update public.shopping_list_items set qty = round(qty - di.qty, 3) where id = di.item;
    end if;
  end loop;

  delete from public.menu_dishes where id = p_dish_id;
end;
$$;

create or replace function public.create_event(
  p_org_id     uuid,
  p_name       text,
  p_starts_on  date,
  p_start_time time default null,
  p_place      text default null,
  p_copy_from  uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_event    uuid;
  v_list     uuid;
  v_new_dish uuid;
  d          record;
  ing        record;
begin
  if not public.is_member(p_org_id) then
    raise exception 'Non autorizzato';
  end if;

  insert into public.events (org_id, name, starts_on, start_time, place, copied_from, created_by)
  values (p_org_id, trim(p_name), p_starts_on, p_start_time, nullif(trim(p_place), ''),
          p_copy_from, (select auth.uid()))
  returning id into v_event;

  if p_copy_from is not null then
    for d in
      select * from public.menu_dishes
       where event_id = p_copy_from and org_id = p_org_id
       order by section, position
    loop
      insert into public.menu_dishes (event_id, org_id, section, name, description, price_cents, position)
      values (v_event, p_org_id, d.section, d.name, d.description, d.price_cents, d.position)
      returning id into v_new_dish;

      for ing in
        select di.qty, i.name, i.unit, i.note, i.item_id
          from public.dish_ingredients di
          join public.shopping_list_items i on i.id = di.list_item_id
         where di.dish_id = d.id
      loop
        if v_list is null then
          v_list := public.ensure_event_list(v_event);
        end if;
        perform public.add_list_item(v_list, ing.name, ing.qty, ing.unit, ing.note, ing.item_id, v_new_dish);
      end loop;
    end loop;
  end if;

  return v_event;
end;
$$;

grant select on public.dish_ingredients to authenticated;
alter table public.dish_ingredients enable row level security;
create policy "dish ingredients: lettura" on public.dish_ingredients
  for select to authenticated using (public.is_member(org_id));

revoke execute on function public.add_list_item(uuid, text, numeric, text, text, uuid, uuid) from public, anon;
grant  execute on function public.add_list_item(uuid, text, numeric, text, text, uuid, uuid) to authenticated;
revoke execute on function public.set_dish_ingredient_qty(uuid, numeric) from public, anon;
grant  execute on function public.set_dish_ingredient_qty(uuid, numeric) to authenticated;
revoke execute on function public.delete_dish(uuid) from public, anon;
grant  execute on function public.delete_dish(uuid) to authenticated;
