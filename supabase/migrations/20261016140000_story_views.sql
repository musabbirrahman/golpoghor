-- GolpoGhor: real story view tracking.
--
-- One row per (story, viewer, UTC date) gives at-most-once-per-day
-- deduplication at the database level. No IP addresses are stored; only
-- signed-in readers are counted. Individual reader records are never
-- exposed: there are deliberately NO select/insert/update/delete policies
-- on this table — all recording goes through record_story_view() below,
-- which also enforces the no-self-view / public-only rules.
--
-- NOTE: structurally validated only — NOT executed against live Postgres here.

create table public.story_views (
  story_id   uuid not null references public.stories (id) on delete cascade,
  viewer_id  uuid not null references public.profiles (id) on delete cascade,
  viewed_on  date not null,
  created_at timestamptz not null default now(),
  constraint story_views_pkey primary key (story_id, viewer_id, viewed_on)
);
create index story_views_story_idx on public.story_views (story_id);

alter table public.story_views enable row level security;
-- validate-sql exemption: FUNCTION_ONLY:story_views (no direct policies by design)

-- Trusted recorder. SECURITY DEFINER so it can write the view row and bump
-- the denormalized counter without exposing reader records via RLS.
-- Returns true when the view was counted, false otherwise.
create or replace function public.record_story_view(p_story_id uuid)
returns boolean language plpgsql security definer as $$
declare
  v_viewer uuid := auth.uid();
  v_author uuid;
  v_status text;
begin
  if v_viewer is null then
    return false; -- guests are not tracked (no IP storage)
  end if;
  select author_id, status into v_author, v_status
    from public.stories where id = p_story_id;
  if not found then
    return false;
  end if;
  if v_author = v_viewer then
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

  insert into public.story_views (story_id, viewer_id, viewed_on)
    values (p_story_id, v_viewer, (now() at time zone 'utc')::date)
    on conflict do nothing;

  if found then
    update public.stories set view_count = view_count + 1 where id = p_story_id;
    return true;
  end if;
  return false; -- already counted today
end $$;

grant execute on function public.record_story_view(uuid) to authenticated;
