-- GolpoNeer: admin messages via notify_user().
--
-- Base: 20261024170000_notify_user_cooldown.sql verbatim (auth checks,
-- prefs gating, 1-hour cooldown unchanged) with ONE addition: a new
-- notification type 'admin_message' for founder/moderator messages to a
-- single user (title + body free text, optional internal link).
--
-- Design (v1):
-- - Caller must be a moderator or admin (same gate as the admin page).
-- - Title 1-200 chars, body 1-2000 chars, enforced here so a bad row
--   can never be inserted; the admin form also prevents empties.
-- - Prefs: admin_message has no CASE entry below, so the prefs check
--   passes (absent key = enabled) — admin messages are always delivered
--   by design in v1. A future opt-out is a client jsonb key + one CASE
--   line, no schema change.
-- - Cooldown: EXEMPT. Admin messages carry no storyId/target fields, so
--   the subject would fall back to '' and every second admin message to
--   the same user within the hour would be silently suppressed.
-- - Table constraint (Argon checkup fix): this file also widens
--   notifications_type_check to include 'admin_message' — without it
--   every insert would fail with 23514. All existing rows stay valid
--   (they carry one of the old 7 types, which stay allowed).
-- - Fail-closed guard (Argon checkup fix): the admin_message branch
--   coalesces a NULL v_role to '' so a caller with no profiles row is
--   rejected. The older branches keep their existing behavior, unchanged.

-- Widen the notifications CHECK constraint first (see header): the
-- constraint from 20261016130000 allows only the 7 original types.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'new_chapter', 'report_received', 'report_update',
    'content_hidden', 'content_restored',
    'appeal_submitted', 'appeal_decision', 'admin_message'
  ));

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
    'appeal_submitted', 'appeal_decision', 'admin_message'
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

  elsif p_type = 'admin_message' then
    -- Founder/admin message to one user (see header for the design).
    -- Fail closed: a caller with no profiles row leaves v_role NULL, and
    -- NULL NOT IN (...) is falsy, so coalesce to '' to force the raise.
    select role into v_role from public.profiles where id = v_caller;
    if coalesce(v_role, '') not in ('moderator', 'admin') then
      raise exception 'Only moderators may send this notification.';
    end if;
    if coalesce(char_length(btrim(p_data ->> 'title')), 0) < 1
      or char_length(p_data ->> 'title') > 200 then
      raise exception 'Message title must be 1-200 characters.';
    end if;
    if coalesce(char_length(btrim(p_data ->> 'body')), 0) < 1
      or char_length(p_data ->> 'body') > 2000 then
      raise exception 'Message body must be 1-2000 characters.';
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
  -- Exempt for admin_message: each admin message is intentional, and its
  -- subject would fall back to '' (no storyId/target fields), which would
  -- suppress every second admin message within the hour.
  if p_type <> 'admin_message' and exists (
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
