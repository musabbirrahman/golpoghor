-- GolpoNeer V4-27c: public Keepsake sharing + Open Graph groundwork.
--
-- Defaults applied here (all recorded in the Keepsakes policy draft):
-- * Licence withdrawal (COUNSEL GATE, unsettled in D4): the draft's
--   default — withdrawal blocks NEW publication immediately, but
--   already-public Keepsakes stay public until the author asks for
--   removal (takedown path) or a moderator restricts them. The
--   projection below implements exactly that: licence-basis rows are
--   grandfathered at read time, while publish time always re-checks
--   current coverage. Flipping to immediate restriction later means
--   changing one predicate in keepsakes_public() (see comment there).
-- * Verified public domain is a story-level flag, pd_verified, whose
--   evidence of record stays the rights tracker (GREEN rows). It is
--   backfilled true for the 16 tracker-GREEN classics only; every
--   other story defaults false. A tag alone never sets it.
-- * Public Keepsake slugs are opaque ('k-' + id prefix): share links
--   must not leak excerpt text into the URL, and Bangla excerpts do
--   not slugify safely in SQL.

alter table public.stories
  add column if not exists pd_verified boolean not null default false;

-- Tracker-GREEN classics only (rights tracker v3.1, GG-SL rows).
update public.stories set pd_verified = true where id in (
  '54f38a8a-239d-44ad-b9b6-3b44804cbfd2', -- কাবুলিওয়ালা (GG-SL-001)
  'c92dde30-067b-4f82-ae03-f93f9eb3e3ee', -- পোস্টমাস্টার (GG-SL-002)
  '563d7805-869c-43fe-af57-2593c09cbadd', -- ছুটি (GG-SL-003)
  '0ab5e31d-dd90-4682-905d-f734705f56f7', -- ক্ষুধিত পাষাণ (GG-SL-004)
  '7fb587e8-d0d8-4c98-b87d-68a71431a5eb', -- সমাপ্তি (GG-SL-005)
  'df8e437c-226e-4188-a9cb-0e0fce30ac23', -- কপালকুণ্ডলা (GG-SL-019)
  'cd8f2829-7a60-493b-9330-ffef6fea166d', -- আনন্দমঠ (GG-SL-020)
  '8fe255ea-d2a8-4f20-a67d-1efbbd6eb431', -- পথের পাঁচালী (GG-SL-015)
  '9e617bdf-c7b2-478d-9733-949657e9a699', -- The Open Window (GG-SL-107)
  'fdd099f5-ae37-4b62-88b6-6791dd99a2fc', -- The Gift of the Magi (GG-SL-101)
  'ef49b1ef-324f-4eb3-8f27-4b94f8561c7b', -- The Tell-Tale Heart (GG-SL-106)
  '0f48bf79-6a03-4f79-a9c5-b77256bc4d8b', -- The Last Leaf (GG-SL-102)
  '70848ec1-1b7d-4241-b8ad-5af318ffbcf5', -- The Bet (GG-SL-104)
  'b92e77ca-ccda-4b54-9b80-fc5e19cbb97b', -- An Occurrence at Owl Creek Bridge (GG-SL-109)
  'd868ab8f-a2e8-4705-8f8d-f3f9c5b91d9d', -- How Much Land Does a Man Need? (GG-SL-108)
  '8e358e64-3c62-4130-8ed8-3ccb9b175092'  -- The Adventure of the Speckled Band (GG-SL-110)
);

alter table public.keepsakes
  add column if not exists slug text;
create unique index if not exists keepsakes_slug_idx on public.keepsakes (slug) where slug is not null;

-- Keepsakes already public under 27a (own-story only) get slugs now, so
-- their public pages exist without a re-publish.
update public.keepsakes
  set slug = 'k-' || substr(id::text, 1, 8)
  where visibility = 'public' and slug is null;

-- Reports can now target Keepsakes (moderation takedown path).
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('story', 'chapter', 'comment', 'profile', 'keepsake'));

-- Moderators need to read a reported Keepsake (excerpt + status) to act
-- on it; owners keep full access, and there is still no anonymous or
-- non-owner path to the base table.
drop policy if exists keepsakes_moderator_read on public.keepsakes;
create policy keepsakes_moderator_read on public.keepsakes
  for select using (
    exists(select 1 from public.profiles
           where id = auth.uid() and role in ('moderator', 'admin'))
  );

-- Licence coverage: an unwithdrawn acceptance by the story's author.
create or replace function public.story_keepsake_covered(p_story_id uuid)
returns boolean language sql stable security definer as $$
  select exists(
    select 1 from public.story_keepsake_licence
    where story_id = p_story_id and withdrawn_at is null
  );
$$;

-- Restricted public projection, extended for 27c: slug + source link
-- fields, and the full K2 eligibility re-check at read time.
-- NOTE (withdrawal default): licence-basis rows are NOT re-checked
-- against current coverage here — under the draft default, withdrawal
-- stops new publication only. To switch to immediate restriction,
-- replace `k.eligibility_basis = 'licence'` below with
-- `public.story_keepsake_covered(s.id)`.
-- NOTE: the column list changed vs 27a, so the old function must be
-- dropped first — CREATE OR REPLACE cannot change a return type.
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
  published_at timestamptz,
  created_at timestamptz
)
language sql stable security definer as $$
  select k.id, k.slug, k.excerpt, k.template,
    case when k.echo_public then k.echo else null end,
    k.source_title, k.source_author_name, k.source_original_author,
    k.source_original_title, k.source_translator_name, k.source_adapter_name,
    k.source_edition, s.slug, p.username, k.published_at, k.created_at
  from public.keepsakes k
  join public.stories s on s.id = k.story_id
  join public.profiles p on p.id = s.author_id
  where k.visibility = 'public'
    and k.status = 'active'
    and public.story_is_public(s)
    and (
      k.owner_id = s.author_id
      or s.pd_verified
      or k.eligibility_basis = 'licence'
    );
$$;

-- Server-side publish with the full K2 matrix.
create or replace function public.publish_keepsake(p_keepsake_id uuid)
returns public.keepsakes language plpgsql security definer as $$
declare
  k public.keepsakes%rowtype;
  src public.stories%rowtype;
  basis text;
  new_slug text;
  attempts int := 0;
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
  if k.owner_id = src.author_id then
    basis := 'own-story';
  elsif src.pd_verified then
    basis := 'public-domain';
  elsif src.origin_type = 'original' and public.story_keepsake_covered(src.id) then
    basis := 'licence';
  elsif src.origin_type = 'original' then
    raise exception 'KEEPSAKE_NOT_ELIGIBLE_NO_LICENCE: this story is not covered by a Keepsake Sharing Licence acceptance.';
  else
    raise exception 'KEEPSAKE_NOT_ELIGIBLE_NOT_VERIFIED: this text has no verified public-domain determination.';
  end if;
  if k.slug is null then
    loop
      attempts := attempts + 1;
      new_slug := 'k-' || substr(k.id::text, 1, 8);
      if attempts > 1 then
        new_slug := new_slug || '-' || substr(md5(random()::text), 1, 4);
      end if;
      begin
        update public.keepsakes set slug = new_slug where id = p_keepsake_id;
        exit;
      exception when unique_violation then
        if attempts >= 5 then raise; end if;
      end;
    end loop;
  end if;
  update public.keepsakes
    set visibility = 'public',
        published_at = now(),
        eligibility_basis = basis,
        updated_at = now()
    where id = p_keepsake_id
    returning * into k;
  return k;
end;
$$;

-- Owner unpublish: revokes page + projection access on next read.
create or replace function public.unpublish_keepsake(p_keepsake_id uuid)
returns public.keepsakes language plpgsql security definer as $$
declare
  k public.keepsakes%rowtype;
begin
  select * into k from public.keepsakes where id = p_keepsake_id;
  if not found then
    raise exception 'KEEPSAKE_NOT_FOUND: no such keepsake.';
  end if;
  if k.owner_id <> auth.uid() then
    raise exception 'KEEPSAKE_NOT_OWNER: only the owner can unpublish a keepsake.';
  end if;
  update public.keepsakes
    set visibility = 'private', updated_at = now()
    where id = p_keepsake_id
    returning * into k;
  return k;
end;
$$;

-- Moderator restrict / restore (takedown path for reported Keepsakes).
create or replace function public.moderate_keepsake(p_keepsake_id uuid, p_status text)
returns public.keepsakes language plpgsql security definer as $$
declare
  k public.keepsakes%rowtype;
  caller_role text;
begin
  if p_status not in ('restricted', 'active') then
    raise exception 'KEEPSAKE_BAD_STATUS: status must be restricted or active.';
  end if;
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'moderator' and caller_role is distinct from 'admin' then
    raise exception 'KEEPSAKE_NOT_MODERATOR: moderators only.';
  end if;
  update public.keepsakes
    set status = p_status, updated_at = now()
    where id = p_keepsake_id
    returning * into k;
  if not found then
    raise exception 'KEEPSAKE_NOT_FOUND: no such keepsake.';
  end if;
  return k;
end;
$$;
