alter type public.member_role add value if not exists 'consigliere';

alter table public.members
  add column if not exists email text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.shift_people
  add column if not exists user_id uuid unique references auth.users(id) on delete set null;

create or replace function public.is_consigliere(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members
     where org_id = p_org and user_id = (select auth.uid()) and role::text in ('admin', 'consigliere')
  );
$$;
revoke execute on function public.is_consigliere(uuid) from public, anon;
grant  execute on function public.is_consigliere(uuid) to authenticated;

create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;
revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
grant  execute on function public.user_id_by_email(text) to service_role;

drop policy if exists "members: modifica admin" on public.members;
drop policy if exists "members: rimozione admin" on public.members;
create policy "members: modifica admin" on public.members
  for update to authenticated using (public.is_admin(org_id) and created_by = (select auth.uid()));
create policy "members: rimozione admin" on public.members
  for delete to authenticated using (public.is_admin(org_id) and created_by = (select auth.uid()));

drop policy if exists "items: inserimento" on public.items;
drop policy if exists "items: modifica" on public.items;
drop policy if exists "items: rimozione admin" on public.items;
create policy "items: inserimento" on public.items
  for insert to authenticated with check (public.is_consigliere(org_id));
create policy "items: modifica" on public.items
  for update to authenticated using (public.is_consigliere(org_id)) with check (public.is_consigliere(org_id));
create policy "items: rimozione" on public.items
  for delete to authenticated using (public.is_consigliere(org_id));

drop policy if exists "shift people: lettura" on public.shift_people;
create policy "shift people: lettura" on public.shift_people
  for select to authenticated using (public.is_consigliere(org_id));

drop policy if exists "shifts: lettura" on public.shifts;
drop policy if exists "shifts: inserimento" on public.shifts;
drop policy if exists "shifts: modifica" on public.shifts;
drop policy if exists "shifts: rimozione" on public.shifts;
create policy "shifts: lettura" on public.shifts
  for select to authenticated using (public.is_consigliere(org_id));
create policy "shifts: modifica" on public.shifts
  for update to authenticated using (public.is_consigliere(org_id)) with check (public.is_consigliere(org_id));
create policy "shifts: rimozione" on public.shifts
  for delete to authenticated using (public.is_consigliere(org_id));

drop policy if exists "clients: lettura" on public.clients;
drop policy if exists "clients: inserimento" on public.clients;
drop policy if exists "clients: modifica" on public.clients;
drop policy if exists "clients: rimozione" on public.clients;
create policy "clients: lettura" on public.clients
  for select to authenticated using (public.is_consigliere(org_id));
create policy "clients: modifica" on public.clients
  for update to authenticated using (public.is_consigliere(org_id)) with check (public.is_consigliere(org_id));
create policy "clients: rimozione" on public.clients
  for delete to authenticated using (public.is_consigliere(org_id));

drop policy if exists "rentals: lettura" on public.rentals;
drop policy if exists "rentals: inserimento" on public.rentals;
drop policy if exists "rentals: modifica" on public.rentals;
drop policy if exists "rentals: rimozione" on public.rentals;
create policy "rentals: lettura" on public.rentals
  for select to authenticated using (public.is_consigliere(org_id));
create policy "rentals: modifica" on public.rentals
  for update to authenticated using (public.is_consigliere(org_id)) with check (public.is_consigliere(org_id));
create policy "rentals: rimozione" on public.rentals
  for delete to authenticated using (public.is_consigliere(org_id));

create policy "shifts: inserimento" on public.shifts
  for insert to authenticated with check (public.is_consigliere(org_id));
create policy "clients: inserimento" on public.clients
  for insert to authenticated with check (public.is_consigliere(org_id));
create policy "rentals: inserimento" on public.rentals
  for insert to authenticated
  with check (
    public.is_consigliere(org_id)
    and exists (select 1 from public.clients c where c.id = client_id and c.org_id = rentals.org_id)
  );

drop policy if exists "contracts: lettura" on public.rental_contracts;
drop policy if exists "contracts: modifica" on public.rental_contracts;
create policy "contracts: lettura" on public.rental_contracts
  for select to authenticated using (public.is_consigliere(org_id));
create policy "contracts: modifica" on public.rental_contracts
  for update to authenticated using (public.is_consigliere(org_id)) with check (public.is_consigliere(org_id));

drop policy if exists "events: rimozione" on public.events;
create policy "events: rimozione" on public.events
  for delete to authenticated
  using (public.is_consigliere(org_id) or created_by = (select auth.uid()));

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
  if v_org is null or not public.is_consigliere(v_org) then
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

create or replace function public.adjust_broken(
  p_item_id uuid,
  p_delta   integer,
  p_reason  text default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_org    uuid;
  v_kind   public.item_kind;
  v_broken integer;
begin
  if p_delta = 0 then
    raise exception 'La variazione non può essere zero';
  end if;

  select org_id, kind into v_org, v_kind from public.items where id = p_item_id;
  if v_org is null or not public.is_consigliere(v_org) then
    raise exception 'Oggetto non trovato';
  end if;
  if v_kind <> 'attrezzatura' then
    raise exception 'Solo l''attrezzatura può essere da riparare';
  end if;

  update public.items
     set broken_qty = broken_qty + p_delta,
         updated_at = now()
   where id = p_item_id
     and broken_qty + p_delta between 0 and qty
  returning broken_qty into v_broken;

  if v_broken is null then
    raise exception 'Quantità non valida';
  end if;

  insert into public.item_movements (item_id, org_id, delta, broken_delta, reason, user_id)
  values (p_item_id, v_org, 0, p_delta, p_reason, (select auth.uid()));

  return v_broken;
end;
$$;

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
  if not public.is_consigliere(p_org_id) then
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

create or replace function public.swap_shifts(p_first uuid, p_second uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a public.shifts%rowtype;
  b public.shifts%rowtype;
begin
  select * into a from public.shifts where id = p_first for update;
  select * into b from public.shifts where id = p_second for update;
  if a.id is null or b.id is null or a.org_id <> b.org_id or not public.is_consigliere(a.org_id) then
    raise exception 'Turni non trovati';
  end if;
  update public.shifts set person_id = b.person_id, updated_by = (select auth.uid()), updated_at = now() where id = a.id;
  update public.shifts set person_id = a.person_id, updated_by = (select auth.uid()), updated_at = now() where id = b.id;
end;
$$;

create or replace function public.ensure_rental_contract(p_rental_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_rental public.rentals%rowtype;
  v_id     uuid;
  v_year   integer;
begin
  select * into v_rental from public.rentals where id = p_rental_id;
  if not found or not public.is_consigliere(v_rental.org_id) then
    raise exception 'Affitto non trovato';
  end if;

  select id into v_id from public.rental_contracts where rental_id = p_rental_id;
  if v_id is not null then
    return v_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('rental_contracts:' || v_rental.org_id::text));
  v_year := extract(year from current_date)::integer;

  insert into public.rental_contracts (org_id, rental_id, year, seq)
  values (
    v_rental.org_id, p_rental_id, v_year,
    coalesce((select max(seq) from public.rental_contracts where org_id = v_rental.org_id and year = v_year), 0) + 1
  )
  returning id into v_id;

  return v_id;
end;
$$;

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
  if not (public.is_consigliere(v_list.org_id) or v_list.created_by = (select auth.uid())) then
    raise exception 'Solo chi ha creato la lista o un consigliere può eliminarla';
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
  l.locations,
  l.created_by
from public.shopping_lists l
left join public.shopping_list_items i on i.list_id = l.id
group by l.id;
