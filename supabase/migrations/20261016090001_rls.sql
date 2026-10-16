-- GolpoGhor row-level security. Deny by default; narrow policies per table.
-- Auth identity comes from auth.uid(); role checks read public.profiles.

alter table public.profiles           enable row level security;
alter table public.stories            enable row level security;
alter table public.chapters           enable row level security;
alter table public.follows            enable row level security;
alter table public.reading_list       enable row level security;
alter table public.reading_progress   enable row level security;
alter table public.likes              enable row level security;
alter table public.comments           enable row level security;
alter table public.reports            enable row level security;
alter table public.moderation_events  enable row level security;

-- ------------------------------------------------------- role helpers
create or replace function public.is_moderator()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('moderator', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- A story is publicly readable when the author published it (not a draft/hidden).
create or replace function public.story_is_public(s public.stories)
returns boolean language sql stable as $$
  select s.status in ('ongoing', 'complete');
$$;

-- ---------------------------------------------------------------- profiles
-- Public: read safe public fields of every profile.
create policy profiles_public_read on public.profiles
  for select using (true);

-- Owner: create own row on signup, update own row (never someone else's).
-- New signups always start as readers; the first admin/moderator is
-- promoted via direct SQL (service role bypasses RLS) — see README.
create policy profiles_owner_insert on public.profiles
  for insert with check (auth.uid() = id and role = 'reader');

create policy profiles_owner_update on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Moderators/admins: update any profile (used for suspend/restore, bio cleanup).
create policy profiles_moderator_update on public.profiles
  for update using (public.is_moderator());

-- Nobody may escalate their own role: only admins can change `role`.
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins may change profile roles.';
  end if;
  return new;
end $$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- ----------------------------------------------------------------- stories
-- Public: read published stories only. Drafts/hidden are invisible.
create policy stories_public_read on public.stories
  for select using (public.story_is_public(stories));

-- Owner: full control over own stories.
create policy stories_owner_all on public.stories
  for all using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- Moderators: read everything (queue work), and update status/summary for hides.
create policy stories_moderator_read on public.stories
  for select using (public.is_moderator());

create policy stories_moderator_hide on public.stories
  for update using (public.is_moderator());

-- Ownership transfer guard: only the current owner may change author_id.
-- (Stops a moderator client from reassigning someone else's story.)
create or replace function public.prevent_ownership_transfer()
returns trigger language plpgsql as $$
begin
  if new.author_id is distinct from old.author_id and old.author_id <> auth.uid() then
    raise exception 'Only the story owner may transfer ownership.';
  end if;
  return new;
end $$;

drop trigger if exists stories_ownership_guard on public.stories;
create trigger stories_ownership_guard before update on public.stories
  for each row execute function public.prevent_ownership_transfer();

-- ---------------------------------------------------------------- chapters
-- Public: read published chapters of public stories only.
create policy chapters_public_read on public.chapters
  for select using (
    chapters.status = 'published'
    and exists (
      select 1 from public.stories s
      where s.id = chapters.story_id and public.story_is_public(s)
    )
  );

-- Owner: full control over chapters in own stories (ownership via parent story).
create policy chapters_owner_all on public.chapters
  for all using (
    exists (
      select 1 from public.stories s
      where s.id = chapters.story_id and s.author_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.stories s
      where s.id = chapters.story_id and s.author_id = auth.uid()
    )
  );

-- Moderators: read everything, and hide offending chapters.
create policy chapters_moderator_read on public.chapters
  for select using (public.is_moderator());

create policy chapters_moderator_hide on public.chapters
  for update using (public.is_moderator());

-- ----------------------------------------------------------------- follows
create policy follows_public_read on public.follows
  for select using (true);

create policy follows_owner_write on public.follows
  for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- ------------------------------------------------------------ reading list
create policy reading_list_owner_all on public.reading_list
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --------------------------------------------------------- reading progress
create policy reading_progress_owner_all on public.reading_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------------- likes
create policy likes_public_read on public.likes
  for select using (true);

create policy likes_owner_write on public.likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- comments
-- Public: read visible comments on public chapters.
create policy comments_public_read on public.comments
  for select using (
    comments.status = 'visible'
    and exists (
      select 1 from public.chapters c
        join public.stories s on s.id = c.story_id
      where c.id = comments.chapter_id
        and c.status = 'published'
        and public.story_is_public(s)
    )
  );

-- Signed-in users: comment on published chapters of public stories.
create policy comments_author_insert on public.comments
  for insert with check (
    auth.uid() = author_id
    and status = 'visible'
    and exists (
      select 1 from public.chapters c
        join public.stories s on s.id = c.story_id
      where c.id = chapter_id
        and c.status = 'published'
        and public.story_is_public(s)
    )
  );

-- Owner: edit own comment body (never status), delete own comment.
-- The status='visible' guard in USING stops an author un-hiding a comment
-- a moderator already hid.
create policy comments_owner_update on public.comments
  for update using (auth.uid() = author_id and status = 'visible')
  with check (auth.uid() = author_id and status = 'visible');

create policy comments_owner_delete on public.comments
  for delete using (auth.uid() = author_id);

-- Moderators: read all comments, hide/remove any, resolve via status.
create policy comments_moderator_read on public.comments
  for select using (public.is_moderator());

create policy comments_moderator_moderate on public.comments
  for update using (public.is_moderator());

create policy comments_moderator_delete on public.comments
  for delete using (public.is_moderator());

-- ----------------------------------------------------------------- reports
-- Reporters: file reports, read their own.
create policy reports_reporter_insert on public.reports
  for insert with check (auth.uid() = reporter_id and status = 'open');

create policy reports_reporter_read on public.reports
  for select using (auth.uid() = reporter_id);

-- Moderators: read the whole queue and resolve reports.
create policy reports_moderator_read on public.reports
  for select using (public.is_moderator());

create policy reports_moderator_update on public.reports
  for update using (public.is_moderator());

-- ------------------------------------------------------- moderation events
-- Append-only audit: moderators log actions; nobody edits or deletes.
create policy moderation_events_moderator_insert on public.moderation_events
  for insert with check (
    public.is_moderator() and auth.uid() = moderator_id
  );

create policy moderation_events_moderator_read on public.moderation_events
  for select using (public.is_moderator());
