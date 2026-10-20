-- GolpoNeer V4-17: server-side write throttles.
-- Per-user trailing-hour limits enforced by BEFORE INSERT triggers, so no
-- client (ours or anyone else's) can flood comments or the report queue:
--   comments: 30 per hour per author   (data-provider.ts WRITE_THROTTLE)
--   reports:  10 per hour per reporter (data-provider.ts WRITE_THROTTLE)
-- Hitting the limit raises RATE_LIMITED, which the app renders as a
-- friendly "slow down" message. Normal use never comes close.

create index if not exists comments_author_created_idx
  on public.comments (author_id, created_at);
create index if not exists reports_reporter_created_idx
  on public.reports (reporter_id, created_at);

create or replace function public.throttle_comments()
returns trigger language plpgsql security definer as $$
begin
  if (select count(*) from public.comments
      where author_id = new.author_id
        and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'RATE_LIMITED: Too many comments in the last hour. Please wait a while before commenting again.';
  end if;
  return new;
end $$;

drop trigger if exists comments_throttle on public.comments;
create trigger comments_throttle
  before insert on public.comments
  for each row execute function public.throttle_comments();

create or replace function public.throttle_reports()
returns trigger language plpgsql security definer as $$
begin
  if (select count(*) from public.reports
      where reporter_id = new.reporter_id
        and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMITED: Too many reports in the last hour. Please wait a while before reporting again.';
  end if;
  return new;
end $$;

drop trigger if exists reports_throttle on public.reports;
create trigger reports_throttle
  before insert on public.reports
  for each row execute function public.throttle_reports();
