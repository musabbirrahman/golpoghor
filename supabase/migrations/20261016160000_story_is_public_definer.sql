-- GolpoGhor: fix infinite RLS recursion in story_is_public().
--
-- The visibility change made story_is_public() read public.chapters, but the
-- function is called from RLS policies on BOTH stories and chapters:
--   stories_public_read -> story_is_public() -> chapters (RLS applies)
--     -> chapters_public_read -> story_is_public() -> ...
-- Every public read looped until "stack depth limit exceeded" locally and
-- "canceling statement due to statement timeout" (57014) on Supabase, which
-- also rolled back story publishes. Verified 2026-10-16.
--
-- Fix: SECURITY DEFINER (like is_admin()/is_moderator()). The chapters lookup
-- inside then runs as the function owner with RLS bypassed, breaking the loop.
-- Safe: it only returns a boolean visibility verdict, and a story is public
-- iff it has >= 1 published chapter no matter who asks.

create or replace function public.story_is_public(s public.stories)
returns boolean language sql stable security definer as $$
  select s.status in ('ongoing', 'complete')
    and exists (
      select 1 from public.chapters c
      where c.story_id = s.id and c.status = 'published'
    );
$$;
