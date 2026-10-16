-- GolpoGhor: a story is public only with at least one published chapter.
--
-- 1. story_is_public() now also requires a published chapter, so stories
--    with zero published chapters vanish from Discover, search, home
--    shelves, author profiles and chapter/comment reads — everywhere the
--    "public story" predicate is used (stories, chapters and comments RLS).
-- 2. A trigger blocks flipping a story into ongoing/complete when it has no
--    published chapter, so the rule cannot be bypassed by direct status
--    writes. The app's data layer raises a friendly error first; this is
--    the backstop.
--
-- NOTE: structurally validated only — NOT executed against live Postgres here.

create or replace function public.story_is_public(s public.stories)
returns boolean language sql stable as $$
  select s.status in ('ongoing', 'complete')
    and exists (
      select 1 from public.chapters c
      where c.story_id = s.id and c.status = 'published'
    );
$$;

create or replace function public.require_published_chapter()
returns trigger language plpgsql as $$
begin
  -- Only gate transitions *into* a public status; ordinary edits to an
  -- already-public story (title, summary, ...) must keep working.
  if new.status in ('ongoing', 'complete')
     and old.status not in ('ongoing', 'complete')
     and not exists (
       select 1 from public.chapters c
       where c.story_id = new.id and c.status = 'published'
     ) then
    raise exception 'Cannot publish a story with no published chapters.';
  end if;
  return new;
end $$;

drop trigger if exists stories_publish_gate on public.stories;
create trigger stories_publish_gate before update on public.stories
  for each row execute function public.require_published_chapter();
