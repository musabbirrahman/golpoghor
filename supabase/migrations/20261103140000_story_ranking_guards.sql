-- ============================================================
-- Story ranking-column guards (audit follow-up, 2026-11-03)
--
-- Closes audit findings M1/M2/M3: a story's author could rewrite the
-- columns that order Discover, via direct PostgREST, and push their
-- story to the top of a sort:
--   M1  published_at       -> Discover "Newest" (default sort)
--   M2  popularity_score   -> ?sort=popular (param-only today)
--   M3  view_count         -> ?sort=most_viewed (param-only today)
--
-- Design: the guard must NEVER break a legitimate app flow.
--   * published_at is PINNED, never rejected. The app itself writes
--     published_at on publish, on "Mark as complete", and on
--     republication (updateStory sets it whenever status enters
--     ongoing/complete), so raising here could break completion.
--     Pinning keeps every update succeeding while neutralizing
--     rapid re-dating:
--       - old published_at IS NULL, or older than 7 days, and the
--         new value is not null -> force new.published_at := now()
--         (server time, never a client-supplied timestamp: the app
--         always sends now() anyway, so this loses nothing, and it
--         closes future-dating, back-dating, and NULL-reset bypasses
--         that trusting the client value would leave open)
--       - otherwise -> new.published_at := old.published_at
--         (this also blocks resetting a published story's date to
--         NULL to dodge the cooldown)
--     A story can therefore be re-dated at most once per 7 days,
--     and publish-then-complete within a week keeps the publish
--     date (the story is still recent, so nothing is lost).
--     On INSERT, any non-null published_at is forced to now(),
--     so a newly inserted story cannot be back-dated past the
--     7-day window either.
--   * popularity_score / view_count are REJECTED for non-exempt
--     callers. The app never writes these columns directly; the
--     only legitimate writers are SECURITY DEFINER functions
--     (record_story_view, refresh_story_popularity) which run as
--     postgres and are exempt below. A rejection here therefore
--     cannot break any app flow -- it only fires on deliberate
--     direct API writes.
--
-- Exemptions match the existing guards (pd_verified, moderator
-- columns): postgres / service_role (migrations, definer
-- functions, SQL-editor backfills) and admins.
-- This is a plain trigger function (NOT security definer): a
-- definer guard would see current_user = postgres and exempt
-- everyone, defeating the guard entirely.
-- ============================================================

create or replace function public.stories_ranking_columns_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;

  -- published_at: pin rapid re-dating, never reject the update.
  if TG_OP = 'UPDATE'
     and new.published_at is distinct from old.published_at
  then
    if new.published_at is not null
       and (old.published_at is null
            or old.published_at <= now() - interval '7 days')
    then
      -- First publication or genuine completion/republication of
      -- an older story: always stamp server now(), so callers
      -- cannot future-date, back-date, or NULL-reset (Argon
      -- checkup 2026-11-03: trusting the client value left those
      -- holes open).
      new.published_at := now();
    else
      new.published_at := old.published_at;
    end if;
  end if;

  if TG_OP = 'INSERT'
     and new.published_at is not null
  then
    -- A brand-new story cannot be back-dated past the 7-day window
    -- or future-dated: any supplied timestamp becomes now().
    new.published_at := now();
  end if;

  -- Ranking scores: only the DB-side view system may write these.
  if TG_OP = 'UPDATE'
     and new.popularity_score is distinct from old.popularity_score
  then
    raise exception 'RANKING_GUARD: popularity_score is computed by the view system and cannot be set directly.';
  end if;
  if TG_OP = 'UPDATE'
     and new.view_count is distinct from old.view_count
  then
    raise exception 'RANKING_GUARD: view_count is computed by the view system and cannot be set directly.';
  end if;
  if TG_OP = 'INSERT'
     and (new.popularity_score is distinct from 0
          or new.view_count is distinct from 0)
  then
    raise exception 'RANKING_GUARD: a new story starts with popularity_score 0 and view_count 0.';
  end if;

  return new;
end $$;

drop trigger if exists stories_ranking_guard on public.stories;
create trigger stories_ranking_guard before insert or update on public.stories
  for each row execute function public.stories_ranking_columns_guard();
