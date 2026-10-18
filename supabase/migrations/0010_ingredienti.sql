delete from public.menu_dishes where section = 'bevande';

alter table public.menu_dishes drop constraint menu_dishes_section_check;
alter table public.menu_dishes
  add constraint menu_dishes_section_check
  check (section in ('antipasti', 'primi', 'secondi', 'contorni', 'dolci'));

alter table public.shopping_lists
  add column event_id uuid references public.events(id) on delete set null;

create unique index shopping_lists_one_open_per_event
  on public.shopping_lists(event_id) where event_id is not null and status = 'aperta';

alter table public.shopping_list_items
  add column dish_id uuid references public.menu_dishes(id) on delete set null;
create index shopping_list_items_dish_idx on public.shopping_list_items(dish_id);

drop index public.shopping_list_items_one_per_item;
create unique index shopping_list_items_one_per_item
  on public.shopping_list_items(list_id, item_id)
  where item_id is not null and dish_id is null;

create or replace view public.shopping_list_summary
with (security_invoker = true) as
select
  l.id, l.org_id, l.name, l.location, l.status, l.shop, l.closed_on,
  l.paid_by, l.paid_by_user, l.reimbursed, l.created_at, l.closed_at,
  count(i.id)::int                                                     as items_count,
  (count(i.id) filter (where i.checked))::int                          as checked_count,
  coalesce(sum(i.price_cents) filter (where i.checked), 0)::int        as total_cents,
  (count(i.id) filter (where i.checked and i.price_cents is null))::int as missing_prices,
  l.event_id
from public.shopping_lists l
left join public.shopping_list_items i on i.list_id = l.id
group by l.id;

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
    insert into public.shopping_lists (org_id, name, location, event_id, created_by)
    values (v_event.org_id, 'Spesa ' || v_event.name, 'cucina', p_event_id, (select auth.uid()))
    returning id into v_list;
  end if;

  return v_list;
end;
$$;

revoke execute on function public.ensure_event_list(uuid) from public, anon;
grant  execute on function public.ensure_event_list(uuid) to authenticated;

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
        select distinct on (lower(i.name), i.unit) i.*
          from public.shopping_list_items i
         where i.dish_id = d.id
         order by lower(i.name), i.unit, i.created_at desc
      loop
        if v_list is null then
          v_list := public.ensure_event_list(v_event);
        end if;
        insert into public.shopping_list_items (list_id, org_id, item_id, name, qty, unit, note, dish_id)
        values (v_list, p_org_id, ing.item_id, ing.name, ing.qty, ing.unit, ing.note, v_new_dish);
      end loop;
    end loop;
  end if;

  return v_event;
end;
$$;
