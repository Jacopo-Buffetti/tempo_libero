with org as (
  insert into public.organizations (name)
  values ('Pro Loco [NOME]')
  returning id
), me as (
  insert into public.members (org_id, user_id, role, display_name)
  select org.id, u.id, 'admin', 'Admin'
  from org, auth.users u
  where u.email = 'tua@email.it'
  returning org_id
)
insert into public.items (org_id, name, location, kind, unit, qty, min_qty, broken_qty)
select me.org_id, v.name, v.location::public.item_location, v.kind::public.item_kind,
       v.unit, v.qty, v.min_qty, v.broken_qty
from me, (values
  ('Tavoli',              'magazzino', 'attrezzatura', 'pezzi',     40,  null, 0),
  ('Panche',              'magazzino', 'attrezzatura', 'pezzi',     80,  null, 0),
  ('Sedie',               'magazzino', 'attrezzatura', 'pezzi',     312, null, 8),
  ('Carta igienica',      'magazzino', 'consumabile',  'rotoli',    18,  24,   0),
  ('Carta assorbente',    'cucina',    'consumabile',  'rotoli',    10,  6,    0),
  ('Pentoloni',           'cucina',    'attrezzatura', 'pezzi',     6,   null, 0),
  ('Gin',                 'bar',       'consumabile',  'bottiglie', 2,   4,    0),
  ('Bicchieri di plastica','bar',      'consumabile',  'pezzi',     150, 100,  0)
) as v(name, location, kind, unit, qty, min_qty, broken_qty);
