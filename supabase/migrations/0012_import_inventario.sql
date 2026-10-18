create or replace function public.import_items(p_org_id uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r        jsonb;
  v_item   public.items%rowtype;
  v_id     uuid;
  v_name   text;
  v_loc    public.item_location;
  v_kind   public.item_kind;
  v_unit   text;
  v_qty    numeric;
  v_min    numeric;
  v_broken integer;
  v_new    integer := 0;
  v_upd    integer := 0;
begin
  if not public.is_member(p_org_id) then
    raise exception 'Non autorizzato';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_name := trim(r->>'name');
    if v_name is null or v_name = '' then
      continue;
    end if;

    v_loc    := (r->>'location')::public.item_location;
    v_kind   := coalesce(nullif(r->>'kind', ''), 'consumabile')::public.item_kind;
    v_unit   := coalesce(nullif(trim(r->>'unit'), ''), 'pezzi');
    v_qty    := greatest(coalesce((r->>'qty')::numeric, 0), 0);
    v_min    := case when v_kind = 'consumabile' then (r->>'min_qty')::numeric end;
    v_broken := case when v_kind = 'attrezzatura'
                     then least(greatest(coalesce((r->>'broken_qty')::integer, 0), 0), floor(v_qty)::integer)
                     else 0 end;

    select * into v_item
      from public.items
     where org_id = p_org_id and location = v_loc and lower(trim(name)) = lower(v_name)
       for update;

    if found then
      update public.items
         set kind = v_kind, unit = v_unit, qty = v_qty, min_qty = v_min,
             broken_qty = v_broken, updated_at = now()
       where id = v_item.id;
      if v_qty <> v_item.qty then
        insert into public.item_movements (item_id, org_id, delta, reason, user_id)
        values (v_item.id, p_org_id, v_qty - v_item.qty, 'import csv', (select auth.uid()));
      end if;
      v_upd := v_upd + 1;
    else
      insert into public.items (org_id, name, location, kind, unit, qty, min_qty, broken_qty)
      values (p_org_id, v_name, v_loc, v_kind, v_unit, v_qty, v_min, v_broken)
      returning id into v_id;
      if v_qty > 0 then
        insert into public.item_movements (item_id, org_id, delta, reason, user_id)
        values (v_id, p_org_id, v_qty, 'import csv', (select auth.uid()));
      end if;
      v_new := v_new + 1;
    end if;
  end loop;

  return jsonb_build_object('created', v_new, 'updated', v_upd);
end;
$$;

revoke execute on function public.import_items(uuid, jsonb) from public, anon;
grant  execute on function public.import_items(uuid, jsonb) to authenticated;
