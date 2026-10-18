create table public.shift_people (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  nickname   text,
  active     boolean not null default true,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index shift_people_org_idx on public.shift_people(org_id, position);

create table public.shifts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  shift_date date not null,
  person_id  uuid not null references public.shift_people(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (org_id, shift_date)
);
create index shifts_org_date_idx on public.shifts(org_id, shift_date);

create type public.rental_space as enum ('stanza', 'cramaccioli');

create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name  text,
  phone      text,
  address    text,
  notes      text,
  created_at timestamptz not null default now()
);
create index clients_org_idx on public.clients(org_id, last_name, first_name);

create table public.rentals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  space         public.rental_space not null,
  client_id     uuid not null references public.clients(id) on delete restrict,
  rent_date     date not null,
  start_time    time,
  end_time      time,
  price_cents   integer check (price_cents >= 0),
  deposit_cents integer check (deposit_cents >= 0),
  deposit_paid  boolean not null default false,
  balance_paid  boolean not null default false,
  notes         text,
  created_by    uuid references auth.users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index rentals_org_date_idx on public.rentals(org_id, rent_date);
create index rentals_client_idx on public.rentals(client_id, rent_date desc);

grant select, insert, update, delete on public.shift_people, public.shifts, public.clients, public.rentals to authenticated;

alter table public.shift_people enable row level security;
alter table public.shifts       enable row level security;
alter table public.clients      enable row level security;
alter table public.rentals      enable row level security;

create policy "shift people: lettura" on public.shift_people for select to authenticated using (public.is_member(org_id));
create policy "shift people: gestione admin" on public.shift_people for all to authenticated
  using (public.is_admin(org_id)) with check (public.is_admin(org_id));

create policy "shifts: lettura" on public.shifts for select to authenticated using (public.is_member(org_id));
create policy "shifts: inserimento" on public.shifts for insert to authenticated with check (public.is_member(org_id));
create policy "shifts: modifica" on public.shifts for update to authenticated
  using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "shifts: rimozione" on public.shifts for delete to authenticated using (public.is_member(org_id));

create policy "clients: lettura" on public.clients for select to authenticated using (public.is_member(org_id));
create policy "clients: inserimento" on public.clients for insert to authenticated with check (public.is_member(org_id));
create policy "clients: modifica" on public.clients for update to authenticated
  using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "clients: rimozione" on public.clients for delete to authenticated using (public.is_member(org_id));

create policy "rentals: lettura" on public.rentals for select to authenticated using (public.is_member(org_id));
create policy "rentals: inserimento" on public.rentals for insert to authenticated
  with check (
    public.is_member(org_id)
    and exists (select 1 from public.clients c where c.id = client_id and c.org_id = rentals.org_id)
  );
create policy "rentals: modifica" on public.rentals for update to authenticated
  using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "rentals: rimozione" on public.rentals for delete to authenticated using (public.is_member(org_id));

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
  if a.id is null or b.id is null or a.org_id <> b.org_id or not public.is_member(a.org_id) then
    raise exception 'Turni non trovati';
  end if;
  update public.shifts set person_id = b.person_id, updated_by = (select auth.uid()), updated_at = now() where id = a.id;
  update public.shifts set person_id = a.person_id, updated_by = (select auth.uid()), updated_at = now() where id = b.id;
end;
$$;

revoke execute on function public.swap_shifts(uuid, uuid) from public, anon;
grant  execute on function public.swap_shifts(uuid, uuid) to authenticated;

insert into public.shift_people (org_id, name, nickname, position)
select o.id, v.name, v.nickname, v.position
  from public.organizations o
 cross join (values
   ('Luciano', null, 1),
   ('Marco', null, 2),
   ('Alessandro', 'Biondo', 3),
   ('Alessandro', 'Nciuc', 4),
   ('Michele', null, 5),
   ('Giacomo', null, 6),
   ('Silvia', null, 7),
   ('Lorenzo', null, 8),
   ('Giorgio', null, 9),
   ('Marcello', null, 10),
   ('Filippo', null, 11)
 ) as v(name, nickname, position);
