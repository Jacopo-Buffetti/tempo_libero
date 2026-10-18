alter table public.clients
  add column birth_place text,
  add column birth_date  date,
  add column tax_code    text,
  add column email       text;

create table public.rental_contracts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  rental_id  uuid not null unique references public.rentals(id) on delete cascade,
  year       integer not null,
  seq        integer not null,
  contract   jsonb not null default '{}'::jsonb,
  handover   jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, year, seq)
);

grant select on public.rental_contracts to authenticated;
grant update (contract, handover, updated_at) on public.rental_contracts to authenticated;
alter table public.rental_contracts enable row level security;
create policy "contracts: lettura" on public.rental_contracts
  for select to authenticated using (public.is_member(org_id));
create policy "contracts: modifica" on public.rental_contracts
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));

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
  if not found or not public.is_member(v_rental.org_id) then
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

revoke execute on function public.ensure_rental_contract(uuid) from public, anon;
grant  execute on function public.ensure_rental_contract(uuid) to authenticated;
