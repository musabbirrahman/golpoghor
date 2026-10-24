-- GolpoNeer: R2-9 notification cooldown for notify_user().
--
-- Base: this file is 20261020220000_notify_user_respect_prefs.sql verbatim
-- (auth checks + prefs gating unchanged) with ONE addition: a per-subject
-- 1-hour cooldown before the INSERT. Same recipient + type + subject within
-- the hour -> silent return (same pattern as the prefs opt-out skip), so no
-- caller flow can break. The old "10 minutes" checks are anti-forgery, not
-- a rate limit: a caller who keeps filing, an author who keeps publishing,
-- or a moderator who toggles hide/restore could flood a recipient forever.
-- Subject: data->>'storyId' for new_chapter, else
-- targetType || ':' || targetLabel (or plain targetLabel) for the rest,
-- else '' (falls back to a type-only key). Accepted tradeoff (owner
-- decision 2026-10-24): a second reporter on the same target within the
-- hour gets no separate moderator alert; the report itself still lands in
-- the queue. Approved design: simple version, no sender_id column.

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

  -- R2-9 cooldown: same recipient + type + subject within 1 hour ->
  -- silent skip (alerts are nudges; the content stays visible in-app).
  if exists (
    select 1
    from public.notifications n
    where n.user_id = p_user_id
      and n.type = p_type
      and n.created_at > now() - interval '1 hour'
      and coalesce(n.data ->> 'storyId',
              nullif(concat_ws(':', n.data ->> 'targetType', n.data ->> 'targetLabel'), ''),
              n.data ->> 'targetLabel', '') =
          coalesce(p_data ->> 'storyId',
              nullif(concat_ws(':', p_data ->> 'targetType', p_data ->> 'targetLabel'), ''),
              p_data ->> 'targetLabel', '')
  ) then
    return;
  end if;

  insert into public.notifications (user_id, type, data, link)
    values (p_user_id, p_type, coalesce(p_data, '{}'), p_link);
end $$;

-- R2-9: lookup index for the cooldown check.
create index if not exists notifications_cooldown_idx
  on public.notifications (user_id, type, created_at desc);

-- Preserved across CREATE OR REPLACE, re-issued defensively: the function
-- stays executable by signed-in users, with a pinned search_path.
grant execute on function public.notify_user(uuid, text, jsonb, text) to authenticated;
alter function public.notify_user(uuid, text, jsonb, text) set search_path = public;
