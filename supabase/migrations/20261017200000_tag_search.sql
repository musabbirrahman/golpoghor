-- Tag-aware search helper for the live provider.
-- PostgREST cannot do partial ILIKE matches on text[] columns, so the app
-- calls this function to find public stories whose tags partially match
-- a search term (case-insensitive), mirroring the demo provider's behavior.
--
-- Security: runs as the caller (security invoker, the default), so RLS
-- applies. It additionally filters to public, published stories via
-- story_is_public() + status check, so drafts, hidden, and private stories
-- can never leak through this function.

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
    and exists (
      select 1
      from unnest(s.tags) as t
      where t ilike '%' || p_term || '%'
    )
$$;

-- Allow the anon/authenticated roles to call it (RLS on stories still applies).
grant execute on function public.story_ids_with_tag(text) to anon, authenticated;
