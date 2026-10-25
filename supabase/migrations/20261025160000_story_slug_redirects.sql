-- GolpoNeer: story slug redirects.
--
-- Mirrors username_redirects (V4-07), except permanent (no expiry): a
-- story URL is a bookmark/share target, and expiry would re-break it.
-- Slug reuse stays safe because pages check the live story first and
-- only consult this table on a miss.
--
--  * public.story_slug_redirects — (author, old slug) -> story, so an old
--    story URL forwards to the story's current slug after a rename.
--  * public.record_story_slug_redirect() — trigger function that records
--    every slug change automatically, so no save path can forget it.
--    Latest owner of a slug wins (re-take/overwrite), matching
--    change_username's refresh behaviour.

create table if not exists public.story_slug_redirects (
  author_id  uuid not null references public.profiles (id) on delete cascade,
  old_slug   text not null,
  story_id   uuid not null references public.stories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (author_id, old_slug)
);

alter table public.story_slug_redirects enable row level security;

-- Redirects are a public lookup service (old links must resolve for
-- signed-out visitors too). Writes happen only inside the trigger below.
-- Reads are restricted to rows whose target story the caller may see:
-- public stories for everyone, drafts only for their author. Without this,
-- the public policy would leak renamed drafts' old slugs, ids and edit
-- timestamps to anonymous callers (Argon finding, 2026-10-25).
drop policy if exists story_slug_redirects_public_read on public.story_slug_redirects;
create policy story_slug_redirects_public_read on public.story_slug_redirects
  for select using (
    exists (
      select 1 from public.stories s
      where s.id = story_slug_redirects.story_id
        and (public.story_is_public(s) or s.author_id = auth.uid())
    )
  );

-- Whenever a story claims new.slug (insert or slug update), delete any
-- redirect for that slug first: otherwise a re-taken slug keeps pointing
-- at its previous owner, and after that owner is deleted/unpublished the
-- old URL would misdirect to the wrong story instead of Not Found
-- (Argon finding, 2026-10-25).
create or replace function public.record_story_slug_redirect()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  delete from public.story_slug_redirects
  where author_id = new.author_id
    and old_slug = new.slug;

  if tg_op = 'UPDATE' and old.slug is distinct from new.slug then
    insert into public.story_slug_redirects (author_id, old_slug, story_id)
    values (old.author_id, old.slug, new.id)
    on conflict (author_id, old_slug) do update
      set story_id = excluded.story_id,
          created_at = excluded.created_at;
  end if;

  return new;
end $$;

drop trigger if exists stories_slug_redirect_recorder on public.stories;
create trigger stories_slug_redirect_recorder
  after insert or update of slug on public.stories
  for each row
  execute function public.record_story_slug_redirect();
