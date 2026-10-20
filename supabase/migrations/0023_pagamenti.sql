create table public.payers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index payers_org_name_idx on public.payers(org_id, lower(trim(name)));

grant select on public.payers to authenticated;
alter table public.payers enable row level security;
create policy "payers: lettura" on public.payers
  for select to authenticated using (public.is_member(org_id));

alter table public.shopping_runs
  add column if not exists paid_by_person uuid references public.shift_people(id) on delete set null,
  add column if not exists paid_by_name   text,
  add column if not exists payer_id       uuid references public.payers(id) on delete set null,
  add column if not exists amount_cents   integer check (amount_cents is null or amount_cents >= 0),
  add column if not exists reimbursed_on  date;

alter table public.shopping_lists
  add column if not exists paid_by_person uuid references public.shift_people(id) on delete set null,
  add column if not exists paid_by_name   text;

update public.shopping_runs r
   set paid_by_name = coalesce(
         (select sp.name from public.shift_people sp where sp.id = r.paid_by_person),
         (select m.display_name from public.members m where m.user_id = r.paid_by_user and m.org_id = r.org_id)
       )
 where r.paid_by = 'volontario' and r.paid_by_name is null;

update public.shopping_runs r
   set amount_cents = case
         when exists (select 1 from public.shopping_receipts x where x.run_id = r.id) then
           case
             when exists (select 1 from public.shopping_receipts x where x.run_id = r.id and x.total_cents is null) then null
             else (select sum(x.total_cents) from public.shopping_receipts x where x.run_id = r.id)
           end
         when not exists (select 1 from public.shopping_list_items i where i.run_id = r.id and i.checked) then null
         when exists (select 1 from public.shopping_list_items i where i.run_id = r.id and i.checked and i.price_cents is null) then null
         else (select sum(i.price_cents) from public.shopping_list_items i where i.run_id = r.id and i.checked)
       end
 where r.amount_cents is null;

insert into public.payers (org_id, name)
select distinct on (r.org_id, lower(trim(r.paid_by_name))) r.org_id, trim(r.paid_by_name)
  from public.shopping_runs r
 where r.paid_by = 'volontario'
   and r.paid_by_person is null
   and r.paid_by_user is null
   and length(trim(coalesce(r.paid_by_name, ''))) > 0
on conflict do nothing;

update public.shopping_runs r
   set payer_id = p.id
  from public.payers p
 where r.payer_id is null
   and r.paid_by = 'volontario'
   and r.paid_by_person is null
   and r.paid_by_user is null
   and p.org_id = r.org_id
   and lower(trim(p.name)) = lower(trim(r.paid_by_name));

create or replace function public.payer_options(p_org uuid)
returns table (kind text, id uuid, name text, user_id uuid)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_org) then
    raise exception 'Non fai parte di questa associazione';
  end if;

  return query
  select o.kind, o.id, o.name, o.user_id
    from (
      select 'consigliere'::text as kind, sp.id, sp.name, sp.user_id, 1 as grp, sp.position as pos
        from public.shift_people sp
       where sp.org_id = p_org and sp.active
      union all
      select 'membro', m.user_id, m.display_name, m.user_id, 2, 0
        from public.members m
       where m.org_id = p_org
         and length(trim(coalesce(m.display_name, ''))) > 0
         and not exists (select 1 from public.shift_people sp where sp.org_id = p_org and sp.user_id = m.user_id)
      union all
      select 'persona', p.id, p.name, null::uuid, 3, 0
        from public.payers p
       where p.org_id = p_org
    ) o
   order by o.grp, o.pos, lower(o.name);
end;
$$;
revoke execute on function public.payer_options(uuid) from public, anon;
grant  execute on function public.payer_options(uuid) to authenticated;

create or replace function public.resolve_payer(
  p_org  uuid,
  p_kind text,
  p_ref  uuid,
  p_name text,
  out paid_by        public.payment_source,
  out paid_by_person uuid,
  out payer_id       uuid,
  out paid_by_user   uuid,
  out paid_by_name   text
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if p_kind = 'cassa' then
    paid_by := 'cassa';
    return;
  end if;

  paid_by := 'volontario';

  if p_kind = 'consigliere' then
    select sp.id, sp.user_id, sp.name into paid_by_person, paid_by_user, paid_by_name
      from public.shift_people sp
     where sp.id = p_ref and sp.org_id = p_org;
    if paid_by_person is null then
      raise exception 'Consigliere non trovato';
    end if;
  elsif p_kind = 'membro' then
    select m.user_id, m.display_name into paid_by_user, paid_by_name
      from public.members m
     where m.user_id = p_ref and m.org_id = p_org;
    if paid_by_user is null then
      raise exception 'Persona non trovata';
    end if;
  elsif p_kind = 'persona' then
    select p.id, p.name into payer_id, paid_by_name
      from public.payers p
     where p.id = p_ref and p.org_id = p_org;
    if payer_id is null then
      raise exception 'Persona non trovata';
    end if;
  elsif p_kind = 'nuova' then
    if v_name is null then
      raise exception 'Scrivi il nome di chi ha pagato';
    end if;
    select p.id, p.name into payer_id, paid_by_name
      from public.payers p
     where p.org_id = p_org and lower(trim(p.name)) = lower(v_name);
    if payer_id is null then
      insert into public.payers (org_id, name) values (p_org, v_name)
      returning id, name into payer_id, paid_by_name;
    end if;
  else
    raise exception 'Indica chi ha pagato';
  end if;
end;
$$;
revoke execute on function public.resolve_payer(uuid, text, uuid, text) from public, anon, authenticated;

create or replace function public.create_payment(
  p_list_id      uuid,
  p_item_ids     uuid[],
  p_payer_kind   text,
  p_payer_ref    uuid,
  p_payer_name   text,
  p_amount_cents integer,
  p_shop         text,
  p_paid_on      date
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_list  public.shopping_lists%rowtype;
  v_payer record;
  v_run   uuid;
  v_ok    integer;
begin
  select * into v_list from public.shopping_lists where id = p_list_id for update;
  if not found or not public.is_member(v_list.org_id) then
    raise exception 'Lista non trovata';
  end if;
  if v_list.status <> 'aperta' then
    raise exception 'La lista è già chiusa';
  end if;
  if coalesce(array_length(p_item_ids, 1), 0) = 0 then
    raise exception 'Scegli almeno un articolo per questo pagamento';
  end if;
  if p_amount_cents is not null and p_amount_cents < 0 then
    raise exception 'Importo non valido';
  end if;

  select count(*) into v_ok
    from public.shopping_list_items
   where id = any(p_item_ids) and list_id = p_list_id and checked and run_id is null;
  if v_ok <> (select count(distinct x) from unnest(p_item_ids) x) then
    raise exception 'Alcuni articoli non sono più da attribuire: aggiorna la lista e riprova';
  end if;

  select * into v_payer from public.resolve_payer(v_list.org_id, p_payer_kind, p_payer_ref, p_payer_name);

  insert into public.shopping_runs
    (org_id, list_id, shop, run_date, paid_by, paid_by_person, payer_id, paid_by_user, paid_by_name,
     amount_cents, created_by)
  values
    (v_list.org_id, p_list_id, nullif(trim(p_shop), ''), coalesce(p_paid_on, current_date),
     v_payer.paid_by, v_payer.paid_by_person, v_payer.payer_id, v_payer.paid_by_user, v_payer.paid_by_name,
     p_amount_cents, (select auth.uid()))
  returning id into v_run;

  update public.shopping_list_items set run_id = v_run where id = any(p_item_ids);
  update public.shopping_receipts set run_id = v_run where list_id = p_list_id and run_id is null;

  return v_run;
end;
$$;
revoke execute on function public.create_payment(uuid, uuid[], text, uuid, text, integer, text, date) from public, anon;
grant  execute on function public.create_payment(uuid, uuid[], text, uuid, text, integer, text, date) to authenticated;

create or replace function public.update_payment(
  p_id           uuid,
  p_item_ids     uuid[],
  p_payer_kind   text,
  p_payer_ref    uuid,
  p_payer_name   text,
  p_amount_cents integer,
  p_shop         text,
  p_paid_on      date
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_run   public.shopping_runs%rowtype;
  v_list  public.shopping_lists%rowtype;
  v_payer record;
  v_ok    integer;
  v_same  boolean;
begin
  select * into v_run from public.shopping_runs where id = p_id for update;
  if not found or not public.is_member(v_run.org_id) then
    raise exception 'Pagamento non trovato';
  end if;
  select * into v_list from public.shopping_lists where id = v_run.list_id for update;
  if p_amount_cents is not null and p_amount_cents < 0 then
    raise exception 'Importo non valido';
  end if;

  if p_item_ids is not null then
    if v_list.status <> 'aperta' then
      raise exception 'La lista è chiusa: gli articoli del pagamento non si possono più cambiare';
    end if;
    if coalesce(array_length(p_item_ids, 1), 0) = 0 then
      raise exception 'Un pagamento deve avere almeno un articolo: se non serve più, eliminalo';
    end if;
    select count(*) into v_ok
      from public.shopping_list_items
     where id = any(p_item_ids) and list_id = v_run.list_id and checked
       and (run_id is null or run_id = p_id);
    if v_ok <> (select count(distinct x) from unnest(p_item_ids) x) then
      raise exception 'Alcuni articoli non sono più da attribuire: aggiorna la lista e riprova';
    end if;
    update public.shopping_list_items set run_id = null
     where run_id = p_id and not (id = any(p_item_ids));
    update public.shopping_list_items set run_id = p_id
     where id = any(p_item_ids);
  end if;

  select * into v_payer from public.resolve_payer(v_run.org_id, p_payer_kind, p_payer_ref, p_payer_name);
  v_same := v_payer.paid_by = v_run.paid_by
        and v_payer.paid_by_person is not distinct from v_run.paid_by_person
        and v_payer.paid_by_user   is not distinct from v_run.paid_by_user
        and lower(trim(coalesce(v_payer.paid_by_name, ''))) = lower(trim(coalesce(v_run.paid_by_name, '')));

  update public.shopping_runs
     set shop           = nullif(trim(p_shop), ''),
         run_date       = coalesce(p_paid_on, run_date),
         amount_cents   = p_amount_cents,
         paid_by        = v_payer.paid_by,
         paid_by_person = v_payer.paid_by_person,
         payer_id       = v_payer.payer_id,
         paid_by_user   = v_payer.paid_by_user,
         paid_by_name   = v_payer.paid_by_name,
         reimbursed     = case when v_same then reimbursed else false end,
         reimbursed_on  = case when v_same then reimbursed_on end
   where id = p_id;
end;
$$;
revoke execute on function public.update_payment(uuid, uuid[], text, uuid, text, integer, text, date) from public, anon;
grant  execute on function public.update_payment(uuid, uuid[], text, uuid, text, integer, text, date) to authenticated;

create or replace function public.delete_payment(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_run  public.shopping_runs%rowtype;
  v_list public.shopping_lists%rowtype;
begin
  select * into v_run from public.shopping_runs where id = p_id for update;
  if not found or not public.is_member(v_run.org_id) then
    raise exception 'Pagamento non trovato';
  end if;
  select * into v_list from public.shopping_lists where id = v_run.list_id;
  if v_list.status <> 'aperta' then
    raise exception 'La lista è chiusa: il pagamento non si può più eliminare';
  end if;

  update public.shopping_list_items set run_id = null where run_id = p_id;
  update public.shopping_receipts  set run_id = null where run_id = p_id;
  delete from public.shopping_runs where id = p_id;
end;
$$;
revoke execute on function public.delete_payment(uuid) from public, anon;
grant  execute on function public.delete_payment(uuid) to authenticated;

create or replace function public.set_payments_reimbursed(p_ids uuid[], p_value boolean)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.shopping_runs r
     set reimbursed    = p_value,
         reimbursed_on = case when p_value then current_date end
   where r.id = any(p_ids)
     and r.paid_by = 'volontario'
     and public.is_member(r.org_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.set_payments_reimbursed(uuid[], boolean) from public, anon;
grant  execute on function public.set_payments_reimbursed(uuid[], boolean) to authenticated;

drop function if exists public.close_shopping_list(uuid, text, date, public.payment_source, jsonb, boolean);
drop function if exists public.close_shopping_list(uuid, text, date, public.payment_source, jsonb, boolean, uuid, text);
drop function if exists public.register_shopping_run(uuid, text, date, public.payment_source, jsonb);
drop function if exists public.register_shopping_run(uuid, text, date, public.payment_source, jsonb, uuid, text);

create or replace function public.close_shopping_list(
  p_list_id    uuid,
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
  if exists (select 1 from public.shopping_list_items where list_id = p_list_id and checked and run_id is null) then
    raise exception 'Ci sono articoli comprati senza pagamento: aggiungi un pagamento prima di chiudere';
  end if;

  select * into v_last from public.shopping_runs
   where list_id = p_list_id order by run_date desc, created_at desc limit 1;
  if not found then
    raise exception 'Niente da chiudere: aggiungi almeno un pagamento';
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
revoke execute on function public.close_shopping_list(uuid, boolean) from public, anon;
grant  execute on function public.close_shopping_list(uuid, boolean) to authenticated;

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
  (select coalesce(sum(sr.amount_cents), 0) from public.shopping_runs sr where sr.list_id = l.id)::int   as spent_cents,
  (select coalesce(sum(sr.amount_cents), 0) from public.shopping_runs sr
    where sr.list_id = l.id and sr.paid_by = 'volontario' and not sr.reimbursed)::int                   as refund_cents,
  (count(i.id) filter (where i.checked and i.run_id is null))::int                                      as unregistered_count,
  l.locations,
  l.created_by,
  (select count(*) from public.shopping_runs sr where sr.list_id = l.id and sr.amount_cents is null)::int as amounts_missing
from public.shopping_lists l
left join public.shopping_list_items i on i.list_id = l.id
group by l.id;
