-- =========================================================
-- Riparazioni: pezzi che passano da "disponibili" a "da riparare" e ritorno
-- =========================================================

-- 1. "Da riparare" esiste solo per l'attrezzatura, mai per i consumabili
update public.items set broken_qty = 0 where kind = 'consumabile' and broken_qty <> 0;

alter table public.items
  add constraint broken_only_for_equipment
  check (kind = 'attrezzatura' or broken_qty = 0);

-- 2. Lo storico registra anche i passaggi da e verso "da riparare"
alter table public.item_movements
  add column broken_delta integer not null default 0;

alter table public.item_movements
  drop constraint item_movements_delta_check;

alter table public.item_movements
  add constraint item_movements_has_change
  check (delta <> 0 or broken_delta <> 0);

-- 3. Sposta pezzi tra disponibili e da riparare, in modo atomico
--    p_delta positivo = si rompono, negativo = sono stati riparati
create or replace function public.adjust_broken(
  p_item_id uuid,
  p_delta   integer,
  p_reason  text default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_org    uuid;
  v_kind   public.item_kind;
  v_broken integer;
begin
  if p_delta = 0 then
    raise exception 'La variazione non può essere zero';
  end if;

  select org_id, kind into v_org, v_kind from public.items where id = p_item_id;
  if v_org is null or not public.is_member(v_org) then
    raise exception 'Oggetto non trovato';
  end if;
  if v_kind <> 'attrezzatura' then
    raise exception 'Solo l''attrezzatura può essere da riparare';
  end if;

  update public.items
     set broken_qty = broken_qty + p_delta,
         updated_at = now()
   where id = p_item_id
     and broken_qty + p_delta between 0 and qty
  returning broken_qty into v_broken;

  if v_broken is null then
    raise exception 'Quantità non valida';
  end if;

  insert into public.item_movements (item_id, org_id, delta, broken_delta, reason, user_id)
  values (p_item_id, v_org, 0, p_delta, p_reason, (select auth.uid()));

  return v_broken;
end;
$$;

revoke execute on function public.adjust_broken(uuid, integer, text) from public, anon;
grant  execute on function public.adjust_broken(uuid, integer, text) to authenticated;
