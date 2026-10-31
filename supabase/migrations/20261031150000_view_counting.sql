-- GolpoNeer view counting Phase 1: anonymous views + chapter views + popularity score (Argon recheck pending)
-- Intended filename when approved: supabase/migrations/20261031150000_view_counting.sql
-- Argon verdict: NOT SAFE as drafted → SAFE WITH CHANGES (6 fixes, all applied below).
-- Design: ~/workspace/your_files/GolpoNeer-ViewCounting-Design-20261031.md
-- Counts stay hidden (never displayed). No IP address is stored, ever.
-- RLS stays enabled with NO policies on both view tables (function-only,
-- same pattern as the original story_views migration).
begin;

-- 1. story_views gains anonymous rows -------------------------------------
alter table public.story_views drop constraint story_views_pkey;
alter table public.story_views alter column viewer_id drop not null;
alter table public.story_views add column anon_id uuid;
alter table public.story_views add column viewer_key text generated always as (
  case when viewer_id is not null then 'u:' || viewer_id::text
       else 'a:' || anon_id::text end
) stored;
alter table public.story_views add constraint story_views_one_viewer_check
  check ((viewer_id is null) <> (anon_id is null));
alter table public.story_views add constraint story_views_pkey
  primary key (story_id, viewer_key, viewed_on);
create index story_views_viewer_day_idx
  on public.story_views (viewer_key, viewed_on);
-- validate-sql exemption: FUNCTION_ONLY:story_views (no direct policies by design)

-- 2. chapter_views (new, same shape, per chapter) --------------------------
create table public.chapter_views (
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  viewer_id  uuid references public.profiles (id) on delete cascade,
  anon_id    uuid,
  viewer_key text generated always as (
    case when viewer_id is not null then 'u:' || viewer_id::text
         else 'a:' || anon_id::text end
  ) stored,
  viewed_on  date not null,
  created_at timestamptz not null default now(),
  constraint chapter_views_one_viewer_check
    check ((viewer_id is null) <> (anon_id is null)),
  constraint chapter_views_pkey primary key (chapter_id, viewer_key, viewed_on)
);
create index chapter_views_chapter_idx on public.chapter_views (chapter_id);
create index chapter_views_viewer_day_idx
  on public.chapter_views (viewer_key, viewed_on);
alter table public.chapter_views enable row level security;
-- validate-sql exemption: FUNCTION_ONLY:chapter_views (no direct policies by design)

-- 3. popularity score column ------------------------------------------------
alter table public.stories add column popularity_score double precision not null default 0;

-- 4. score refresh (internal: SECURITY DEFINER, NO grants) ------------------
-- Trailing 30-day window. readers = distinct viewer_keys with a story view.
-- depth per reader = 0.5 * (chapters_read / total_published_chapters)
--                  + 0.5 * (chapters_read / (chapters_read + 3))
-- score = readers * (0.5 + 0.5 * avg_depth), or 0 when total_published_chapters = 0.
create function public.refresh_story_popularity(p_story_id uuid)
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
  per_reader as (
    select r.viewer_key,
      coalesce(rc.chapters_read, 0)::double precision as chapters_read
    from readers r
    left join reader_chapters rc on rc.viewer_key = r.viewer_key
  ),
  agg as (
    select count(*)::double precision as readers,
      coalesce(avg(
        0.5 * coalesce(pr.chapters_read / nullif(t.n, 0), 0)
        + 0.5 * (pr.chapters_read / (pr.chapters_read + 3))
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

-- 5. story recorder (rewrite: new defaulted parameter changes the signature,
-- so DROP + CREATE in this same transaction; the function is never missing)
drop function if exists public.record_story_view(uuid);
create function public.record_story_view(p_story_id uuid, p_anon_id uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_viewer uuid := auth.uid();
  v_key text;
  v_author uuid;
  v_status text;
  v_today date := (now() at time zone 'utc')::date;
  v_day_count integer;
begin
  -- Signed-in callers ALWAYS use their account id; a supplied anon id is
  -- ignored when signed in, so an author cannot dodge self-exclusion.
  if v_viewer is not null then
    v_key := 'u:' || v_viewer::text;
  elsif p_anon_id is not null then
    v_key := 'a:' || p_anon_id::text;
  else
    return false; -- no viewer at all (should not happen: client always sends one)
  end if;
  select author_id, status into v_author, v_status
    from public.stories where id = p_story_id;
  if not found then
    return false;
  end if;
  if v_viewer is not null and v_author = v_viewer then
    return false; -- authors don't count views on their own stories
  end if;
  if v_status not in ('ongoing', 'complete') then
    return false; -- drafts / hidden / removed never count
  end if;
  if not exists (
    select 1 from public.chapters
    where story_id = p_story_id and status = 'published'
  ) then
    return false; -- unpublished stories never count
  end if;
  -- Serialize cap check + insert per viewer_key (zero cross-viewer contention).
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select count(*) into v_day_count from public.story_views
    where viewer_key = v_key and viewed_on = v_today;
  if v_day_count >= 100 then
    return false;
  end if;

  insert into public.story_views (story_id, viewer_id, anon_id, viewed_on)
    values (p_story_id, v_viewer,
      case when v_viewer is null then p_anon_id else null end, v_today)
    on conflict do nothing;

  if found then
    update public.stories set view_count = view_count + 1 where id = p_story_id;
    perform public.refresh_story_popularity(p_story_id);
    return true;
  end if;
  return false; -- already counted today
end $$;
grant execute on function public.record_story_view(uuid, uuid) to anon, authenticated;

-- 6. chapter recorder (new, same guards) ------------------------------------
create function public.record_chapter_view(p_chapter_id uuid, p_anon_id uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_viewer uuid := auth.uid();
  v_key text;
  v_story uuid;
  v_chapter_status text;
  v_author uuid;
  v_status text;
  v_today date := (now() at time zone 'utc')::date;
  v_day_count integer;
begin
  if v_viewer is not null then
    v_key := 'u:' || v_viewer::text;
  elsif p_anon_id is not null then
    v_key := 'a:' || p_anon_id::text;
  else
    return false;
  end if;
  select story_id, status into v_story, v_chapter_status
    from public.chapters where id = p_chapter_id;
  if not found then
    return false;
  end if;
  if v_chapter_status <> 'published' then
    return false; -- draft / hidden chapters never count
  end if;
  select author_id, status into v_author, v_status
    from public.stories where id = v_story;
  if not found then
    return false;
  end if;
  if v_viewer is not null and v_author = v_viewer then
    return false;
  end if;
  if v_status not in ('ongoing', 'complete') then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select count(*) into v_day_count from public.chapter_views
    where viewer_key = v_key and viewed_on = v_today;
  if v_day_count >= 50 then
    return false;
  end if;

  insert into public.chapter_views (chapter_id, viewer_id, anon_id, viewed_on)
    values (p_chapter_id, v_viewer,
      case when v_viewer is null then p_anon_id else null end, v_today)
    on conflict do nothing;

  if found then
    perform public.refresh_story_popularity(v_story);
    return true;
  end if;
  return false; -- already counted today
end $$;
grant execute on function public.record_chapter_view(uuid, uuid) to anon, authenticated;

-- 7. backfill: scores for every story with existing view rows ----------------
do $$
declare
  sid uuid;
begin
  for sid in select distinct story_id from public.story_views loop
    perform public.refresh_story_popularity(sid);
  end loop;
end $$;

commit;
