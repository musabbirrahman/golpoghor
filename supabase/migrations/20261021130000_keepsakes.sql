-- GolpoNeer V4-27a: Keepsakes — private data foundation.
--
-- A keepsake is a reader's private copy of a passage: the excerpt text plus
-- a creation-time snapshot of the source's attribution, so a later story
-- edit never rewrites a saved card's credits. Unknown credits are stored
-- as NULL, never fabricated.
--
-- Privacy model (plan §3 V4-27, revocation model):
--   * Base table: OWNER-ONLY RLS. No policy grants anonymous or
--     non-owner access at any visibility — there is no public read path
--     to the base table to revoke later.
--   * Public access (27c) goes ONLY through keepsakes_public(), a
--     SECURITY DEFINER function returning approved fields, evaluated at
--     read time: visibility = 'public' AND status = 'active' AND the
--     source story currently public. Unpublish / restrict / source
--     going private therefore takes effect on the next read.
--   * Echo is public only with its separate per-keepsake opt-in (K3):
--     the projection returns echo only when echo_public is true.
--   * Publish eligibility (K2) is enforced server-side in
--     publish_keepsake(). 27a covers the matrix as far as current data
--     allows: own-story publishing is eligible; other-author originals
--     need a recorded Keepsake Sharing Licence acceptance and verified
--     public-domain texts need a GREEN tracker determination — neither
--     record exists yet (V4-28 / 27c), so those paths raise
--     KEEPSAKE_NOT_ELIGIBLE with a plain reason instead of guessing.
--   * Private saving is available for any story the reader is
--     authorized to read: the source must be currently public, or the
--     caller must be its author (own drafts included). Enforced by the
--     keepsakes_source_readable trigger, mirrored in the demo provider.

create table public.keepsakes (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles (id) on delete cascade,
  story_id             uuid not null references public.stories (id) on delete cascade,
  chapter_id           uuid references public.chapters (id) on delete set null,
  excerpt              text not null check (char_length(excerpt) between 1 and 1000),
  template             text not null default 'classic-paper'
                         check (template in ('classic-paper', 'midnight', 'quiet-garden',
                                              'old-letters', 'modern-ink', 'neer')),
  echo                 text check (echo is null or char_length(echo) <= 2000),
  echo_public          boolean not null default false,
  visibility           text not null default 'private' check (visibility in ('private', 'public')),
  status               text not null default 'active' check (status in ('active', 'restricted')),
  -- creation-time source snapshot (attribution; never rewritten by story edits)
  source_title         text not null,
  source_author_name   text not null,
  source_original_author text,
  source_original_title  text,
  source_translator_name text,
  source_adapter_name    text,
  source_edition         text,
  published_at         timestamptz,
  eligibility_basis    text check (eligibility_basis is null
                         or eligibility_basis in ('own-story', 'licence', 'public-domain')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index keepsakes_owner_idx on public.keepsakes (owner_id, created_at desc);
create index keepsakes_story_idx on public.keepsakes (story_id);

alter table public.keepsakes enable row level security;

-- Owner-only: select / insert / update / delete. No anonymous policy.
create policy keepsakes_owner_select on public.keepsakes
  for select using (owner_id = auth.uid());
create policy keepsakes_owner_insert on public.keepsakes
  for insert with check (owner_id = auth.uid());
create policy keepsakes_owner_update on public.keepsakes
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy keepsakes_owner_delete on public.keepsakes
  for delete using (owner_id = auth.uid());

-- Private saving requires a readable source: currently public, or own story.
create or replace function public.keepsakes_source_readable()
returns trigger language plpgsql security definer as $$
declare
  src public.stories%rowtype;
begin
  select * into src from public.stories where id = new.story_id;
  if not found then
    raise exception 'KEEPSAKE_SOURCE_NOT_FOUND: the source story does not exist.';
  end if;
  if public.story_is_public(src) or src.author_id = auth.uid() then
    return new;
  end if;
  raise exception 'KEEPSAKE_SOURCE_NOT_READABLE: the source story is not readable by you.';
end;
$$;

create trigger keepsakes_source_readable
  before insert on public.keepsakes
  for each row execute function public.keepsakes_source_readable();

-- Restricted public projection (approved fields only, read-time checks).
-- Echo is exposed only with its per-keepsake opt-in (K3).
create or replace function public.keepsakes_public()
returns table (
  id uuid,
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
  published_at timestamptz,
  created_at timestamptz
)
language sql stable security definer as $$
  select k.id, k.excerpt, k.template,
    case when k.echo_public then k.echo else null end,
    k.source_title, k.source_author_name, k.source_original_author,
    k.source_original_title, k.source_translator_name, k.source_adapter_name,
    k.source_edition, k.published_at, k.created_at
  from public.keepsakes k
  join public.stories s on s.id = k.story_id
  where k.visibility = 'public'
    and k.status = 'active'
    and public.story_is_public(s);
$$;

-- Server-side publish with the K2 eligibility matrix (27a extent).
create or replace function public.publish_keepsake(p_keepsake_id uuid)
returns public.keepsakes language plpgsql security definer as $$
declare
  k public.keepsakes%rowtype;
  src public.stories%rowtype;
begin
  select * into k from public.keepsakes where id = p_keepsake_id;
  if not found then
    raise exception 'KEEPSAKE_NOT_FOUND: no such keepsake.';
  end if;
  if k.owner_id <> auth.uid() then
    raise exception 'KEEPSAKE_NOT_OWNER: only the owner can publish a keepsake.';
  end if;
  select * into src from public.stories where id = k.story_id;
  if not found or not public.story_is_public(src) then
    raise exception 'KEEPSAKE_SOURCE_NOT_PUBLIC: the source story is not public.';
  end if;
  -- 27a extent of the K2 matrix: own-story only. Licence coverage
  -- (other authors' originals) and GREEN tracker determinations
  -- (verified public-domain texts) arrive with V4-28 / 27c; until then
  -- those paths are denied rather than guessed.
  if src.author_id <> auth.uid() then
    raise exception 'KEEPSAKE_NOT_ELIGIBLE: publishing from this story needs a recorded licence or rights determination (V4-28 / 27c).';
  end if;
  update public.keepsakes
    set visibility = 'public',
        published_at = now(),
        eligibility_basis = 'own-story',
        updated_at = now()
    where id = p_keepsake_id
    returning * into k;
  return k;
end;
$$;
