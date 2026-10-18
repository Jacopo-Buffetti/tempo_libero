create table public.shopping_runs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  list_id      uuid not null references public.shopping_lists(id) on delete cascade,
  shop         text,
  run_date     date not null default current_date,
  paid_by      public.payment_source not null default 'cassa',
  paid_by_user uuid references auth.users(id) on delete set null,
  reimbursed   boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index shopping_runs_list_idx on public.shopping_runs(list_id, run_date, created_at);

alter table public.shopping_list_items
  add column run_id uuid references public.shopping_runs(id) on delete set null;
create index shopping_list_items_run_idx on public.shopping_list_items(run_id);

alter table public.shopping_receipts
  add column run_id uuid references public.shopping_runs(id) on delete set null;
create index shopping_receipts_run_idx on public.shopping_receipts(run_id);

with created as (
  insert into public.shopping_runs (org_id, list_id, shop, run_date, paid_by, paid_by_user, reimbursed, created_by, created_at)
  select org_id, id, shop, coalesce(closed_on, created_at::date), coalesce(paid_by, 'cassa'),
         paid_by_user, reimbursed, created_by, coalesce(closed_at, created_at)
    from public.shopping_lists
   where status = 'chiusa'
  returning id, list_id
)
update public.shopping_list_items i
   set run_id = created.id
  from created
 where i.list_id = created.list_id and i.checked;

update public.shopping_receipts r
   set run_id = sr.id
  from public.shopping_runs sr
 where r.list_id = sr.list_id and r.run_id is null;

grant select on public.shopping_runs to authenticated;
grant update (reimbursed) on public.shopping_runs to authenticated;
alter table public.shopping_runs enable row level security;
create policy "runs: lettura" on public.shopping_runs
  for select to authenticated using (public.is_member(org_id));
create policy "runs: modifica" on public.shopping_runs
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));

create or replace function public.run_total(p_run_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select case
    when exists (select 1 from public.shopping_receipts where run_id = p_run_id)
      then (select coalesce(sum(total_cents), 0) from public.shopping_receipts where run_id = p_run_id)
    else (select coalesce(sum(price_cents), 0) from public.shopping_list_items where run_id = p_run_id and checked)
  end::int;
$$;
revoke execute on function public.run_total(uuid) from public, anon;
grant  execute on function public.run_total(uuid) to authenticated;

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
  if v.run_id is not null then
    raise exception 'Questa voce fa già parte di una spesa registrata';
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

create or replace function public.register_shopping_run(
  p_list_id  uuid,
  p_shop     text,
  p_run_date date,
  p_paid_by  public.payment_source,
  p_prices   jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_list public.shopping_lists%rowtype;
  v_run  uuid;
  v_p    jsonb;
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

  insert into public.shopping_runs (org_id, list_id, shop, run_date, paid_by, paid_by_user, created_by)
  values (v_list.org_id, p_list_id, nullif(trim(p_shop), ''), coalesce(p_run_date, current_date), p_paid_by,
          case when p_paid_by = 'volontario' then (select auth.uid()) end, (select auth.uid()))
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

revoke execute on function public.register_shopping_run(uuid, text, date, public.payment_source, jsonb) from public, anon;
grant  execute on function public.register_shopping_run(uuid, text, date, public.payment_source, jsonb) to authenticated;

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
      insert into public.shopping_lists (org_id, name, location, created_by)
      values (v_list.org_id, v_list.name || ' (da finire)', v_list.location, (select auth.uid()))
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
  (count(i.id) filter (where i.checked and i.run_id is null))::int                                      as unregistered_count
from public.shopping_lists l
left join public.shopping_list_items i on i.list_id = l.id
group by l.id;
