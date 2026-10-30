-- Fix for the 20261030150000 maker-keepsakes migration (follow-up).
--
-- What was missed: keepsakes has TWO insert-time story lookups, not
-- one. 20261030150000 taught keepsakes_source_readable() to let
-- story-less rows through, but the Round 2 column guard
-- keepsakes_guard_columns() ALSO derives attribution from the story
-- on every insert — and raises KEEPSAKE_SOURCE_NOT_FOUND (SQLSTATE
-- P0001, the raw code users saw) when no story matches. A NULL
-- story_id matches nothing, so every maker save failed even with
-- the first migration applied.
--
-- The fix keeps every guard protection and skips ONLY the story
-- lookup for story-less rows: the forced columns (visibility
-- private, status active, slug / published_at / eligibility NULL)
-- still apply to maker rows, and the client-sent snapshot
-- (Untitled-or-title + the saver's display name) stands, since
-- there is no story to derive it from. The UPDATE branch
-- (readonly comparison) is untouched, and the function stays
-- SECURITY INVOKER exactly as Round 2 wrote it — no search_path
-- clause, no definer change. The trigger itself is not re-created;
-- replacing the function keeps it attached.

create or replace function public.keepsakes_guard_columns()
returns trigger language plpgsql as $$
begin
  if current_setting('app.keepsake_guard_bypass', true) = 'on' then
    return new;
  end if;
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if TG_OP = 'INSERT' then
    new.visibility := 'private';
    new.status := 'active';
    new.slug := null;
    new.published_at := null;
    new.eligibility_basis := null;
    if new.story_id is null then
      return new;
    end if;
    select s.title, p.display_name, s.original_author, s.original_title,
           s.translator_name, s.adapter_name, s.edition_source
      into new.source_title, new.source_author_name, new.source_original_author,
           new.source_original_title, new.source_translator_name,
           new.source_adapter_name, new.source_edition
      from public.stories s
      join public.profiles p on p.id = s.author_id
      where s.id = new.story_id;
    if not found then
      raise exception 'KEEPSAKE_SOURCE_NOT_FOUND: the source story does not exist.';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - 'excerpt' - 'template' - 'echo' - 'echo_public' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'excerpt' - 'template' - 'echo' - 'echo_public' - 'updated_at')
  then
    raise exception 'KEEPSAKE_READONLY: visibility, status, slug, eligibility and attribution may only change through publish_keepsake, unpublish_keepsake or moderate_keepsake.';
  end if;
  return new;
end;
$$;
