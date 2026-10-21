-- GolpoNeer keeper credit (27c follow-up): public Keepsake cards and
-- the shelf show who kept the passage — but ONLY for public Keepsakes.
-- Private cards never carry a keeper line (the owner downloading their
-- own card needs no credit line). The keeper name is the owner's public
-- display name (already visible on author pages) — no other owner data
-- enters the public projection.
--
-- NOTE: keepsakes_public() gains a column vs 27c, so it must be dropped
-- first (same 42P13 lesson as 27c: CREATE OR REPLACE cannot change a
-- return type).

drop function if exists public.keepsakes_public();
create or replace function public.keepsakes_public()
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
  created_at timestamptz
)
language sql stable security definer as $$
  select k.id, k.slug, k.excerpt, k.template,
    case when k.echo_public then k.echo else null end,
    k.source_title, k.source_author_name, k.source_original_author,
    k.source_original_title, k.source_translator_name, k.source_adapter_name,
    k.source_edition, s.slug, p.username, o.display_name, k.published_at, k.created_at
  from public.keepsakes k
  join public.stories s on s.id = k.story_id
  join public.profiles p on p.id = s.author_id
  join public.profiles o on o.id = k.owner_id
  where k.visibility = 'public'
    and k.status = 'active'
    and public.story_is_public(s)
    and (
      k.owner_id = s.author_id
      or s.pd_verified
      or k.eligibility_basis = 'licence'
    );
$$;
