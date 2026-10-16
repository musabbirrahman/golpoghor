-- GolpoGhor: restrict what moderators can change on stories.
--
-- The stories_moderator_hide RLS policy allows a moderator to UPDATE any
-- column of any story (title, summary, ...), not just flip status for
-- hide/restore. The app UI only exposes status changes, but the API did not
-- enforce that -- verified 2026-10-16 (moderator rewrote a title via SQL).
--
-- This trigger limits non-owner, non-admin writers to two safe patterns:
--   1. status-only changes (moderator hide / restore), and
--   2. view_count-only changes (the record_story_view() counter).
-- Owners keep full control, admins keep full control, and the database
-- superuser / service_role are exempt (migrations, backfills).
--
-- Residual: a moderator could still bump view_count directly (indistinguishable
-- from the counter). That is a minor integrity note, not a data leak; the
-- counter itself stays rate-limited by record_story_view().
--
-- Verified on PostgreSQL 16 (2026-10-16): moderator title rewrite blocked,
-- moderator hide/restore works, owner edits work, view counting works.

create or replace function public.restrict_story_moderator_columns()
returns trigger language plpgsql as $$
begin
  -- Owners, admins and the database itself: no restrictions.
  if old.author_id = auth.uid() then return new; end if;
  if public.is_admin() then return new; end if;
  if current_user in ('postgres', 'service_role') then return new; end if;

  -- Moderator hide/restore: only the status may change.
  if new.status is distinct from old.status
     and new.title          is not distinct from old.title
     and new.slug           is not distinct from old.slug
     and new.summary        is not distinct from old.summary
     and new.language       is not distinct from old.language
     and new.genre          is not distinct from old.genre
     and new.tags           is not distinct from old.tags
     and new.content_notice is not distinct from old.content_notice
     and new.cover_path     is not distinct from old.cover_path
     and new.author_id      is not distinct from old.author_id
     and new.view_count     is not distinct from old.view_count
     and new.published_at   is not distinct from old.published_at
  then
    return new;
  end if;

  -- View counter: only view_count may change.
  if new.view_count is distinct from old.view_count
     and new.status         is not distinct from old.status
     and new.title          is not distinct from old.title
     and new.slug           is not distinct from old.slug
     and new.summary        is not distinct from old.summary
     and new.language       is not distinct from old.language
     and new.genre          is not distinct from old.genre
     and new.tags           is not distinct from old.tags
     and new.content_notice is not distinct from old.content_notice
     and new.cover_path     is not distinct from old.cover_path
     and new.author_id      is not distinct from old.author_id
     and new.published_at   is not distinct from old.published_at
  then
    return new;
  end if;

  raise exception 'Moderators may only change a story''s status.';
end $$;

drop trigger if exists stories_moderator_columns on public.stories;
create trigger stories_moderator_columns before update on public.stories
  for each row execute function public.restrict_story_moderator_columns();
