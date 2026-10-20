-- GolpoNeer: enforce notification preferences inside notify_user().
--
-- Bug (proven live, V4 M1 end-to-end test, 2026-10-20): a follower who
-- turned OFF "New chapters from followed authors" still received the
-- new-chapter notification. The preference check lived in the sender's
-- client (supabase-provider notifyFollowersOfChapter): it reads each
-- follower's row from public.notification_prefs, but that table is
-- owner-only via RLS (migration 20261017210000), so the author's session
-- sees no rows and resolveNotificationPrefs() defaults everyone to ON.
-- Demo mode has no RLS, so local tests could not catch this.
--
-- Fix: gate delivery here. notify_user() is SECURITY DEFINER, so it can
-- read the recipient's prefs past RLS. Mapping (type -> pref key) mirrors
-- NotificationPrefs in the app:
--   new_chapter                      -> new_chapter
--   report_update                    -> report_updates
--   content_hidden / content_restored / appeal_decision -> moderation_updates
--   report_received / appeal_submitted                 -> moderator_alerts
-- A missing prefs row or a missing key means ON (the app's default).
-- An opted-out delivery is skipped silently (return, never raise), so one
-- follower's opt-out cannot break the author's publish flow. All existing
-- authorization checks from 20261016170000 are unchanged.

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

  -- Respect the recipient's notification preferences (see header). Runs
  -- after every authorization check, so an opted-out recipient who was
  -- never entitled to the alert still gets the authorization error path's
  -- behavior for entitled types; entitled + opted out = silent skip.
  if exists (
    select 1
    from public.notification_prefs np
    where np.user_id = p_user_id
      and (np.prefs ->> case p_type
              when 'new_chapter'      then 'new_chapter'
              when 'report_update'    then 'report_updates'
              when 'content_hidden'   then 'moderation_updates'
              when 'content_restored' then 'moderation_updates'
              when 'appeal_decision'  then 'moderation_updates'
              when 'report_received'  then 'moderator_alerts'
              when 'appeal_submitted' then 'moderator_alerts'
            end) = 'false'
  ) then
    return;
  end if;

  insert into public.notifications (user_id, type, data, link)
    values (p_user_id, p_type, coalesce(p_data, '{}'), p_link);
end $$;
