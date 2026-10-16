-- GolpoGhor: writer appeals + in-app notifications.
--
-- New tables: appeals (writers contest hidden content; moderators decide),
-- notifications (in-app inbox; titles/bodies are rendered client-side from
-- type + data so they follow the reader's interface language).
-- Also adds profiles.notification_prefs (jsonb toggle map).
--
-- NOTE: this migration has been structurally validated only — it has NOT been
-- executed against a live Postgres/Supabase project in this environment.

-- ----------------------------------------------------------------- appeals
-- A writer asks for a second look at hidden content. One pending appeal per
-- target (partial unique index); history is preserved forever (no deletes).
create table public.appeals (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete cascade,
  target_type   text not null check (target_type in ('story', 'chapter')),
  target_id     uuid not null,
  reason        text not null check (char_length(reason) between 1 and 1000),
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'declined')),
  decision_note text not null default '',
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index appeals_queue_idx on public.appeals (status, created_at)
  where status = 'pending';
create index appeals_target_idx on public.appeals (target_type, target_id);
create unique index appeals_one_pending_per_target
  on public.appeals (target_type, target_id)
  where status = 'pending';

-- ----------------------------------------------------------- notifications
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in (
                 'new_chapter', 'report_received', 'report_update',
                 'content_hidden', 'content_restored',
                 'appeal_submitted', 'appeal_decision'
               )),
  data       jsonb not null default '{}',
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id)
  where is_read = false;

-- ------------------------------------------------------- preference column
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}';

-- ================================================================== RLS ==
alter table public.appeals      enable row level security;
alter table public.notifications enable row level security;

-- ----------------------------------------------------------------- appeals
-- Writers: file an appeal only for their OWN currently-hidden content, and
-- read their own appeals.
create policy appeals_author_insert on public.appeals
  for insert with check (
    auth.uid() = author_id
    and status = 'pending'
    and (
      (target_type = 'story' and exists (
        select 1 from public.stories s
        where s.id = target_id and s.author_id = auth.uid() and s.status = 'hidden'
      ))
      or (target_type = 'chapter' and exists (
        select 1 from public.chapters c
          join public.stories s on s.id = c.story_id
        where c.id = target_id and s.author_id = auth.uid() and c.status = 'hidden'
      ))
    )
  );

create policy appeals_author_read on public.appeals
  for select using (auth.uid() = author_id);

-- Moderators: read every appeal and record decisions. Approving an appeal
-- does NOT restore content by itself — restoring is a separate audited action.
create policy appeals_moderator_read on public.appeals
  for select using (public.is_moderator());

create policy appeals_moderator_decide on public.appeals
  for update using (public.is_moderator())
  with check (
    public.is_moderator()
    and status in ('approved', 'declined')
    and decided_by = auth.uid()
  );

-- ----------------------------------------------------------- notifications
-- Owners: read their own inbox and flip read state.
create policy notifications_owner_read on public.notifications
  for select using (auth.uid() = user_id);

create policy notifications_owner_update on public.notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- MVP tradeoff: any signed-in user may insert a notification row. The app
-- only inserts notifications as side effects of legitimate actions
-- (chapter published, report filed/resolved, content hidden/restored,
-- appeal submitted/decided), and bodies are rendered from fixed templates.
-- Production hardening: move notification creation into SECURITY DEFINER
-- triggers so clients cannot forge rows at all.
create policy notifications_insert on public.notifications
  for insert with check (auth.uid() is not null);
