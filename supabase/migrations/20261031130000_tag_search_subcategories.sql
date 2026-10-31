-- Extend tag search to sub-categories (2026-10-31).
--
-- story_ids_with_tag() previously matched only the free-form tags column,
-- so the sub-category vocabulary (applied to the classics 2026-10-31) was
-- invisible to search: "psychological" found nothing even though stories
-- carry that sub-category. This keeps the same signature, the same
-- public-stories-only filter, and the same grants; it only adds a second
-- unnest check against subcategories. Both columns are already public on
-- story cards, so no new data is exposed. A space in the term also tries
-- the hyphenated form, so "warm romance" matches the stored id
-- "warm-romance". Replacing the function is atomic: on any error here the
-- previous version stays in place.
create or replace function public.story_ids_with_tag(p_term text)
returns setof uuid
language sql
stable
set search_path = public
as $$
  select s.id
  from public.stories s
  where s.status in ('ongoing', 'complete')
    and public.story_is_public(s)
    and (
      exists (
        select 1 from unnest(s.tags) as t
        where t ilike '%' || p_term || '%'
           or t ilike '%' || replace(p_term, ' ', '-') || '%'
      )
      or exists (
        select 1 from unnest(s.subcategories) as t
        where t ilike '%' || p_term || '%'
           or t ilike '%' || replace(p_term, ' ', '-') || '%'
      )
    )
$$;

grant execute on function public.story_ids_with_tag(text) to anon, authenticated;
