create unique index items_unique_name_per_location
  on public.items (org_id, location, lower(trim(name)));
