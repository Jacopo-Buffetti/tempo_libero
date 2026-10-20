alter table public.shopping_runs
  add column paid_by_person uuid references public.shift_people(id) on delete set null,
  add column paid_by_name   text;

alter table public.shopping_lists
  add column paid_by_person uuid references public.shift_people(id) on delete set null,
  add column paid_by_name   text;

update public.shopping_runs r
   set paid_by_person = sp.id
  from public.shift_people sp
 where r.paid_by = 'volontario'
   and r.paid_by_user is not null
   and sp.user_id = r.paid_by_user
   and sp.org_id = r.org_id;

update public.shopping_runs r
   set paid_by_name = coalesce(
         (select sp.name from public.shift_people sp where sp.id = r.paid_by_person),
         (select m.display_name from public.members m where m.user_id = r.paid_by_user and m.org_id = r.org_id)
       )
 where r.paid_by = 'volontario';

update public.shopping_lists l
   set (paid_by_person, paid_by_name) = (
         select sr.paid_by_person, sr.paid_by_name
           from public.shopping_runs sr
          where sr.list_id = l.id
          order by sr.run_date desc, sr.created_at desc
          limit 1
       )
 where l.status = 'chiusa' and l.paid_by = 'volontario';

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

  if new.paid_by is distinct from old.paid_by and new.status = old.status then
    new.paid_by_user   := case when new.paid_by = 'volontario' then (select auth.uid()) end;
    new.paid_by_person := case when new.paid_by = 'volontario'
                            then (select sp.id from public.shift_people sp
                                   where sp.org_id = new.org_id and sp.user_id = (select auth.uid()))
                          end;
    new.paid_by_name   := case when new.paid_by = 'volontario'
                            then (select m.display_name from public.members m
                                   where m.org_id = new.org_id and m.user_id = (select auth.uid()))
                          end;
    new.reimbursed := false;
  end if;

  return new;
end;
$$;

drop function if exists public.close_shopping_list(uuid, text, date, public.payment_source, jsonb, boolean);
drop function if exists public.register_shopping_run(uuid, text, date, public.payment_source, jsonb);

create or replace function public.register_shopping_run(
  p_list_id        uuid,
  p_shop           text,
  p_run_date       date,
  p_paid_by        public.payment_source,
  p_prices         jsonb,
  p_paid_by_person uuid default null,
  p_paid_by_name   text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_list   public.shopping_lists%rowtype;
  v_run    uuid;
  v_p      jsonb;
  v_person uuid;
  v_name   text;
  v_user   uuid;
begin
  select * into v_list from public.shopping_lists where id = p_list_id for update;
  if not found or not public.is_member(v_list.org_id) then
    raise exception 'Lista non trovata';
  end if;
  if v_list.status <> 'aperta' then
    raise exception 'La lista è già chiusa';
  end if;
  if not exists (select 1 from public.shopping_list_items where list_id = p_list_id and checked and run_id is null)
     and not exists (select 1 from public.shopping_receipts where list_id = p_list_id and run_id is null) then
    raise exception 'Niente da registrare: spunta quello che hai comprato';
  end if;

  if p_paid_by = 'volontario' then
    if p_paid_by_person is not null then
      select sp.id, sp.name, sp.user_id into v_person, v_name, v_user
        from public.shift_people sp
       where sp.id = p_paid_by_person and sp.org_id = v_list.org_id;
      if v_person is null then
        raise exception 'Consigliere non trovato';
      end if;
    else
      v_name := nullif(trim(p_paid_by_name), '');
      if v_name is null then
        raise exception 'Indica chi ha anticipato la spesa';
      end if;
    end if;
  end if;

  insert into public.shopping_runs
    (org_id, list_id, shop, run_date, paid_by, paid_by_user, paid_by_person, paid_by_name, created_by)
  values (v_list.org_id, p_list_id, nullif(trim(p_shop), ''), coalesce(p_run_date, current_date), p_paid_by,
          v_user, v_person, v_name, (select auth.uid()))
  returning id into v_run;

  for v_p in select * from jsonb_array_elements(coalesce(p_prices, '[]'::jsonb)) loop
    update public.shopping_list_items
       set price_cents = (v_p->>'price_cents')::integer
     where id = (v_p->>'id')::uuid and list_id = p_list_id and checked and run_id is null;
  end loop;

  update public.shopping_list_items set run_id = v_run
   where list_id = p_list_id and checked and run_id is null;
  update public.shopping_receipts set run_id = v_run
   where list_id = p_list_id and run_id is null;

  return v_run;
end;
$$;

revoke execute on function public.register_shopping_run(uuid, text, date, public.payment_source, jsonb, uuid, text) from public, anon;
grant  execute on function public.register_shopping_run(uuid, text, date, public.payment_source, jsonb, uuid, text) to authenticated;

create or replace function public.close_shopping_list(
  p_list_id        uuid,
  p_shop           text,
  p_closed_on      date,
  p_paid_by        public.payment_source,
  p_prices         jsonb,
  p_carry_over     boolean default true,
  p_paid_by_person uuid default null,
  p_paid_by_name   text default null
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
    perform public.register_shopping_run(p_list_id, p_shop, p_closed_on, p_paid_by, p_prices, p_paid_by_person, p_paid_by_name);
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
     set status         = 'chiusa',
         shop           = v_last.shop,
         closed_on      = v_last.run_date,
         paid_by        = v_last.paid_by,
         paid_by_user   = v_last.paid_by_user,
         paid_by_person = v_last.paid_by_person,
         paid_by_name   = v_last.paid_by_name,
         closed_at      = now()
   where id = p_list_id;

  return v_new;
end;
$$;

revoke execute on function public.close_shopping_list(uuid, text, date, public.payment_source, jsonb, boolean, uuid, text) from public, anon;
grant  execute on function public.close_shopping_list(uuid, text, date, public.payment_source, jsonb, boolean, uuid, text) to authenticated;
