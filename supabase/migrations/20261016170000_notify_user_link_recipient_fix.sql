-- GolpoGhor: close notification phishing + spam gaps in notify_user(),
-- plus a report-spam guard.
--
-- Two gaps remained after the 20261016140001 hardening:
--
-- 1. PHISHING VIA LINK (confirmed): p_link was free text and the inbox renders
--    it with <Link to={link}>. An external URL (https://evil.example/...) in a
--    "new_chapter" notification becomes a clickable in-app link that looks like
--    an official GolpoGhor alert. Any author could phish any user via direct
--    RPC. Fix: links must be null or internal (a single leading '/'; '//'
--    protocol-relative URLs are rejected too). Every link the app generates is
--    internal (verified 2026-10-16), so legitimate flows are unaffected.
--
-- 2. SPAM TO ARBITRARY USERS (confirmed): new_chapter accepted any recipient,
--    so an author could notify users who never followed them -- including users
--    who disabled new-chapter notifications. Fix: the recipient must follow
--    the caller. The app only notifies followers, so legitimate flows work.
--
-- Verified on PostgreSQL 16 (2026-10-16): legit follower+internal-link call
-- succeeds; external link and non-follower recipient are rejected.

-- One open report per reporter per target: stops queue flooding / alert spam
-- via repeated reports on the same content. Re-reporting after a decision
-- (dismissed/resolved) stays allowed.
create unique index if not exists reports_one_open_per_reporter_target
  on public.reports (reporter_id, target_type, target_id)
  where status = 'open';

create or replace function public.notify_user(
  p_user_id uuid,
  p_type text,
  p_data jsonb,
  p_link text
)
returns void language plpgsql security definer as $$
declare
  v_caller uuid := auth.uid();
  v_role text;
begin
  if v_caller is null then
    raise exception 'Sign in required.';
  end if;
  if p_type not in (
    'new_chapter', 'report_received', 'report_update',
    'content_hidden', 'content_restored',
    'appeal_submitted', 'appeal_decision'
  ) then
    raise exception 'Unknown notification type.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Unknown notification recipient.';
  end if;

  -- Links must stay inside the app (the inbox renders them as-is).
  if p_link is not null and (p_link not like '/%' or p_link like '//%') then
    raise exception 'Notification links must be internal.';
  end if;

  if p_type = 'new_chapter' then
    -- Only the story's author may announce a new chapter, and the chapter
    -- must really be theirs and published.
    if not exists (
      select 1 from public.stories s
        join public.chapters c on c.story_id = s.id
      where s.id = (p_data ->> 'storyId')::uuid
        and s.author_id = v_caller
        and c.slug = p_data ->> 'chapterSlug'
        and c.status = 'published'
    ) then
      raise exception 'Not authorized to announce this chapter.';
    end if;
    -- ... and only to readers who actually follow the author.
    if not exists (
      select 1 from public.follows
      where follower_id = p_user_id and author_id = v_caller
    ) then
      raise exception 'New-chapter alerts may only go to followers.';
    end if;

  elsif p_type in ('report_received', 'appeal_submitted') then
    -- Filed by a reader/writer, delivered to moderators. The recipient must
    -- be a moderator, and the caller must have filed something recently
    -- (stops forged alert spam).
    if not exists (
      select 1 from public.profiles where id = p_user_id and role in ('moderator', 'admin')
    ) then
      raise exception 'Alerts may only target moderators.';
    end if;
    if p_type = 'report_received'
      and not exists (
        select 1 from public.reports
        where reporter_id = v_caller and created_at > now() - interval '10 minutes'
      ) then
      raise exception 'No recent report from this caller.';
    end if;
    if p_type = 'appeal_submitted'
      and not exists (
        select 1 from public.appeals
        where author_id = v_caller and created_at > now() - interval '10 minutes'
      ) then
      raise exception 'No recent appeal from this caller.';
    end if;

  elsif p_type in ('report_update', 'content_hidden', 'content_restored', 'appeal_decision') then
    -- Moderation outcomes may only be announced by moderators.
    select role into v_role from public.profiles where id = v_caller;
    if v_role not in ('moderator', 'admin') then
      raise exception 'Only moderators may send this notification.';
    end if;
  end if;

  insert into public.notifications (user_id, type, data, link)
    values (p_user_id, p_type, coalesce(p_data, '{}'), p_link);
end $$;
