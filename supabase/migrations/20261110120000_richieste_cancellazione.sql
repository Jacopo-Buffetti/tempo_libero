-- Le richieste vengono gestite solo da una Edge Function con service role.
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_email text not null,
  display_name text,
  status text not null default 'pending' check (status in ('pending', 'notified')),
  requested_at timestamptz not null default now(),
  notified_at timestamptz
);
create index account_deletion_requests_user_idx
  on public.account_deletion_requests (user_id, requested_at desc);
alter table public.account_deletion_requests enable row level security;
-- Nessuna policy client: accesso consentito solo alla service role.
