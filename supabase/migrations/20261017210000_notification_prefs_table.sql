-- Notification preferences move to a dedicated owner-only table.
-- Previously they lived as a jsonb column on public.profiles, whose rows
-- are publicly readable — exposing every user's notification toggles.
-- The new table is strictly owner-only via RLS.

create table public.notification_prefs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  prefs      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy notification_prefs_owner_all on public.notification_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Migrate existing preferences (idempotent).
insert into public.notification_prefs (user_id, prefs)
select id, notification_prefs
from public.profiles
where notification_prefs is not null
on conflict (user_id) do update set
  prefs = excluded.prefs,
  updated_at = now();

-- Remove the publicly-readable column.
alter table public.profiles drop column if exists notification_prefs;
