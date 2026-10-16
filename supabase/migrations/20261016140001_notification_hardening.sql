-- GolpoGhor: harden notification creation.
--
-- Previously any signed-in client could INSERT notification rows directly
-- (MVP tradeoff). From here on, the permissive insert policy is dropped and
-- the SECURITY DEFINER function notify_user() is the only writer path.
-- The function validates, per notification type, that the caller is allowed
-- to trigger that notification — users can no longer forge notifications
-- for arbitrary content or recipients.
--
-- NOTE: structurally validated only — NOT executed against live Postgres here.

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

-- Drop the permissive client-side insert; the function above is now the
-- only way to create notifications.
drop policy if exists notifications_insert on public.notifications;

grant execute on function public.notify_user(uuid, text, jsonb, text) to authenticated;
