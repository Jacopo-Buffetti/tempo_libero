drop trigger if exists shopping_list_items_guard_qty on public.shopping_list_items;

alter table public.items
  alter column qty     type numeric(12,3) using qty::numeric,
  alter column min_qty type numeric(12,3) using min_qty::numeric;

alter table public.item_movements
  alter column delta type numeric(12,3) using delta::numeric;

drop function if exists public.adjust_quantity(uuid, integer, text);

create or replace function public.adjust_quantity(
  p_item_id uuid,
  p_delta   numeric,
  p_reason  text default null
)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_qty numeric;
begin
  if p_delta = 0 then
    raise exception 'La variazione non può essere zero';
  end if;

  select org_id into v_org from public.items where id = p_item_id;
  if v_org is null or not public.is_member(v_org) then
    raise exception 'Oggetto non trovato';
  end if;

  update public.items
     set qty = qty + p_delta,
         updated_at = now()
   where id = p_item_id
     and qty + p_delta >= broken_qty
  returning qty into v_qty;

  if v_qty is null then
    raise exception 'Quantità non sufficiente';
  end if;

  insert into public.item_movements (item_id, org_id, delta, reason, user_id)
  values (p_item_id, v_org, p_delta, p_reason, (select auth.uid()));

  return v_qty;
end;
$$;

revoke execute on function public.adjust_quantity(uuid, numeric, text) from public, anon;
grant  execute on function public.adjust_quantity(uuid, numeric, text) to authenticated;

alter table public.shopping_list_items
  alter column qty type numeric(12,3) using qty::numeric,
  add column if not exists note text;

create or replace function public.guard_checked_qty()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.checked and (new.qty <> old.qty or new.unit <> old.unit) then
    raise exception 'Togli la spunta per cambiare quantità o unità';
  end if;
  return new;
end;
$$;

create trigger shopping_list_items_guard_qty
  before update of qty, unit on public.shopping_list_items
  for each row execute function public.guard_checked_qty();

grant update (name, qty, unit, note, price_cents) on public.shopping_list_items to authenticated;

create or replace function public.set_list_item_checked(p_id uuid, p_checked boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v       public.shopping_list_items%rowtype;
  v_delta numeric;
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
      raise exception 'In inventario non ce n''è abbastanza per annullare';
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
