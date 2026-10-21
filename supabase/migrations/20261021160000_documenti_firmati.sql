create table public.rental_signed_files (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  rental_id   uuid not null references public.rentals(id) on delete cascade,
  kind        text not null check (kind in ('contratto', 'verbale')),
  path        text not null,
  mime        text not null check (mime in ('image/jpeg', 'application/pdf')),
  size_bytes  integer check (size_bytes is null or size_bytes >= 0),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index rental_signed_files_rental_idx on public.rental_signed_files(rental_id, kind, created_at);

grant select, insert, delete on public.rental_signed_files to authenticated;
alter table public.rental_signed_files enable row level security;

create policy "rental signed files: lettura" on public.rental_signed_files
  for select to authenticated using (public.is_consigliere(org_id));
create policy "rental signed files: inserimento" on public.rental_signed_files
  for insert to authenticated
  with check (
    public.is_consigliere(org_id)
    and exists (select 1 from public.rentals r where r.id = rental_id and r.org_id = rental_signed_files.org_id)
  );
create policy "rental signed files: rimozione" on public.rental_signed_files
  for delete to authenticated using (public.is_consigliere(org_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmati', 'firmati', false, 10485760, array['image/jpeg', 'application/pdf'])
on conflict (id) do nothing;

create policy "firmati: lettura consiglieri" on storage.objects
  for select to authenticated
  using (bucket_id = 'firmati' and public.is_consigliere(((storage.foldername(name))[1])::uuid));
create policy "firmati: caricamento consiglieri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'firmati' and public.is_consigliere(((storage.foldername(name))[1])::uuid));
create policy "firmati: rimozione consiglieri" on storage.objects
  for delete to authenticated
  using (bucket_id = 'firmati' and public.is_consigliere(((storage.foldername(name))[1])::uuid));
