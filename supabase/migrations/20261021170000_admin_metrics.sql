-- GolpoNeer V4-12: admin health metrics.
--
-- story_views has no direct read policy by design (individual reader
-- records are never exposed), so the counts are served by this SECURITY
-- DEFINER function, which refuses anyone who is not a moderator/admin.
-- All other counts read existing tables only; no new table is created.
-- NOTE: structurally validated only — NOT executed against live Postgres here.

create or replace function public.get_admin_metrics()
returns jsonb language plpgsql security definer as $$
declare
  v_role text;
  v_today date := (now() at time zone 'utc')::date;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'moderator' and v_role is distinct from 'admin' then
    raise exception 'not_authorized';
  end if;
  return jsonb_build_object(
    'signups', (select count(*) from public.profiles),
    'storiesPublished', (select count(*) from public.stories where status in ('ongoing', 'complete')),
    'chaptersPublished', (select count(*) from public.chapters where status = 'published'),
    'views7d', (select count(*) from public.story_views where viewed_on >= v_today - 6),
    'views30d', (select count(*) from public.story_views where viewed_on >= v_today - 29),
    'openReports', (select count(*) from public.reports where status in ('open', 'in_review')),
    'appealsPending', (select count(*) from public.appeals where status = 'pending')
  );
end $$;

grant execute on function public.get_admin_metrics() to authenticated;
