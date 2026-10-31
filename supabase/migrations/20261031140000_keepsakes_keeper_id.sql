-- Author Keepsakes tab: expose the keeper's id in the public projection
-- so author pages can list an author's own public keepsakes.
-- Return-type change (17 -> 18 columns) requires DROP + CREATE;
-- wrapped in one transaction so the function is never missing.
-- The function never had explicit grants (default PUBLIC execute);
-- its WHERE clause is the access control, unchanged below.
-- Argon verdict on the draft (2026-10-31): SAFE.
begin;
drop function if exists public.keepsakes_public();
create function public.keepsakes_public()
returns table (
  id uuid,
  slug text,
  excerpt text,
  template text,
  echo text,
  source_title text,
  source_author_name text,
  source_original_author text,
  source_original_title text,
  source_translator_name text,
  source_adapter_name text,
  source_edition text,
  source_slug text,
  source_author_username text,
  keeper_name text,
  published_at timestamptz,
  created_at timestamptz,
  keeper_id uuid
)
language sql stable security definer set search_path = public as $$
  select k.id, k.slug, k.excerpt, k.template,
    case when k.echo_public then k.echo else null end,
    k.source_title, k.source_author_name, k.source_original_author,
    k.source_original_title, k.source_translator_name, k.source_adapter_name,
    k.source_edition, s.slug, p.username, o.display_name, k.published_at, k.created_at,
    k.owner_id
  from public.keepsakes k
  join public.stories s on s.id = k.story_id
  join public.profiles p on p.id = s.author_id
  join public.profiles o on o.id = k.owner_id
  where k.visibility = 'public'
    and k.status = 'active'
    and public.story_is_public(s)
    and (
      (k.owner_id = s.author_id and coalesce(s.origin_type, 'original') = 'original')
      or s.pd_verified
      or (coalesce(s.origin_type, 'original') = 'original' and k.eligibility_basis = 'licence')
    );
$$;
commit;
