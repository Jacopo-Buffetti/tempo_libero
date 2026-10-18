create table public.events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  starts_on   date not null,
  start_time  time,
  place       text,
  notes       text,
  poster_path text,
  copied_from uuid references public.events(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index events_org_date_idx on public.events(org_id, starts_on desc);

create table public.menu_dishes (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  section     text not null
              check (section in ('antipasti', 'primi', 'secondi', 'contorni', 'dolci', 'bevande')),
  name        text not null check (length(trim(name)) > 0),
  description text,
  price_cents integer check (price_cents >= 0),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index menu_dishes_event_idx on public.menu_dishes(event_id, section, position);

create or replace function public.create_event(
  p_org_id     uuid,
  p_name       text,
  p_starts_on  date,
  p_start_time time default null,
  p_place      text default null,
  p_copy_from  uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_event uuid;
begin
  if not public.is_member(p_org_id) then
    raise exception 'Non autorizzato';
  end if;

  insert into public.events (org_id, name, starts_on, start_time, place, copied_from, created_by)
  values (p_org_id, trim(p_name), p_starts_on, p_start_time, nullif(trim(p_place), ''),
          p_copy_from, (select auth.uid()))
  returning id into v_event;

  if p_copy_from is not null then
    insert into public.menu_dishes (event_id, org_id, section, name, description, price_cents, position)
    select v_event, p_org_id, d.section, d.name, d.description, d.price_cents, d.position
      from public.menu_dishes d
     where d.event_id = p_copy_from and d.org_id = p_org_id;
  end if;

  return v_event;
end;
$$;

revoke execute on function public.create_event(uuid, text, date, time, text, uuid) from public, anon;
grant  execute on function public.create_event(uuid, text, date, time, text, uuid) to authenticated;

grant select, update, delete         on public.events      to authenticated;
grant select, insert, update, delete on public.menu_dishes to authenticated;

alter table public.events      enable row level security;
alter table public.menu_dishes enable row level security;

create policy "events: lettura" on public.events
  for select to authenticated using (public.is_member(org_id));
create policy "events: modifica" on public.events
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "events: rimozione" on public.events
  for delete to authenticated
  using (public.is_admin(org_id) or created_by = (select auth.uid()));

create policy "dishes: lettura" on public.menu_dishes
  for select to authenticated using (public.is_member(org_id));
create policy "dishes: inserimento" on public.menu_dishes
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and exists (select 1 from public.events e where e.id = event_id and e.org_id = menu_dishes.org_id)
  );
create policy "dishes: modifica" on public.menu_dishes
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "dishes: rimozione" on public.menu_dishes
  for delete to authenticated using (public.is_member(org_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('locandine', 'locandine', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "locandine: lettura membri" on storage.objects
  for select to authenticated
  using (bucket_id = 'locandine' and public.is_member(((storage.foldername(name))[1])::uuid));

create policy "locandine: caricamento membri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'locandine' and public.is_member(((storage.foldername(name))[1])::uuid));

create policy "locandine: rimozione membri" on storage.objects
  for delete to authenticated
  using (bucket_id = 'locandine' and public.is_member(((storage.foldername(name))[1])::uuid));
