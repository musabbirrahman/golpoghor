-- GolpoNeer view counting Phase 2: dwell tracking (Argon checkup: SAFE WITH CHANGES, fixes applied)
-- Argon verdict: SAFE WITH CHANGES (3 fixes, all applied below):
-- (1) dwell-implies-view insert now respects the Phase 1 50-chapter/day cap;
-- (2) storage cap uses ceil (not floor) so 1-4 word chapters can reach rt 1.0;
-- (3) client tracker must use Snapshot-and-Drain (see design doc §2).
-- Intended filename when approved: supabase/migrations/20261031160000_phase2_dwell.sql
-- Design: ~/workspace/your_files/GolpoNeer-ViewCounting-Phase2-Design-20261031.md
-- Counts and dwell data stay hidden (never displayed). No IP address is stored, ever.
-- RLS stays enabled with NO policies on view tables (function-only).
begin;

-- 1. dwell storage on chapter_views -----------------------------------------
alter table public.chapter_views add column active_seconds integer not null default 0;
-- validate-sql exemption: FUNCTION_ONLY:chapter_views (no direct policies by design)

-- 2. dwell recorder -----------------------------------------------------------
-- Same gates as record_chapter_view, plus per-call clamp and a per-chapter
-- per-day storage cap. Dwell implies a view (row created if missing) but
-- NEVER bumps stories.view_count — chapter views never did.
create function public.record_chapter_dwell(p_chapter_id uuid, p_anon_id uuid default null, p_seconds integer default 0)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_viewer uuid := auth.uid();
  v_key text;
  v_story uuid;
  v_chapter_status text;
  v_author uuid;
  v_status text;
  v_language text;
  v_words integer;
  v_expected double precision;
  v_cap integer;
  v_seconds integer;
  v_today date := (now() at time zone 'utc')::date;
  v_day_count integer;
  v_old integer;
  v_new integer;
begin
  if v_viewer is not null then
    v_key := 'u:' || v_viewer::text;
  elsif p_anon_id is not null then
    v_key := 'a:' || p_anon_id::text;
  else
    return false; -- no viewer at all
  end if;
  if p_seconds is null then
    return false;
  end if;
  -- Clamp per call: the client sends at most 30s per heartbeat; 60 allows
  -- timer drift and background throttling. 0 after clamping is a no-op.
  v_seconds := least(greatest(p_seconds, 0), 60);
  if v_seconds = 0 then
    return false;
  end if;
  select story_id, status, word_count into v_story, v_chapter_status, v_words
    from public.chapters where id = p_chapter_id;
  if not found then
    return false;
  end if;
  if v_chapter_status <> 'published' then
    return false; -- draft / hidden chapters never count
  end if;
  select author_id, status, language into v_author, v_status, v_language
    from public.stories where id = v_story;
  if not found then
    return false;
  end if;
  if v_viewer is not null and v_author = v_viewer then
    return false; -- authors don't count dwell on their own stories
  end if;
  if v_status not in ('ongoing', 'complete') then
    return false;
  end if;
  -- Expected seconds from the same constants as the client READING_WPM
  -- (en 220, bn 180). If those ever change, change both places together.
  if v_words is null or v_words <= 0 then
    return false; -- no expected time to measure against
  end if;
  v_expected := v_words::double precision / (case when v_language = 'bn' then 180 else 220 end) * 60;
  v_cap := ceil(1.5 * v_expected)::integer;
  if v_cap <= 0 then
    return false;
  end if;
  -- Serialize per viewer_key so concurrent heartbeats cannot race the cap.
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select active_seconds into v_old from public.chapter_views
    where chapter_id = p_chapter_id and viewer_key = v_key and viewed_on = v_today;
  if not found then
    -- Dwell implies a view (e.g. reading across UTC midnight), but must
    -- respect the Phase 1 daily cap of 50 chapter-view rows per viewer_key.
    select count(*) into v_day_count from public.chapter_views
      where viewer_key = v_key and viewed_on = v_today;
    if v_day_count >= 50 then
      return false;
    end if;
    insert into public.chapter_views (chapter_id, viewer_id, anon_id, viewed_on)
      values (p_chapter_id, v_viewer,
        case when v_viewer is null then p_anon_id else null end, v_today)
      on conflict do nothing;
    v_old := 0;
  end if;
  update public.chapter_views
    set active_seconds = least(active_seconds + v_seconds, v_cap)
    where chapter_id = p_chapter_id and viewer_key = v_key and viewed_on = v_today
    returning active_seconds into v_new;
  if v_new > v_old then
    perform public.refresh_story_popularity(v_story);
    return true;
  end if;
  return false; -- already at the cap
end $$;
grant execute on function public.record_chapter_dwell(uuid, uuid, integer) to anon, authenticated;

-- 3. refresh with read-through ------------------------------------------------
-- Same shape as Phase 1, plus reader_dwell: per reader, the average over
-- viewed published chapters of that chapter's best-day read-through
-- (max across days in the window, capped at 1). Depth becomes
-- 0.4 * completion + 0.3 * bonus + 0.3 * read-through.
-- CREATE OR REPLACE preserves the Phase 1 ACL, but the REVOKE is
-- re-asserted below so the internal function can never become
-- client-callable by accident.
create or replace function public.refresh_story_popularity(p_story_id uuid)
returns void language sql security definer set search_path = public as $$
  with total as (
    select count(*)::double precision as n from public.chapters
    where story_id = p_story_id and status = 'published'
  ),
  readers as (
    select distinct viewer_key from public.story_views
    where story_id = p_story_id
      and viewed_on >= (now() at time zone 'utc')::date - 30
  ),
  reader_chapters as (
    select cv.viewer_key,
      count(distinct cv.chapter_id)::double precision as chapters_read
    from public.chapter_views cv
    join public.chapters c on c.id = cv.chapter_id
    where c.story_id = p_story_id
      and c.status = 'published'
      and cv.viewed_on >= (now() at time zone 'utc')::date - 30
    group by cv.viewer_key
  ),
  reader_dwell as (
    select viewer_key, avg(chapter_rt) as avg_rt
    from (
      select cv.viewer_key, cv.chapter_id,
        max(case
          when exp.expected > 0 then least(cv.active_seconds::double precision, exp.expected) / exp.expected
          else 0 end) as chapter_rt
      from public.chapter_views cv
      join public.chapters c on c.id = cv.chapter_id
      join public.stories s on s.id = c.story_id
      join lateral (
        select case
          when c.word_count is null or c.word_count <= 0 then 0::double precision
          else c.word_count::double precision / (case when s.language = 'bn' then 180 else 220 end) * 60 end as expected
      ) exp on true
      where c.story_id = p_story_id
        and c.status = 'published'
        and cv.viewed_on >= (now() at time zone 'utc')::date - 30
      group by cv.viewer_key, cv.chapter_id
    ) per_chapter
    group by viewer_key
  ),
  per_reader as (
    select r.viewer_key,
      coalesce(rc.chapters_read, 0)::double precision as chapters_read,
      coalesce(rd.avg_rt, 0)::double precision as avg_rt
    from readers r
    left join reader_chapters rc on rc.viewer_key = r.viewer_key
    left join reader_dwell rd on rd.viewer_key = r.viewer_key
  ),
  agg as (
    select count(*)::double precision as readers,
      coalesce(avg(
        0.4 * coalesce(pr.chapters_read / nullif(t.n, 0), 0)
        + 0.3 * (pr.chapters_read / (pr.chapters_read + 3))
        + 0.3 * pr.avg_rt
      ), 0) as avg_depth
    from per_reader pr cross join total t
  )
  update public.stories s set popularity_score = (
    select case
      when t.n <= 0 then 0
      else agg.readers * (0.5 + 0.5 * agg.avg_depth)
    end
    from agg cross join total t
  )
  where s.id = p_story_id;
$$;
revoke all on function public.refresh_story_popularity(uuid) from public, anon, authenticated;

-- 4. backfill: scores recompute under the new blend ---------------------------
-- NOTE: with read-through 0 everywhere, the new blend is strictly below
-- the Phase 1 blend (0.4c + 0.3b vs 0.5c + 0.5b; difference -0.1c - 0.2b
-- <= 0), so backfilled scores DIP and no story rises without dwell.
-- They rise again only as genuine dwell accumulates. Ordering is
-- broadly preserved; the dip is expected, not a bug.
do $$
declare
  sid uuid;
begin
  for sid in select distinct story_id from public.story_views loop
    perform public.refresh_story_popularity(sid);
  end loop;
end $$;

commit;
