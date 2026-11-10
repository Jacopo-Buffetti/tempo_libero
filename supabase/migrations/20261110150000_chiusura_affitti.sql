-- Chiusura controllata delle pratiche di affitto (sala e Parco Granaccioli).
alter table public.rentals add column if not exists closed_at timestamptz;

-- Una volta chiusa la pratica, nessun consigliere può ricaricare documenti d'identità.
drop policy if exists "rental documents: inserimento" on public.rental_documents;
create policy "rental documents: inserimento" on public.rental_documents
  for insert to authenticated with check (
    public.is_consigliere(org_id)
    and exists (
      select 1 from public.rentals r
      where r.id = rental_id and r.org_id = rental_documents.org_id and r.closed_at is null
    )
  );

-- Questa RPC esegue controllo ruolo, data e cancellazione dei metadati in transazione.
-- I file Storage devono essere eliminati dal client PRIMA della chiamata.
create or replace function public.close_rental_and_purge_documents(p_rental_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare r public.rentals%rowtype;
begin
  select * into r from public.rentals where id = p_rental_id for update;
  if not found then raise exception 'Affitto non trovato'; end if;
  if not public.is_consigliere(r.org_id) then raise exception 'Non autorizzato'; end if;
  if r.closed_at is not null then return true; end if;
  if (r.end_date + coalesce(r.end_time, time '23:59:59')) > (now() at time zone 'Europe/Rome') then
    raise exception 'La concessione non è ancora terminata';
  end if;
  delete from public.rental_documents where rental_id = p_rental_id;
  update public.rentals set closed_at = now() where id = p_rental_id;
  return true;
end;
$$;
revoke all on function public.close_rental_and_purge_documents(uuid) from public, anon;
grant execute on function public.close_rental_and_purge_documents(uuid) to authenticated;
