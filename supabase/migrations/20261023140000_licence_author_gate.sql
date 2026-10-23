-- Section C fix round: licence authorization.
--
-- A licence row must only ever count when its author IS the story's author.
-- Two changes, plus a guard that runs first:
--   1) If any unwithdrawn licence row's author is not its story's author,
--      the migration refuses to apply at all. The script runs in a single
--      implicit transaction, so raising here rolls back every change below.
--      A mismatch must be inspected and resolved by hand first — never
--      silently deleted or rewritten by this migration.
--   2) The licence insert policy gains a story-authorship check, so only
--      the story's author can accept its licence (previously any signed-in
--      user could insert a covering row for any story).
--   3) story_keepsake_covered() counts a row only when its author matches
--      the story's author. This affects new licence-basis publications only:
--      keepsakes_public() does not re-check licence basis for cards that are
--      already public, and public-domain cards never consult this function.
-- No existing rows are modified by this migration.

do $$
begin
  if exists (
    select 1
    from public.story_keepsake_licence l
    join public.stories s on s.id = l.story_id
    where l.withdrawn_at is null
      and l.author_id <> s.author_id
  ) then
    raise exception 'LICENCE_MISMATCH: unwithdrawn licence row(s) exist whose author is not the story author. Inspect story_keepsake_licence before applying.';
  end if;
  if exists (
    select 1
    from public.story_keepsake_licence l
    join public.stories s on s.id = l.story_id
    where l.withdrawn_at is not null
      and l.author_id <> s.author_id
  ) then
    raise notice 'LICENCE_NOTE: withdrawn licence row(s) exist whose author is not the story author (harmless: withdrawn rows never count toward coverage).';
  end if;
end $$;

drop policy if exists story_keepsake_licence_author_insert on public.story_keepsake_licence;
create policy story_keepsake_licence_author_insert on public.story_keepsake_licence
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.stories s
      where s.id = story_id and s.author_id = auth.uid()
    )
  );

create or replace function public.story_keepsake_covered(p_story_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.story_keepsake_licence l
    join public.stories s on s.id = l.story_id
    where l.story_id = p_story_id
      and l.withdrawn_at is null
      and l.author_id = s.author_id
  );
$$;
