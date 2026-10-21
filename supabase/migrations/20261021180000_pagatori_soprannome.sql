create or replace function public.payer_options(p_org uuid)
returns table (kind text, id uuid, name text, user_id uuid)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_org) then
    raise exception 'Non fai parte di questa associazione';
  end if;

  return query
  select o.kind, o.id, o.name, o.user_id
    from (
      select 'consigliere'::text as kind,
             sp.id,
             case when length(trim(coalesce(sp.nickname, ''))) > 0
                  then sp.name || ' (' || trim(sp.nickname) || ')'
                  else sp.name end as name,
             sp.user_id, 1 as grp, sp.position as pos
        from public.shift_people sp
       where sp.org_id = p_org and sp.active
      union all
      select 'membro', m.user_id, m.display_name, m.user_id, 2, 0
        from public.members m
       where m.org_id = p_org
         and length(trim(coalesce(m.display_name, ''))) > 0
         and not exists (select 1 from public.shift_people sp where sp.org_id = p_org and sp.user_id = m.user_id)
      union all
      select 'persona', p.id, p.name, null::uuid, 3, 0
        from public.payers p
       where p.org_id = p_org
    ) o
   order by o.grp, o.pos, lower(o.name);
end;
$$;
revoke execute on function public.payer_options(uuid) from public, anon;
grant  execute on function public.payer_options(uuid) to authenticated;
