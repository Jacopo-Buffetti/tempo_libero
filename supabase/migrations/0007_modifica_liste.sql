grant update (name, location, shop, closed_on, paid_by, reimbursed)
  on public.shopping_lists to authenticated;

create or replace function public.guard_list_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.location <> old.location then
    if old.status = 'chiusa' then
      raise exception 'Il luogo di una lista chiusa non si può cambiare';
    end if;
    if exists (select 1 from public.shopping_list_items where list_id = old.id and checked) then
      raise exception 'Togli le spunte prima di cambiare il luogo della lista';
    end if;
  end if;

  if old.status = 'aperta' and new.status = 'aperta' and (
       new.shop      is distinct from old.shop
    or new.closed_on is distinct from old.closed_on
    or new.paid_by   is distinct from old.paid_by
  ) then
    raise exception 'Negozio, data e pagamento si impostano quando chiudi la lista';
  end if;

  if new.paid_by is distinct from old.paid_by then
    new.paid_by_user := case when new.paid_by = 'volontario' then (select auth.uid()) end;
    new.reimbursed := false;
  end if;

  return new;
end;
$$;

create trigger shopping_lists_guard_update
  before update on public.shopping_lists
  for each row execute function public.guard_list_update();

revoke delete on public.shopping_lists from authenticated;
drop policy if exists "lists: rimozione admin" on public.shopping_lists;

create or replace function public.delete_shopping_list(
  p_list_id uuid,
  p_revert  boolean default false
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_list public.shopping_lists%rowtype;
  v      record;
begin
  select * into v_list from public.shopping_lists where id = p_list_id for update;
  if not found or not public.is_member(v_list.org_id) then
    raise exception 'Lista non trovata';
  end if;
  if not (public.is_admin(v_list.org_id) or v_list.created_by = (select auth.uid())) then
    raise exception 'Solo chi ha creato la lista o un amministratore può eliminarla';
  end if;

  if p_revert and v_list.status = 'aperta' then
    for v in
      select * from public.shopping_list_items
       where list_id = p_list_id and checked and item_id is not null
    loop
      update public.items
         set qty = qty - v.qty, updated_at = now()
       where id = v.item_id and qty - v.qty >= broken_qty;
      if not found then
        raise exception 'In inventario non c''è abbastanza "%" per annullare', v.name;
      end if;
      insert into public.item_movements (item_id, org_id, delta, reason, user_id)
      values (v.item_id, v.org_id, -v.qty, 'lista spesa eliminata', (select auth.uid()));
    end loop;
  end if;

  delete from public.shopping_lists where id = p_list_id;
end;
$$;

revoke execute on function public.delete_shopping_list(uuid, boolean) from public, anon;
grant  execute on function public.delete_shopping_list(uuid, boolean) to authenticated;
