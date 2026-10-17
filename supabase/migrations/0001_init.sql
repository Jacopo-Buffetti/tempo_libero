-- =========================================================
-- Pro Loco — schema iniziale: associazioni, membri, inventario
-- =========================================================

create type public.member_role   as enum ('admin', 'volontario');
create type public.item_location as enum ('magazzino', 'cucina', 'bar');
create type public.item_kind     as enum ('consumabile', 'attrezzatura');

-- Associazioni -------------------------------------------------------
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Chi fa parte di quale associazione, e con che ruolo -----------------
create table public.members (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.member_role not null default 'volontario',
  display_name text,
  created_at   timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index members_user_idx on public.members(user_id);

-- Oggetti dell'inventario --------------------------------------------
create table public.items (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  location   public.item_location not null,
  kind       public.item_kind not null,
  unit       text not null default 'pezzi',
  qty        integer not null default 0 check (qty >= 0),
  min_qty    integer check (min_qty >= 0),   -- solo consumabili: sotto questa soglia va in spesa
  broken_qty integer not null default 0 check (broken_qty >= 0),
  photo_path text,
  barcode    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broken_not_more_than_qty check (broken_qty <= qty)
);
create index items_org_location_idx on public.items(org_id, location, name);

-- Storico di ogni variazione di quantità -----------------------------
create table public.item_movements (
  id         bigint generated always as identity primary key,
  item_id    uuid not null references public.items(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  delta      integer not null check (delta <> 0),
  reason     text,
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index item_movements_item_idx on public.item_movements(item_id, created_at desc);

-- =========================================================
-- Funzioni di supporto per i permessi
-- =========================================================
create or replace function public.is_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where org_id = p_org and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_admin(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where org_id = p_org and user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- =========================================================
-- Variazione atomica della quantità (+ storico)
-- =========================================================
create or replace function public.adjust_quantity(
  p_item_id uuid,
  p_delta   integer,
  p_reason  text default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_qty integer;
begin
  if p_delta = 0 then
    raise exception 'La variazione non può essere zero';
  end if;

  select org_id into v_org from public.items where id = p_item_id;
  if v_org is null or not public.is_member(v_org) then
    raise exception 'Oggetto non trovato';
  end if;

  -- l'aggiornamento avviene solo se la quantità resta valida
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

revoke execute on function public.adjust_quantity(uuid, integer, text) from public, anon;
grant  execute on function public.adjust_quantity(uuid, integer, text) to authenticated;

-- =========================================================
-- Permessi per la Data API
-- (servono perché "Automatically expose new tables" è disattivato:
--  nessuna tabella è raggiungibile dall'app finché non lo diciamo noi)
-- =========================================================
grant usage on schema public to authenticated;

grant select, update                 on public.organizations  to authenticated;
grant select, insert, update, delete on public.members        to authenticated;
grant select, insert, update, delete on public.items          to authenticated;
grant select                         on public.item_movements to authenticated;

-- Le funzioni usate nelle policy devono essere eseguibili da chi è collegato
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.is_admin(uuid)  from public, anon;
grant  execute on function public.is_member(uuid) to authenticated;
grant  execute on function public.is_admin(uuid)  to authenticated;

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.organizations  enable row level security;
alter table public.members        enable row level security;
alter table public.items          enable row level security;
alter table public.item_movements enable row level security;

-- Associazioni: le vedi solo se ne fai parte; le modifica un admin
create policy "org: lettura membri" on public.organizations
  for select to authenticated using (public.is_member(id));
create policy "org: modifica admin" on public.organizations
  for update to authenticated using (public.is_admin(id));

-- Membri: tutti vedono i colleghi, solo gli admin gestiscono
create policy "members: lettura" on public.members
  for select to authenticated using (public.is_member(org_id));
create policy "members: inserimento admin" on public.members
  for insert to authenticated with check (public.is_admin(org_id));
create policy "members: modifica admin" on public.members
  for update to authenticated using (public.is_admin(org_id));
create policy "members: rimozione admin" on public.members
  for delete to authenticated using (public.is_admin(org_id));

-- Oggetti: i membri leggono, creano e modificano; solo gli admin cancellano
create policy "items: lettura" on public.items
  for select to authenticated using (public.is_member(org_id));
create policy "items: inserimento" on public.items
  for insert to authenticated with check (public.is_member(org_id));
create policy "items: modifica" on public.items
  for update to authenticated
  using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "items: rimozione admin" on public.items
  for delete to authenticated using (public.is_admin(org_id));

-- Movimenti: si leggono e basta (si scrivono solo tramite adjust_quantity)
create policy "movements: lettura" on public.item_movements
  for select to authenticated using (public.is_member(org_id));
