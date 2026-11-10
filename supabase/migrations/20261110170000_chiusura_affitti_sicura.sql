-- Chiusura a due fasi: blocco preventivo e finalizzazione dopo cancellazione Storage.
-- La precedente RPC diretta non deve più poter essere invocata dall'app.
revoke execute on function public.close_rental_and_purge_documents(uuid) from authenticated;

alter table public.rentals add column if not exists closing_at timestamptz;

-- Durante la chiusura blocchiamo anche i caricamenti diretti nel bucket.
drop policy if exists "documenti: caricamento consiglieri" on storage.objects;
create policy "documenti: caricamento consiglieri" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'documenti'
    and public.is_consigliere(((storage.foldername(name))[1])::uuid)
    and exists (
      select 1 from public.rentals r
      where r.org_id = ((storage.foldername(name))[1])::uuid
        and r.id = ((storage.foldername(name))[2])::uuid
        and r.closed_at is null and r.closing_at is null
    )
  );

-- Blocca anche l'inserimento di metadati se la chiusura è già iniziata.
drop policy if exists "rental documents: inserimento" on public.rental_documents;
create policy "rental documents: inserimento" on public.rental_documents
  for insert to authenticated with check (
    public.is_consigliere(org_id)
    and exists (
      select 1 from public.rentals r
      where r.id = rental_id and r.org_id = rental_documents.org_id
        and r.closed_at is null and r.closing_at is null
    )
  );

create or replace function public.begin_rental_closure(p_rental_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r public.rentals%rowtype;
  paths jsonb;
begin
  select * into r from public.rentals where id = p_rental_id for update;
  if not found then raise exception 'Affitto non trovato'; end if;
  if not public.is_consigliere(r.org_id) then raise exception 'Non autorizzato'; end if;
  if r.closed_at is not null then
    return jsonb_build_object('already_closed', true, 'org_id', r.org_id, 'paths', '[]'::jsonb);
  end if;
  if (r.end_date + coalesce(r.end_time, time '23:59:59')) > (now() at time zone 'Europe/Rome') then
    raise exception 'La concessione non è ancora terminata';
  end if;
  update public.rentals set closing_at = coalesce(closing_at, now()) where id = p_rental_id;
  select coalesce(jsonb_agg(path), '[]'::jsonb) into paths
    from public.rental_documents where rental_id = p_rental_id;
  return jsonb_build_object('already_closed', false, 'org_id', r.org_id, 'paths', paths);
end;
$$;

create or replace function public.finish_rental_closure(p_rental_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare r public.rentals%rowtype;
begin
  select * into r from public.rentals where id = p_rental_id for update;
  if not found then raise exception 'Affitto non trovato'; end if;
  if r.closed_at is not null then return true; end if;
  if r.closing_at is null then raise exception 'Chiusura non avviata'; end if;
  delete from public.rental_documents where rental_id = p_rental_id;
  update public.rentals set closed_at = now(), closing_at = null where id = p_rental_id;
  return true;
end;
$$;

revoke all on function public.begin_rental_closure(uuid) from public, anon;
revoke all on function public.finish_rental_closure(uuid) from public, anon;
grant execute on function public.begin_rental_closure(uuid) to authenticated;
revoke execute on function public.finish_rental_closure(uuid) from authenticated;
grant execute on function public.finish_rental_closure(uuid) to service_role;
