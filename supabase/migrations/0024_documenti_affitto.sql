create table public.rental_documents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  rental_id   uuid not null references public.rentals(id) on delete cascade,
  side        text not null check (side in ('fronte', 'retro')),
  path        text not null,
  size_bytes  integer check (size_bytes is null or size_bytes >= 0),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (rental_id, side)
);
create index rental_documents_rental_idx on public.rental_documents(rental_id);

grant select, insert, delete on public.rental_documents to authenticated;
alter table public.rental_documents enable row level security;

create policy "rental documents: lettura" on public.rental_documents
  for select to authenticated using (public.is_consigliere(org_id));
create policy "rental documents: inserimento" on public.rental_documents
  for insert to authenticated
  with check (
    public.is_consigliere(org_id)
    and exists (select 1 from public.rentals r where r.id = rental_id and r.org_id = rental_documents.org_id)
  );
create policy "rental documents: rimozione" on public.rental_documents
  for delete to authenticated using (public.is_consigliere(org_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documenti', 'documenti', false, 307200, array['image/jpeg'])
on conflict (id) do nothing;

create policy "documenti: lettura consiglieri" on storage.objects
  for select to authenticated
  using (bucket_id = 'documenti' and public.is_consigliere(((storage.foldername(name))[1])::uuid));
create policy "documenti: caricamento consiglieri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documenti' and public.is_consigliere(((storage.foldername(name))[1])::uuid));
create policy "documenti: rimozione consiglieri" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documenti' and public.is_consigliere(((storage.foldername(name))[1])::uuid));
